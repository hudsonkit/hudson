import Foundation

private struct HudVoxProbeRequest: Encodable {
    let id: String
    let method: String
    let params: [String: HudJSONValue]
}

private struct HudVoxProbeResponse: Decodable {
    let result: [String: HudJSONValue]?
    let error: HudJSONValue?
}

/// Lightweight one-shot Vox daemon checks for native HudsonKit surfaces.
public enum HudVoxProbe {
    public static func health(
        endpoint: HudVoxEndpoint = HudVoxEndpoint(),
        clientId: String = "HudsonKit",
        authToken: String? = nil
    ) async throws -> HudVoxHealth {
        var params: [String: HudJSONValue] = ["clientId": .string(clientId)]
        if let authToken, !authToken.isEmpty {
            params["authToken"] = .string(authToken)
        }
        let response = try await call(
            endpoint: endpoint,
            method: "health",
            params: params
        )

        return HudVoxHealth(
            service: response.string("service") ?? "Vox",
            version: response.string("version") ?? "unknown",
            startedAt: response.string("startedAt"),
            pid: response.int("pid"),
            port: response.int("port")
        )
    }

    private static func call(
        endpoint: HudVoxEndpoint,
        method: String,
        params: [String: HudJSONValue]
    ) async throws -> [String: HudJSONValue] {
        let webSocket = HudVoiceWebSocket(endpoint: endpoint, token: params["authToken"]?.stringValue)
        webSocket.resume()
        let timeout = Task {
            do { try await Task.sleep(nanoseconds: 5_000_000_000) }
            catch { return }
            webSocket.cancel(with: .goingAway, reason: nil)
        }
        defer { timeout.cancel(); webSocket.cancel(with: .normalClosure, reason: nil) }

        let request = HudVoxProbeRequest(id: UUID().uuidString, method: method, params: params)
        let data = try JSONEncoder().encode(request)
        guard let text = String(data: data, encoding: .utf8) else {
            throw HudVoxError.invalidMessage
        }

        try await webSocket.send(.string(text))
        let message = try await webSocket.receive()

        let payload: Data
        switch message {
        case .string(let text):
            guard let encoded = text.data(using: .utf8) else {
                throw HudVoxError.invalidMessage
            }
            payload = encoded
        case .data(let data):
            payload = data
        @unknown default:
            throw HudVoxError.invalidMessage
        }

        let response = try JSONDecoder().decode(HudVoxProbeResponse.self, from: payload)
        if let error = response.error {
            throw HudVoxError.provider(error.stringValue ?? String(describing: error))
        }
        guard let result = response.result else {
            throw HudVoxError.invalidMessage
        }
        return result
    }
}
