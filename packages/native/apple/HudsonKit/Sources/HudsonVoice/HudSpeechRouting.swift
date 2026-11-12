import Foundation

// Public vocabulary for routed speech: which backend speaks, how a host states
// its preference and fallback order, and what actually happened.
//
// These types are additive. `HudSpeechProvider`, `HudSpeechPlayback` and
// `HudSpeechSynthesizer` keep their existing shape; a host that switches over
// those enums keeps compiling. Routed speech names backends with
// `HudVoiceProviderID`, an open struct, so a new on-device engine does not add
// an enum case under anyone's exhaustive switch.

// MARK: - Identity

/// Names one speech backend: a Vox-backed cloud provider, the OS voice, or a
/// registered on-device engine. An engine's product declares its own id;
/// HudsonVoice names none of them.
public struct HudVoiceProviderID: RawRepresentable, Hashable, Codable, Sendable, CustomStringConvertible {
    public let rawValue: String

    public init(rawValue: String) {
        self.rawValue = rawValue
    }

    public init(_ provider: HudSpeechProvider) {
        self.rawValue = provider.rawValue
    }

    public static let openAI = HudVoiceProviderID(.openAI)
    public static let elevenLabs = HudVoiceProviderID(.elevenLabs)
    public static let miniMax = HudVoiceProviderID(.miniMax)
    public static let system = HudVoiceProviderID(.system)
    public static let nvidia = HudVoiceProviderID(.nvidia)
    public static let groq = HudVoiceProviderID(.groq)
    public static let gemini = HudVoiceProviderID(.gemini)

    /// The Vox-backed provider with this id, including `system`. Nil for an
    /// on-device engine registered with the router.
    public var speechProvider: HudSpeechProvider? {
        HudSpeechProvider(rawValue: rawValue)
    }

    public var description: String { rawValue }
}

/// One entry in a host's preference list. Model and voice belong to
/// `provider`: they are never carried over to another provider on fallback.
public struct HudSpeechPreference: Hashable, Codable, Sendable {
    public var provider: HudVoiceProviderID
    /// Nil uses the provider's default model.
    public var modelId: String?
    /// Nil uses the model's default voice.
    public var voiceId: String?

    public init(provider: HudVoiceProviderID, modelId: String? = nil, voiceId: String? = nil) {
        self.provider = provider
        self.modelId = modelId
        self.voiceId = voiceId
    }
}

/// When the router may move past the first preference.
public enum HudSpeechFallbackMode: String, Codable, Sendable, Equatable {
    /// Only the first preference is tried. An unavailable or failing choice
    /// is reported, never replaced.
    case none
    /// Move on when a preference cannot start: no credential, model not
    /// installed, unsupported hardware.
    case whenUnavailable
    /// Also move on when a backend fails before any audio was produced.
    /// Failures after audio started are reported, not retried, so nothing is
    /// spoken twice.
    case whenUnavailableOrFailed
}

/// Where audio may be produced.
public enum HudSpeechLocality: String, Codable, Sendable, Equatable {
    case any
    /// On-device only: the OS voice and installed local engines. Cloud
    /// providers are skipped even if credentials are present, including on
    /// fallback.
    case localOnly
}

/// The host's speech policy. Hudson applies it; it never rewrites it. A
/// stored explicit choice stays the choice while its credential or model is
/// missing, and resolution reports why it cannot be used.
public struct HudSpeechPolicy: Hashable, Codable, Sendable {
    public var preferences: [HudSpeechPreference]
    public var fallback: HudSpeechFallbackMode
    public var locality: HudSpeechLocality

    public init(
        preferences: [HudSpeechPreference],
        fallback: HudSpeechFallbackMode = .whenUnavailableOrFailed,
        locality: HudSpeechLocality = .any
    ) {
        self.preferences = preferences
        self.fallback = fallback
        self.locality = locality
    }

    /// Exactly this provider/model/voice, no substitution.
    public static func explicit(_ preference: HudSpeechPreference, locality: HudSpeechLocality = .any) -> HudSpeechPolicy {
        HudSpeechPolicy(preferences: [preference], fallback: .none, locality: locality)
    }

    /// A ready-made order: ElevenLabs, then OpenAI, then the given local
    /// engines in order, then the OS voice. `HudSpeechRouter.cloudFirstPolicy`
    /// fills in the engines the router has registered.
    public static func cloudFirst(localEngines: [HudVoiceProviderID] = []) -> HudSpeechPolicy {
        var preferences: [HudSpeechPreference] = [
            HudSpeechPreference(provider: .elevenLabs),
            HudSpeechPreference(provider: .openAI),
        ]
        preferences += localEngines.map { HudSpeechPreference(provider: $0) }
        preferences.append(HudSpeechPreference(provider: .system))
        return HudSpeechPolicy(preferences: preferences)
    }

