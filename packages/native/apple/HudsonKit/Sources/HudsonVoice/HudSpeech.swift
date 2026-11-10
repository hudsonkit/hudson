import Foundation
import VoxCore
import VoxEngine

// Speech synthesis for HudsonKit hosts.
//
// In-process on purpose. The synthesis engine is linked into the app, so a host
// speaks without depending on any separate daemon being alive — a companion
// process that isn't running is otherwise indistinguishable from a provider
// outage, and the usual recovery (drop to the system voice) silently replaces a
// chosen voice with the robot one.
//
// Credentials are lent by the host, never read from disk here. HudsonKit does
// not own the operator's keys and should not go looking for them.

/// A synthesis backend. The host names one of these rather than a provider id
/// or an environment variable.
public enum HudSpeechProvider: String, CaseIterable, Identifiable, Sendable {
    case openAI
    case elevenLabs
    case miniMax
    /// The OS voice. Always available, needs no credential.
    case system
    case nvidia
    case groq
    case gemini

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .openAI: return "OpenAI"
        case .elevenLabs: return "ElevenLabs"
        case .miniMax: return "MiniMax"
        case .system: return "System"
        case .nvidia: return "NVIDIA"
        case .groq: return "Groq"
        case .gemini: return "Gemini"
        }
    }

    /// True when this backend cannot speak without a key.
    public var requiresCredential: Bool {
        self != .system
    }

    var providerId: String {
        switch self {
        case .openAI: return "openai"
        case .elevenLabs: return "elevenlabs"
        case .miniMax: return "minimax"
        case .system: return "avspeech"
        case .nvidia: return "nvidia"
        case .groq: return "groq"
        case .gemini: return "gemini"
        }
    }

    /// Env keys Vox consults for this backend, including aliases.
    ///
    /// Config always writes every key — either the host-lent secret or an
    /// explicit blank — so Vox will not fall through to process environment.
    fileprivate var credentialEnvKeys: [String] {
        switch self {
        case .openAI: return ["OPENAI_API_KEY"]
        case .elevenLabs: return ["ELEVENLABS_API_KEY"]
        case .miniMax: return ["MINIMAX_API_KEY"]
        case .nvidia: return ["NV_API_KEY", "NVIDIA_API_KEY"]
        case .groq: return ["GROQ_API_KEY"]
        case .gemini: return ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_API_KEY"]
        case .system: return []
        }
    }

    var modelIds: [String] {
        switch self {
        case .openAI: return OpenAITTSProvider.supportedModelIDs
        case .elevenLabs: return ElevenLabsTTSProvider.supportedModelIDs
        case .miniMax: return MiniMaxTTSProvider.supportedModelIDs
        case .system: return [AVSpeechSynthesizerProvider.modelID]
        case .nvidia: return NVIDIAMagpieTTSProvider.supportedModelIDs
        case .groq: return GroqTTSProvider.supportedModelIDs
        case .gemini: return GeminiTTSProvider.supportedModelIDs
        }
    }

    /// Which backend owns a model id, for hosts that persist the id alone.
    public static func owning(modelId: String) -> HudSpeechProvider? {
        allCases.first { $0.modelIds.contains(modelId) }
    }

    /// Resolve the backend that actually handled a playback event. The model
    /// id is authoritative when it is one of Hudson's canonical ids; the Vox
    /// backend is the fallback for providers that return an aliased model id.
    static func resolving(modelId: String, backend: String?) -> HudSpeechProvider? {
        if let owner = owning(modelId: modelId) {
            return owner
        }
        guard let backend = backend?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !backend.isEmpty
        else {
            return nil
        }
        return allCases.first { $0.providerId == backend }
    }
}

public struct HudSpeechModel: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let provider: HudSpeechProvider
    /// False when the backend has no credential — the host should say so
    /// rather than offer a model that will fail on use.
    public let available: Bool
}

public struct HudSpeechVoice: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let modelId: String
    public let provider: HudSpeechProvider
    public let isDefault: Bool
}

public struct HudSpeechAudio: Equatable, Sendable {
    public let data: Data
    public let modelId: String
    public let voiceId: String
    public let provider: HudSpeechProvider
    public let format: String
    public let contentType: String
    public let elapsedMs: Int
}

public enum HudSpeechError: Error, LocalizedError, Equatable {
    case emptyText
    case unknownModel(String)
    case missingCredential(HudSpeechProvider)
    case noAudio
    case synthesisFailed(String)

    public var errorDescription: String? {
        switch self {
        case .emptyText:
            return "There was nothing to speak."
        case .unknownModel(let modelId):
            return "No speech backend handles the model \(modelId)."
        case .missingCredential(let provider):
            return "\(provider.label) needs an API key before it can speak."
        case .noAudio:
            return "Speech synthesis returned no audio."
        case .synthesisFailed(let message):
            return message
        }
    }
}

