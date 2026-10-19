import Foundation

private struct HudVoxRPCRequest: Encodable {
    let id: String
    let method: String
    let params: [String: HudJSONValue]?
}

private struct HudVoxRPCMessage: Decodable {
    let id: String?
    let event: String?
    let data: [String: HudJSONValue]?
    let result: [String: HudJSONValue]?
    let error: HudJSONValue?
}

public enum HudVoxError: Error, LocalizedError, Equatable {
    case alreadyStarted
    case notStarted
    case invalidMessage
    case provider(String)

    public var errorDescription: String? {
        switch self {
        case .alreadyStarted:
            return "Vox live session is already started."
        case .notStarted:
            return "Vox live session has not started."
        case .invalidMessage:
            return "Vox returned a message HudsonVoice could not decode."
        case .provider(let message):
            return message
        }
    }
}

/// Native HudsonKit adapter for Vox's local WebSocket JSON-RPC daemon.
///
/// This deliberately depends on the Vox wire contract instead of the Vox Swift
/// package so HudsonKit can stay on its lower platform/toolchain baseline.
public final class HudVoxLiveSession: @unchecked Sendable {
    public let endpoint: HudVoxEndpoint
    public let options: HudVoxLiveSessionOptions

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private let lock = NSLock()
    private var task: HudVoiceWebSocket?
    private var streamContinuation: AsyncThrowingStream<HudVoiceEvent, Error>.Continuation?
    private var sessionId: String?
    private var started = false

    public init(endpoint: HudVoxEndpoint = HudVoxEndpoint(), options: HudVoxLiveSessionOptions = HudVoxLiveSessionOptions()) {
        self.endpoint = endpoint
        self.options = options
    }

    public var id: String? {
        locked { sessionId }
    }

    public func start() async throws -> AsyncThrowingStream<HudVoiceEvent, Error> {
        let webSocket = HudVoiceWebSocket(endpoint: endpoint, token: options.authToken)
        let stream = try prepareStart(webSocket: webSocket)

        webSocket.resume()
        Task { [weak self] in
            await self?.receiveLoop()
        }

        try await send(method: "transcribe.startSession", params: options.rpcParams)
        return stream
    }

    public func stop() async throws {
        let currentId = id
        var params: [String: HudJSONValue] = ["clientId": .string(options.clientId)]
        if let currentId {
            params["sessionId"] = .string(currentId)
        }
        if let authToken = options.authToken, !authToken.isEmpty {
            params["authToken"] = .string(authToken)
        }
        try await send(method: "transcribe.stopSession", params: params)
    }

    public func cancel() async throws {
        let currentId = id
        var params: [String: HudJSONValue] = ["clientId": .string(options.clientId)]
        if let currentId {
            params["sessionId"] = .string(currentId)
        }
        if let authToken = options.authToken, !authToken.isEmpty {
            params["authToken"] = .string(authToken)
        }
        try await send(method: "transcribe.cancelSession", params: params)
        close()
    }

    public func close() {
        lock.lock()
        let webSocket = task
        task = nil
        started = false
        let continuation = streamContinuation
        streamContinuation = nil
        lock.unlock()

        webSocket?.cancel(with: .normalClosure, reason: nil)
        continuation?.finish()
    }

    private func send(method: String, params: [String: HudJSONValue]?) async throws {
        let webSocket = locked { task }
        guard let webSocket else {
            throw HudVoxError.notStarted
        }

        let request = HudVoxRPCRequest(id: UUID().uuidString, method: method, params: params)
        let data = try encoder.encode(request)
        guard let text = String(data: data, encoding: .utf8) else {
            throw HudVoxError.invalidMessage
        }
        try await webSocket.send(.string(text))
    }

    private func receiveLoop() async {
        while true {
            let webSocket = locked { task }
            guard let webSocket else { return }

            do {
                let message = try await webSocket.receive()
                try handle(message)
            } catch {
                finish(error)
                return
            }
        }
    }

    private func prepareStart(webSocket: HudVoiceWebSocket) throws -> AsyncThrowingStream<HudVoiceEvent, Error> {
        try locked {
            guard !started else {
                throw HudVoxError.alreadyStarted
            }

            started = true
            task = webSocket
        }

        return AsyncThrowingStream<HudVoiceEvent, Error> { continuation in
            self.locked {
                self.streamContinuation = continuation
            }

            continuation.onTermination = { [weak self] _ in
                self?.close()
            }
        }
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) throws {
        let data: Data
        switch message {
        case .string(let text):
            guard let encoded = text.data(using: .utf8) else {
                throw HudVoxError.invalidMessage
            }
            data = encoded
        case .data(let payload):
            data = payload
        @unknown default:
            throw HudVoxError.invalidMessage
        }

        let payload = try decoder.decode(HudVoxRPCMessage.self, from: data)

        if let error = payload.error {
            finish(HudVoxError.provider(error.stringValue ?? String(describing: error)))
            return
        }

        if let event = payload.event, let data = payload.data {
            emit(event: event, data: data)
            return
        }

        if let result = payload.result, result.string("text") != nil {
            emit(event: "session.final", data: result)
        }
    }

    private func emit(event: String, data: [String: HudJSONValue]) {
        let mapped: HudVoiceEvent
        switch event {
        case "session.state":
            let state = HudVoiceSessionState(rawValue: data.string("state") ?? "") ?? .error
            let previous = data.string("previous").flatMap(HudVoiceSessionState.init(rawValue:))
            let payload = HudVoiceSessionStateEvent(
                sessionId: data.string("sessionId") ?? id ?? "",
                state: state,
                previous: previous
            )
            remember(sessionId: payload.sessionId)
            mapped = .state(payload)
        case "session.partial":
            let payload = HudVoicePartialEvent(
                sessionId: data.string("sessionId") ?? id ?? "",
                text: data.string("text") ?? ""
            )
            remember(sessionId: payload.sessionId)
            mapped = .partial(payload)
        case "session.final":
            let payload = HudVoiceFinalEvent(
                sessionId: data.string("sessionId") ?? id ?? "",
                text: data.string("text") ?? "",
                elapsedMs: data.int("elapsedMs") ?? 0,
                utteranceIndex: data.int("utteranceIndex"),
                metrics: data.object("metrics") ?? [:],
                words: HudVoiceWordTiming.parseMany(data["words"])
            )
            remember(sessionId: payload.sessionId)
            mapped = .final(payload)
        default:
            mapped = .raw(name: event, data: data)
        }

        lock.lock()
        let continuation = streamContinuation
        lock.unlock()
        continuation?.yield(mapped)
    }

    private func remember(sessionId: String) {
        guard !sessionId.isEmpty else { return }
        locked {
            self.sessionId = sessionId
        }
    }

    private func finish(_ error: Error? = nil) {
        lock.lock()
        let continuation = streamContinuation
        streamContinuation = nil
        let webSocket = task
        task = nil
        started = false
        lock.unlock()

        webSocket?.cancel(with: .normalClosure, reason: nil)
        if let error {
            continuation?.finish(throwing: error)
        } else {
            continuation?.finish()
        }
    }

    @discardableResult
    private func locked<T>(_ body: () throws -> T) rethrows -> T {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }
}