    /// The given local engines in order, then the OS voice, never the
    /// network. `HudSpeechRouter.localOnlyPolicy` fills in the engines the
    /// router has registered.
    public static func localOnly(localEngines: [HudVoiceProviderID] = []) -> HudSpeechPolicy {
        HudSpeechPolicy(
            preferences: localEngines.map { HudSpeechPreference(provider: $0) } + [HudSpeechPreference(provider: .system)],
            fallback: .whenUnavailableOrFailed,
            locality: .localOnly
        )
    }
}

// MARK: - Resolution and receipts

/// Why a preference was not used.
public enum HudSpeechSkipReason: Codable, Sendable, Equatable, CustomStringConvertible {
    case missingCredential
    case notInstalled
    case installing
    case unsupportedHardware(String)
    case modelFailed(String)
    case unknownProvider
    /// The model id does not belong to this provider.
    case modelProviderMismatch(String)
    /// The voice id is not one of this model's voices.
    case unknownVoice(String)
    case blockedByLocality
    /// Fallback mode `.none` stopped the walk after the first preference.
    case fallbackDisabled

    public var description: String {
        switch self {
        case .missingCredential: return "no credential"
        case .notInstalled: return "model not installed"
        case .installing: return "model is still installing"
        case .unsupportedHardware(let detail): return "unsupported hardware: \(detail)"
        case .modelFailed(let detail): return "model unusable: \(detail)"
        case .unknownProvider: return "provider not registered"
        case .modelProviderMismatch(let modelId): return "model \(modelId) belongs to another provider"
        case .unknownVoice(let voiceId): return "voice \(voiceId) is not offered by this model"
        case .blockedByLocality: return "cloud provider blocked by local-only policy"
        case .fallbackDisabled: return "fallback disabled"
        }
    }
}

/// How audio leaves the backend.
public enum HudSpeechRouteDelivery: String, Codable, Sendable, Equatable {
    /// The OS synthesizer speaks directly.
    case liveSystem
    /// The backend returns a whole clip, then it plays.
    case generatedAudio
    /// PCM chunks play as they are generated.
    case streamedPCM
}

/// The concrete backend, model and voice that handle a request.
public struct HudSpeechRoute: Hashable, Codable, Sendable {
    public var provider: HudVoiceProviderID
    public var modelId: String
    /// The voice Hudson asked for. Nil means the model's default voice.
    public var voiceId: String?
    public var isLocal: Bool
    public var delivery: HudSpeechRouteDelivery

    public init(provider: HudVoiceProviderID, modelId: String, voiceId: String?, isLocal: Bool, delivery: HudSpeechRouteDelivery) {
        self.provider = provider
        self.modelId = modelId
        self.voiceId = voiceId
        self.isLocal = isLocal
        self.delivery = delivery
    }
}

/// One step of the walk through a policy.
public struct HudSpeechAttempt: Codable, Sendable, Equatable {
    public enum Outcome: Codable, Sendable, Equatable {
        case skipped(HudSpeechSkipReason)
        /// Started and failed before producing audio.
        case failed(String)
        case used
    }

    public var preference: HudSpeechPreference
    public var outcome: Outcome

    public init(preference: HudSpeechPreference, outcome: Outcome) {
        self.preference = preference
        self.outcome = outcome
    }
}

/// The result of resolving a policy, before any audio is produced.
public struct HudSpeechResolution: Sendable, Equatable {
    /// Routes that can be tried, in order. The first one is the route that
    /// will speak unless it fails at runtime.
    public var candidates: [HudSpeechRoute]
    /// Preferences that were skipped, with the reason.
    public var attempts: [HudSpeechAttempt]

    public var route: HudSpeechRoute? { candidates.first }
}

/// What a finished request did.
public enum HudSpeechOutcome: Codable, Sendable, Equatable {
    /// Audible playback finished: the last sample has played.
    case playbackFinished
    /// Generation-only request returned its audio.
    case generated
    case cancelled
    case failed(String)
}

/// A truthful account of one speak or generate request.
public struct HudSpeechReceipt: Codable, Sendable, Equatable {
    public var requestId: String
    /// The first preference in the policy, as the host stated it.
    public var requested: HudSpeechPreference?
    /// The route that produced audio, or the last one tried.
    public var route: HudSpeechRoute?
    /// Every preference considered, in order.
    public var attempts: [HudSpeechAttempt]
    public var outcome: HudSpeechOutcome
    /// Milliseconds from the request to the first audio.
    public var firstAudioMs: Int?
    /// Milliseconds from the request to the end of generation.
    public var generationFinishedMs: Int?
    /// Milliseconds from the request to the end of audible playback.
    public var playbackFinishedMs: Int?
    /// Seconds of audio produced, when the backend reports it.
    public var audioSeconds: Double?