/// Synthesizes speech through the in-process engine.
///
/// Hold one per host (`HudSpeechSynthesizer.shared` is fine for a single app).
/// Credentials are supplied up front because some backends read their key when
/// the provider is constructed; call `updateCredentials` when the operator
/// changes a key and the engine is rebuilt around it.
public actor HudSpeechSynthesizer {
    public static let shared = HudSpeechSynthesizer()

    private var credentials: [HudSpeechProvider: String]
    private var engine: TTSEngineManager

    public init(credentials: [HudSpeechProvider: String] = [:]) {
        let cleaned = Self.cleanedCredentials(credentials)
        self.credentials = cleaned
        self.engine = TTSEngineManager(
            provider: TTSProviderRegistry(config: Self.config(credentials: cleaned))
        )
    }

    /// Replace the lent keys. Rebuilds the engine, because a backend that read
    /// its key at construction would otherwise keep using the old one.
    public func updateCredentials(_ next: [HudSpeechProvider: String]) {
        let cleaned = Self.cleanedCredentials(next)
        guard cleaned != credentials else { return }
        credentials = cleaned
        engine = TTSEngineManager(
            provider: TTSProviderRegistry(config: Self.config(credentials: cleaned))
        )
    }

    /// Backends the host can offer right now — `system` always, plus any with a
    /// lent credential.
    public func availableProviders() -> [HudSpeechProvider] {
        HudSpeechProvider.allCases.filter { provider in
            !provider.requiresCredential || credentials[provider] != nil
        }
    }

    public func models() async -> [HudSpeechModel] {
        await engine.models().compactMap { info in
            guard let provider = HudSpeechProvider.owning(modelId: info.id) else { return nil }
            return HudSpeechModel(
                id: info.id,
                name: info.name,
                provider: provider,
                available: info.available
            )
        }
    }

    /// Voices for a model. ElevenLabs answers from the operator's account, so
    /// this can reach the network and throw; OpenAI and the system voice do not.
    public func voices(modelId: String) async throws -> [HudSpeechVoice] {
        guard let provider = HudSpeechProvider.owning(modelId: modelId) else {
            throw HudSpeechError.unknownModel(modelId)
        }
        try requireCredential(for: provider)
        let voices = try await engine.voices(modelId: modelId)
        return voices.map { voice in
            HudSpeechVoice(
                id: voice.id,
                name: voice.name,
                modelId: voice.modelId,
                provider: provider,
                isDefault: voice.isDefault
            )
        }
    }

    public func synthesize(
        _ text: String,
        modelId: String,
        voiceId: String? = nil,
        speed: Double? = nil,
        instructions: String? = nil
    ) async throws -> HudSpeechAudio {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw HudSpeechError.emptyText }
        guard let provider = HudSpeechProvider.owning(modelId: modelId) else {
            throw HudSpeechError.unknownModel(modelId)
        }
        try requireCredential(for: provider)

        let request = SynthesisRequest(
            text: trimmed,
            modelId: modelId,
            voiceId: voiceId,
            speed: speed,
            instructions: instructions,
            providerCredentials: Self.lentCredentials(credentials)
        )

        let output: SynthesisOutput
        do {
            output = try await engine.synthesize(request)
        } catch let error as HudSpeechError {
            throw error
        } catch {
            throw HudSpeechError.synthesisFailed(error.localizedDescription)
        }

        guard !output.audioData.isEmpty else { throw HudSpeechError.noAudio }

        return HudSpeechAudio(
            data: output.audioData,
            modelId: output.modelId,
            voiceId: output.voiceId,
            provider: provider,
            format: output.format,
            contentType: output.contentType,
            elapsedMs: output.elapsedMs
        )
    }

    private func requireCredential(for provider: HudSpeechProvider) throws {
        guard provider.requiresCredential, credentials[provider] == nil else { return }
        throw HudSpeechError.missingCredential(provider)
    }

    /// Providers that read their key at construction get it through `env`;
    /// those that accept a per-request key get it again in `providerCredentials`.
    static func config(credentials: [HudSpeechProvider: String]) -> ProvidersConfig {
        ProvidersConfig(
            providers: HudSpeechProvider.allCases.map { provider in
                var env: [String: String] = [:]
                for key in provider.credentialEnvKeys {
                    // Vox providers otherwise fall back to process or on-disk
                    // credentials. An explicit empty value keeps Hudson's
                    // host-lent-only contract while making the provider report
                    // unavailable until the host supplies a key.
                    env[key] = credentials[provider] ?? ""
                }
                return ProviderEntry(
                    id: provider.providerId,
                    kind: .tts,
                    builtin: true,
                    models: provider.modelIds,
                    env: env.isEmpty ? nil : env
                )
            }
        )
    }

    static func lentCredentials(_ credentials: [HudSpeechProvider: String]) -> [String: String] {
        var lent: [String: String] = [:]
        for (provider, key) in credentials {
            for envKey in provider.credentialEnvKeys {
                lent[envKey] = key
            }
        }
        return lent
    }

    static func cleanedCredentials(
        _ credentials: [HudSpeechProvider: String]
    ) -> [HudSpeechProvider: String] {
        Dictionary(uniqueKeysWithValues: credentials.compactMap { provider, value in
            let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleaned.isEmpty else { return nil }
            return (provider, cleaned)
        })
    }
}
