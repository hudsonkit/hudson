import Foundation

/// A single message contract for explicit TCP endpoints and private capability
/// endpoints. Private mode never creates a TCP connection.
final class HudVoiceWebSocket: @unchecked Sendable {
    private let tcp: URLSessionWebSocketTask?
    private let unix: HudVoiceUnixWebSocket?
    private let inbox: VoiceMessageInbox
    private let lock = NSLock()
    private var connecting: Task<Void, Error>?

    init(endpoint: HudVoxEndpoint, token: String?) {
        let inbox = VoiceMessageInbox(); self.inbox = inbox
        if let path = endpoint.socketPath {
            tcp = nil
            unix = HudVoiceUnixWebSocket(path: path, token: token ?? "", receive: { inbox.append($0) }, failed: { inbox.finish(POSIXError(.ECONNRESET)) })
        } else {
            unix = nil
            tcp = URLSession.shared.webSocketTask(with: endpoint.url)
        }
    }

    func resume() {
        lock.lock(); defer { lock.unlock() }
        if let unix, connecting == nil { connecting = Task { try await unix.connect() } }
        tcp?.resume()
    }

    private func connection() -> Task<Void, Error>? {
        lock.lock(); defer { lock.unlock() }; return connecting
    }

    func send(_ message: URLSessionWebSocketTask.Message) async throws {
        if let tcp { try await tcp.send(message); return }
        guard let unix, let connecting = connection() else { throw POSIXError(.ENOTCONN) }
        try await connecting.value
        switch message {
        case .string(let text): try await unix.send(Data(text.utf8))
        case .data(let data): try await unix.send(data)
        @unknown default: throw POSIXError(.EPROTO)
        }
    }

    func receive() async throws -> URLSessionWebSocketTask.Message {
        if let tcp { return try await tcp.receive() }
        guard let connecting = connection() else { throw POSIXError(.ENOTCONN) }
        try await connecting.value
        return .data(try await inbox.next())
    }

    func cancel(with code: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        tcp?.cancel(with: code, reason: reason)
        unix?.close(); inbox.finish(POSIXError(.ECANCELED))
    }
}

private final class VoiceMessageInbox: @unchecked Sendable {
    private let lock = NSLock()
    private var messages: [Data] = []
    private var byteCount = 0
    private var pending: CheckedContinuation<Data, Error>?
    private var error: Error?

    func append(_ data: Data) {
        lock.lock()
        guard error == nil else { lock.unlock(); return }
        if let pending { self.pending = nil; lock.unlock(); pending.resume(returning: data); return }
        guard byteCount + data.count <= 32 * 1024 * 1024, messages.count < 256 else {
            error = POSIXError(.ENOBUFS); lock.unlock(); return
        }
        messages.append(data); byteCount += data.count; lock.unlock()
    }

    func next() async throws -> Data {
        try await withCheckedThrowingContinuation { continuation in
            lock.lock()
            if let error { lock.unlock(); continuation.resume(throwing: error); return }
            if !messages.isEmpty { let data = messages.removeFirst(); byteCount -= data.count; lock.unlock(); continuation.resume(returning: data); return }
            guard pending == nil else { lock.unlock(); continuation.resume(throwing: POSIXError(.EBUSY)); return }
            pending = continuation; lock.unlock()
        }
    }

    func finish(_ error: Error) {
        lock.lock(); self.error = error; let pending = pending; self.pending = nil; messages.removeAll(); byteCount = 0; lock.unlock()
        pending?.resume(throwing: error)
    }
}