    /// True when the route differs from the first preference.
    public var usedFallback: Bool {
        guard let requested, let route else { return false }
        return requested.provider != route.provider
            || (requested.modelId.map { $0 != route.modelId } ?? false)
    }

    /// Why the first preference was not the one that spoke, in plain words.
    public var fallbackReason: String? {
        guard usedFallback, let first = attempts.first else { return nil }
        switch first.outcome {
        case .skipped(let reason): return "\(first.preference.provider): \(reason)"
        case .failed(let message): return "\(first.preference.provider) failed: \(message)"
        case .used: return nil
        }
    }
}

/// Lifecycle of one routed utterance.
public enum HudSpeechUtterancePhase: String, Codable, Sendable, Equatable {
    case resolving
    /// A local model is compiling or warming before generation.
    case preparing
    case generating
    /// The first audio was produced and handed to playback.
    case firstAudio
    /// The backend produced all audio. Playback may still be running.
    case generationFinished
    case playing
    /// The last sample has played.
    case playbackFinished
    case cancelled
    case failed
}

public struct HudSpeechUtteranceEvent: Sendable, Equatable {
    public var requestId: String
    public var phase: HudSpeechUtterancePhase
    public var route: HudSpeechRoute?
    /// Set while `phase == .preparing`.
    public var localState: HudLocalModelState?
    public var error: String?

    public init(requestId: String, phase: HudSpeechUtterancePhase, route: HudSpeechRoute?, localState: HudLocalModelState? = nil, error: String? = nil) {
        self.requestId = requestId
        self.phase = phase
        self.route = route
        self.localState = localState
        self.error = error
    }
}

/// Audio from a generation-only request, playable as-is.
public struct HudSpeechGeneration: Sendable, Equatable {
    public var data: Data
    /// File format, such as `wav` or `mp3`.
    public var format: String
    public var contentType: String
    public var receipt: HudSpeechReceipt
}

public enum HudSpeechRoutingError: Error, LocalizedError, Equatable {
    /// No preference could start. The receipt lists why.
    case noRoute(HudSpeechReceipt)
    case failed(HudSpeechReceipt)
    case cancelled(HudSpeechReceipt)
    case emptyText

    public var receipt: HudSpeechReceipt? {
        switch self {
        case .noRoute(let receipt), .failed(let receipt), .cancelled(let receipt): return receipt
        case .emptyText: return nil
        }
    }

    public var errorDescription: String? {
        switch self {
        case .emptyText:
            return "There was nothing to speak."
        case .cancelled:
            return "Speech was cancelled."
        case .noRoute(let receipt):
            let reasons = receipt.attempts.compactMap { attempt -> String? in
                if case .skipped(let reason) = attempt.outcome { return "\(attempt.preference.provider): \(reason)" }
                return nil
            }
            return "No speech backend could start (\(reasons.joined(separator: "; ")))."
        case .failed(let receipt):
            if case .failed(let message) = receipt.outcome { return message }
            return "Speech failed."
        }
    }
}

// MARK: - Catalog

public enum HudSpeechAvailability: Codable, Sendable, Equatable {
    case available
    case missingCredential
    case notInstalled
    case installing
    case unsupported(String)
    case failed(String)

    public var isAvailable: Bool { self == .available }
}

public struct HudSpeechCatalogModel: Identifiable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var provider: HudVoiceProviderID
    public var isLocal: Bool
    public var availability: HudSpeechAvailability
    /// The local model state, for on-device engines.
    public var localState: HudLocalModelState?
}

public struct HudSpeechCatalogProvider: Identifiable, Sendable, Equatable {
    public var id: HudVoiceProviderID
    public var label: String
    public var isLocal: Bool
    public var availability: HudSpeechAvailability
    public var defaultModelId: String
    public var models: [HudSpeechCatalogModel]
}

public struct HudSpeechCatalogVoice: Identifiable, Sendable, Equatable {
    public var id: String
    public var name: String
    public var modelId: String
    public var provider: HudVoiceProviderID
    public var isDefault: Bool
}

public struct HudSpeechCatalog: Sendable, Equatable {
    public var providers: [HudSpeechCatalogProvider]

    public func provider(_ id: HudVoiceProviderID) -> HudSpeechCatalogProvider? {
        providers.first { $0.id == id }
    }
}

// MARK: - Local engines

/// Why a local model cannot be used. `recoverable` failures clear on retry
/// (download again, reinstall); the others need different hardware or OS.
public struct HudLocalModelFailure: Error, Codable, Sendable, Equatable, LocalizedError {
    public enum Kind: String, Codable, Sendable {
        case download
        case cancelled
        case integrity
        case version
        case disk
        case compile
        case load
        case synthesis
        case unsupported
    }

    public var kind: Kind
    public var message: String
    public var recoverable: Bool

