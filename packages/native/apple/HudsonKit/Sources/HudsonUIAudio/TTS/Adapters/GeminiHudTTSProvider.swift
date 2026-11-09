import Foundation

/// Gemini single-speaker text-to-speech via the Generate Content API.
public struct GeminiHudTTSProvider: HudTTSProviderAdapter {
    public var providerID: HudTTSProviderID { .gemini }
    public var displayName: String { "Gemini" }
    public var credentialKey: String? { "gemini_key" }
    public var defaultVoice: String { "Puck" }
    public var model: String

    public init(model: String = "gemini-2.5-flash-preview-tts") {
        self.model = model
    }

    public func isAvailable(context: HudTTSAdapterContext) async -> Bool {
        (try? await context.apiKey(for: self)) != nil
    }

    public func synthesize(
        _ request: HudTTSRequest,
        context: HudTTSAdapterContext
    ) async throws -> HudTTSResult {
        let text = request.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { throw HudTTSError.emptyInput }

        let apiKey = try await context.apiKey(for: self)
        let resolvedModel = request.model?.hudTrimmedNonEmpty ?? model
        let voice = request.voice?.hudTrimmedNonEmpty ?? defaultVoice
        // 3.8 treats text as a verbatim transcript. Earlier models instead
        // accept delivery instructions as part of the prompt.
        let usesSpeechMetadata = resolvedModel == "gemini-3.8-flash-tts"
            || resolvedModel == "gemini-3.8-flash-lite-tts"
        let instructions = request.instructions?.hudTrimmedNonEmpty
        var part: [String: Any] = ["text": text]
        if let instructions {
            if usesSpeechMetadata {
                part["speech_metadata"] = ["style": instructions]
            } else {
                part["text"] = "\(instructions)\n\n\(text)"
            }
        }
        let voiceConfig: [String: Any] = usesSpeechMetadata
            ? ["voice": voice]
            : ["prebuiltVoiceConfig": ["voiceName": voice]]

        var pathAllowed = CharacterSet.urlPathAllowed
        pathAllowed.remove(charactersIn: "/")
        guard
            let encodedModel = resolvedModel.addingPercentEncoding(withAllowedCharacters: pathAllowed),
            let endpoint = URL(
                string: "https://generativelanguage.googleapis.com/v1beta/models/\(encodedModel):generateContent"
            )
        else {
            throw HudTTSError.synthesisFailed(
                provider: providerID,
                message: "Could not build the Gemini TTS URL."
            )
        }

        var urlRequest = URLRequest(url: endpoint)
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = context.requestTimeout
        urlRequest.setValue(apiKey, forHTTPHeaderField: "x-goog-api-key")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = try JSONSerialization.data(withJSONObject: [
            "contents": [["role": "user", "parts": [part]]],
            "generationConfig": [
                "responseModalities": ["AUDIO"],
                "speechConfig": [
                    "voiceConfig": voiceConfig,
                ],
            ],
        ])

        let (data, response) = try await context.urlSession.data(for: urlRequest)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            let status = (response as? HTTPURLResponse)?.statusCode
            throw HudTTSError.providerRejectedRequest(
                provider: providerID,
                status: status,
                message: Self.errorMessage(from: data)
                    ?? "Gemini TTS failed\(status.map { " (HTTP \($0))" } ?? "")."
            )
        }

        guard
            let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let candidates = object["candidates"] as? [[String: Any]],
            let content = candidates.first?["content"] as? [String: Any],
            let parts = content["parts"] as? [[String: Any]],
            let inline = parts.compactMap({ $0["inlineData"] as? [String: Any] }).first,
            let mimeType = inline["mimeType"] as? String,
            let encodedAudio = inline["data"] as? String,
            let audio = Data(base64Encoded: encodedAudio),
            !audio.isEmpty
        else {
            throw HudTTSError.synthesisFailed(
                provider: providerID,
                message: "Gemini returned unreadable audio."
            )
        }

        let normalizedMIME = mimeType
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let output = normalizedMIME.hasPrefix("audio/wav")
            || normalizedMIME.hasPrefix("audio/x-wav")
            ? audio
            : try Self.pcmWAV(audio: audio, mimeType: mimeType)
        return HudTTSResult(
            audioData: output,
            format: .wav,
            providerID: providerID,
            voice: voice
        )
    }

    static func pcmWAV(audio: Data, mimeType: String) throws -> Data {
        let normalizedMIME = mimeType.lowercased()
        guard normalizedMIME.hasPrefix("audio/l16"), !audio.isEmpty else {
            throw unsupportedAudioError()
        }

        var parameters: [String: String] = [:]
        for component in mimeType.split(separator: ";").dropFirst() {
            let pair = component.split(separator: "=", maxSplits: 1).map(String.init)
            guard pair.count == 2 else { continue }
            let key = pair[0]
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            parameters[key] = pair[1].trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard
            let sampleRate = UInt32(parameters["rate"] ?? "24000"),
            let channelCount = UInt16(parameters["channels"] ?? "1"),
            (8_000...192_000).contains(sampleRate),
            (1...8).contains(channelCount)
        else {
            throw unsupportedAudioError()
        }
        let bitsPerSample: UInt16 = 16
        let blockAlign = channelCount * bitsPerSample / 8
        guard
            audio.count.isMultiple(of: Int(blockAlign)),
            audio.count <= Int(UInt32.max) - 36
        else {
            throw unsupportedAudioError()
        }

        let byteRate = sampleRate * UInt32(channelCount) * UInt32(bitsPerSample) / 8
        var wav = Data("RIFF".utf8)
        wav.appendLittleEndian(UInt32(36 + audio.count))
        wav.append(Data("WAVEfmt ".utf8))
        wav.appendLittleEndian(UInt32(16))
        wav.appendLittleEndian(UInt16(1))
        wav.appendLittleEndian(channelCount)
        wav.appendLittleEndian(sampleRate)
        wav.appendLittleEndian(byteRate)
        wav.appendLittleEndian(blockAlign)
        wav.appendLittleEndian(bitsPerSample)
        wav.append(Data("data".utf8))
        wav.appendLittleEndian(UInt32(audio.count))
        wav.append(audio)
        return wav
    }

    private static func errorMessage(from data: Data) -> String? {
        guard
            let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let error = json["error"] as? [String: Any],
            let message = error["message"] as? String
        else { return nil }
        return "Gemini TTS: \(message)"
    }

    private static func unsupportedAudioError() -> HudTTSError {
        .synthesisFailed(
            provider: .gemini,
            message: "Gemini returned an unsupported audio format."
        )
    }
}

private extension Data {
    mutating func appendLittleEndian(_ value: UInt16) {
        append(UInt8(value & 0xff))
        append(UInt8((value >> 8) & 0xff))
    }

    mutating func appendLittleEndian(_ value: UInt32) {
        append(UInt8(value & 0xff))
        append(UInt8((value >> 8) & 0xff))
        append(UInt8((value >> 16) & 0xff))
        append(UInt8((value >> 24) & 0xff))
    }
}
