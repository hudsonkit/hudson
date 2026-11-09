import AVFoundation
import Foundation
import Testing
@testable import HudsonUIAudio

@Suite("Gemini TTS model compatibility", .serialized)
struct GeminiHudTTSProviderTests {
    @Test("3.8 keeps instructions out of the transcript and preserves WAV output",
          arguments: ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"])
    func structuredSpeech(model: String) async throws {
        let wav = try GeminiHudTTSProvider.pcmWAV(
            audio: Data([0, 1, 2, 3]), mimeType: "audio/L16;rate=24000"
        )
        let (result, body) = try await synthesize(model: model, instructions: "  Warm and friendly  ", audio: wav)
        let part = try firstPart(body)
        #expect(part["text"] as? String == "Hello Hudson")
        let metadata = try #require(part["speech_metadata"] as? [String: String])
        #expect(metadata["style"] == "Warm and friendly")
        let voice = try voiceConfig(body)
        #expect(voice["voice"] as? String == "Kore")
        #expect(voice["prebuiltVoiceConfig"] == nil)
        #expect(result.audioData == wav)
        #expect(result.format == .wav)
        #expect(result.providerID == .gemini)
    }

    @Test("3.8 omits blank delivery metadata")
    func blankInstructions() async throws {
        let (_, body) = try await synthesize(model: "gemini-3.8-flash-tts", instructions: " \n ")
        let part = try firstPart(body)
        #expect(part["text"] as? String == "Hello Hudson")
        #expect(part["speech_metadata"] == nil)
    }

    @Test("older models retain their prompting and PCM conversion",
          arguments: ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview"])
    func legacySpeech(model: String) async throws {
        let (result, body) = try await synthesize(model: model, instructions: "Warm and friendly")
        let part = try firstPart(body)
        #expect(part["text"] as? String == "Warm and friendly\n\nHello Hudson")
        #expect(part["speech_metadata"] == nil)
        let voice = try voiceConfig(body)
        let prebuilt = try #require(voice["prebuiltVoiceConfig"] as? [String: String])
        #expect(prebuilt["voiceName"] == "Kore")
        #expect(String(data: result.audioData.prefix(4), encoding: .utf8) == "RIFF")
        #expect(result.audioData.count == 48)
    }

    @Test("Gemini 3.8 live synthesis probe", .enabled(if:
        ProcessInfo.processInfo.environment["HUDSON_GEMINI_TTS_LIVE"] == "1"
    ))
    func liveSynthesis() async throws {
        let env = ProcessInfo.processInfo.environment
        let key = try #require(env["GEMINI_API_KEY"]?.trimmingCharacters(in: .whitespacesAndNewlines))
        try #require(!key.isEmpty)
        let started = Date()
        let result = try await GeminiHudTTSProvider(model: "gemini-3.8-flash-tts").synthesize(
            HudTTSRequest(
                text: "Hello from Hudson. This is Gemini three point eight, speaking through our speech module.",
                voice: "Kore",
                instructions: "Warm, conversational, and clear."
            ),
            context: HudTTSAdapterContext(credentialSource: GeminiTestCredentialSource(key: key))
        )
        let elapsed = Int(Date().timeIntervalSince(started) * 1_000)
        let directory = URL(fileURLWithPath: env["HUDSON_GEMINI_TTS_DUMP_DIR"] ?? NSTemporaryDirectory())
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let output = directory.appendingPathComponent("hudson-gemini-3.8-flash-tts.wav")
        try result.audioData.write(to: output)
        let decoded = try AVAudioFile(forReading: output)
        #expect(decoded.length > 0)
        #expect(result.audioData.count > 1_000)
        let duration = Double(decoded.length) / decoded.processingFormat.sampleRate
        print("HUDSON_GEMINI_TTS_LIVE model=gemini-3.8-flash-tts latency_ms=\(elapsed) duration_s=\(duration) bytes=\(result.audioData.count) audio=\(output.path)")
    }

    private func synthesize(
        model: String, instructions: String, audio: Data? = nil
    ) async throws -> (HudTTSResult, [String: Any]) {
        GeminiTTSURLProtocol.responseBody = try JSONSerialization.data(withJSONObject: [
            "candidates": [["content": ["parts": [["inlineData": [
                "mimeType": audio == nil ? "audio/L16;rate=24000" : "audio/wav",
                "data": (audio ?? Data([0, 1, 2, 3])).base64EncodedString(),
            ]]]]]],
        ])
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [GeminiTTSURLProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let result = try await GeminiHudTTSProvider().synthesize(
            HudTTSRequest(text: " Hello Hudson ", voice: "Kore", model: model, instructions: instructions),
            context: HudTTSAdapterContext(
                credentialSource: GeminiTestCredentialSource(key: "test-key"), urlSession: session
            )
        )
        let request = try #require(GeminiTTSURLProtocol.request)
        #expect(request.url?.lastPathComponent == "\(model):generateContent")
        #expect(request.url?.query == nil)
        #expect(request.value(forHTTPHeaderField: "x-goog-api-key") == "test-key")
        let data = try #require(GeminiTTSURLProtocol.requestBody)
        return (result, try #require(JSONSerialization.jsonObject(with: data) as? [String: Any]))
    }

    private func firstPart(_ body: [String: Any]) throws -> [String: Any] {
        let contents = try #require(body["contents"] as? [[String: Any]])
        #expect(contents.first?["role"] as? String == "user")
        let parts = try #require(contents.first?["parts"] as? [[String: Any]])
        return try #require(parts.first)
    }

    private func voiceConfig(_ body: [String: Any]) throws -> [String: Any] {
        let generation = try #require(body["generationConfig"] as? [String: Any])
        #expect(generation["responseModalities"] as? [String] == ["AUDIO"])
        let speech = try #require(generation["speechConfig"] as? [String: Any])
        return try #require(speech["voiceConfig"] as? [String: Any])
    }
}

private struct GeminiTestCredentialSource: HudTTSCredentialSource {
    let key: String
    func get(_ name: String) async throws -> Data? {
        name == "gemini_key" ? Data(key.utf8) : nil
    }
}

private final class GeminiTTSURLProtocol: URLProtocol, @unchecked Sendable {
    static var request: URLRequest?
    static var requestBody: Data?
    static var responseBody = Data()

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        Self.request = request
        if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                data.append(contentsOf: buffer.prefix(count))
            }
            Self.requestBody = data
        } else {
            Self.requestBody = request.httpBody
        }
        let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Self.responseBody)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