    public init(kind: Kind, message: String, recoverable: Bool = true) {
        self.kind = kind
        self.message = message
        self.recoverable = recoverable
    }

    public var errorDescription: String? { message }
}

/// Lifecycle of an on-device model.
public enum HudLocalModelState: Codable, Sendable, Equatable {
    case unsupported(String)
    case notInstalled
    /// Bytes fraction 0...1, nil when the size is unknown.
    case downloading(Double?)
    case verifying
    /// On disk and verified, not loaded.
    case installed
    /// First load after install: Core ML compiles for this device.
    case compiling
    /// Loading compiled models and running a first short synthesis.
    case warming
    /// Loaded and warm. Requests start without load cost.
    case ready
    case failed(HudLocalModelFailure)

    /// The model is on disk and can be loaded without the network.
    public var isInstalled: Bool {
        switch self {
        case .installed, .compiling, .warming, .ready: return true
        default: return false
        }
    }
}

/// Static facts about an on-device model.
public struct HudLocalSpeechModelInfo: Sendable, Equatable {
    public var provider: HudVoiceProviderID
    public var modelId: String
    public var name: String
    public var version: String
    public var license: String
    public var languages: [String]
    public var sampleRate: Double
    public var downloadBytes: Int64?
    public var installedBytes: Int64?
    public var defaultVoiceId: String

    public init(
        provider: HudVoiceProviderID,
        modelId: String,
        name: String,
        version: String,
        license: String,
        languages: [String],
        sampleRate: Double,
        downloadBytes: Int64?,
        installedBytes: Int64?,
        defaultVoiceId: String
    ) {
        self.provider = provider
        self.modelId = modelId
        self.name = name
        self.version = version
        self.license = license
        self.languages = languages
        self.sampleRate = sampleRate
        self.downloadBytes = downloadBytes
        self.installedBytes = installedBytes
        self.defaultVoiceId = defaultVoiceId
    }
}

public struct HudLocalSpeechVoice: Sendable, Equatable {
    public var id: String
    public var name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public struct HudLocalSynthesisStats: Sendable, Equatable {
    public var audioSeconds: Double
    public var firstAudioMs: Int?

    public init(audioSeconds: Double, firstAudioMs: Int?) {
        self.audioSeconds = audioSeconds
        self.firstAudioMs = firstAudioMs
    }
}

/// An on-device speech engine the router can drive.
///
/// Contract: nothing here downloads unless `install()` is called. Creating
/// the engine, reading its state, listing voices and `prepare()` only touch
/// the disk. `prepare()` loads (compiling once after install) and keeps one
/// warm instance for reuse.
public protocol HudLocalSpeechEngine: AnyObject, Sendable {
    var info: HudLocalSpeechModelInfo { get }

    func currentState() async -> HudLocalModelState
    /// State changes, starting with the current state.
    func stateUpdates() async -> AsyncStream<HudLocalModelState>

    /// Download, verify and install the model. Explicit acquisition only.
    /// Cancel the calling task or call `cancelInstall()` to stop; call again
    /// to retry.
    func install() async throws
    func cancelInstall() async
    func uninstall() async throws
    /// Full integrity check of the installed files.
    func verify() async throws

    /// Load and warm. Throws `.notInstalled`-style failures without touching
    /// the network.
    func prepare() async throws
    /// Release the loaded model.
    func unload() async

    func voices() async throws -> [HudLocalSpeechVoice]

    /// Synthesize `text`, delivering mono Float32 chunks at `info.sampleRate`
    /// as they are produced. Cancelling the calling task stops generation.
    func synthesize(
        _ text: String,
        voiceId: String?,
        onChunk: @escaping @Sendable ([Float]) -> Void
    ) async throws -> HudLocalSynthesisStats
}

/// Fan-out of state changes for local engine implementations.
public final class HudLocalModelStateBroadcaster: @unchecked Sendable {
    private let lock = NSLock()
    private var state: HudLocalModelState
    private var continuations: [UUID: AsyncStream<HudLocalModelState>.Continuation] = [:]

    public init(_ initial: HudLocalModelState) {
        state = initial
    }

    public var current: HudLocalModelState {
        lock.lock()
        defer { lock.unlock() }
        return state
    }

    public func send(_ next: HudLocalModelState) {
        lock.lock()
        state = next
        let targets = Array(continuations.values)
        lock.unlock()
        for continuation in targets {
            continuation.yield(next)
        }
    }

    public func stream() -> AsyncStream<HudLocalModelState> {
        AsyncStream { continuation in
            let id = UUID()
            lock.lock()
            continuations[id] = continuation
            let snapshot = state
            lock.unlock()
            continuation.yield(snapshot)
            continuation.onTermination = { [weak self] _ in
                guard let self else { return }
                self.lock.lock()
                self.continuations[id] = nil
                self.lock.unlock()
            }
        }
    }
}
