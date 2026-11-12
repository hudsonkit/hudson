import Foundation
import VoxCore
import VoxEngine
import VoxAppleSpeech

/// Routes speech through a host-stated policy: cloud providers, the OS
/// voice, and registered on-device engines, with fallback, cancellation and
/// receipts.
///
/// One router per audible surface. A new `speak` replaces whatever is
/// speaking (barge-in). `cancel()` stops generation and queued audio; no
/// audio from a cancelled request plays afterwards.
///
/// The router never downloads a model on its own. Local engines are used only
/// when already installed; installing is the host's explicit call, through
/// `preload(_:onState:)` or on the engine itself.
public actor HudSpeechRouter {
    private var credentials: [HudSpeechProvider: String]
    private var cloudSynthesis: any HudSpeechCloudSynthesizing
    private var cloudPlayback: any HudSpeechPlaybackControlling
    private let hub = HudSpeechEventHub()
    private let pcmOutput: any HudPCMOutput
    private let localEngines: [HudVoiceProviderID: any HudLocalSpeechEngine]
    private let localOrder: [HudVoiceProviderID]
    private let makeCloud: @Sendable ([HudSpeechProvider: String], HudSpeechEventHub) -> (any HudSpeechCloudSynthesizing, any HudSpeechPlaybackControlling)

    /// Monotonic id of the current utterance; bumping it invalidates the
    /// running one.
    private var generation: UInt64 = 0
    private var localTask: Task<HudLocalSynthesisStats, Error>?
    /// Stops are ordered so an older request cannot cancel newer playback
    /// after actor reentrancy lets the newer request start.
    private var cloudCancellation: Task<Void, Never>?

    public init(
        credentials: [HudSpeechProvider: String] = [:],
        localEngines: [any HudLocalSpeechEngine] = []
    ) {
        self.init(
            credentials: credentials,
            localEngines: localEngines,
            pcmOutput: HudPCMStreamPlayer(),
            makeCloud: { credentials, hub in
                let engine = TTSEngineManager(
                    provider: TTSProviderRegistry(config: HudSpeechSynthesizer.config(credentials: credentials))
                )
                let controller = AppleSpeechOutputController(engine: engine, onEvent: { event in
                    hub.deliver(event)
                })
                return (HudSpeechSynthesizer(credentials: credentials), controller)
            }
        )
    }

    init(
        credentials: [HudSpeechProvider: String],
        localEngines: [any HudLocalSpeechEngine],
        pcmOutput: any HudPCMOutput,
        makeCloud: @escaping @Sendable ([HudSpeechProvider: String], HudSpeechEventHub) -> (any HudSpeechCloudSynthesizing, any HudSpeechPlaybackControlling)
    ) {
        let cleaned = HudSpeechSynthesizer.cleanedCredentials(credentials)
        self.credentials = cleaned
        self.makeCloud = makeCloud
        self.pcmOutput = pcmOutput
        var engines: [HudVoiceProviderID: any HudLocalSpeechEngine] = [:]
        var order: [HudVoiceProviderID] = []
        for engine in localEngines where engines[engine.info.provider] == nil {
            engines[engine.info.provider] = engine
            order.append(engine.info.provider)
        }
        self.localEngines = engines
        self.localOrder = order
        (self.cloudSynthesis, self.cloudPlayback) = makeCloud(cleaned, hub)
    }

    // MARK: Credentials

    /// Replace the lent keys. Stops the current utterance and rebuilds the
    /// cloud engines so no backend keeps an old key. A no-op when unchanged.
    public func updateCredentials(_ next: [HudSpeechProvider: String]) async {
        let cleaned = HudSpeechSynthesizer.cleanedCredentials(next)
        guard cleaned != credentials else { return }
        let (_, stopping) = beginInterruption()
        credentials = cleaned
        (cloudSynthesis, cloudPlayback) = makeCloud(cleaned, hub)
        await stopping.value
    }

    public func localEngine(_ provider: HudVoiceProviderID) -> (any HudLocalSpeechEngine)? {
        localEngines[provider]
    }

    /// The registered local engines, in registration order.
    public var localEngineIDs: [HudVoiceProviderID] { localOrder }

    // MARK: Policies

    /// On-device only: `preferring` first (with its voice), then the other
    /// registered engines in order, then the OS voice.
    public func localOnlyPolicy(preferring: HudVoiceProviderID? = nil, voiceId: String? = nil) -> HudSpeechPolicy {
        var policy = HudSpeechPolicy.localOnly(localEngines: ordered(preferring: preferring))
        policy.applyVoice(voiceId, to: preferring)
        return policy
    }

    /// ElevenLabs, OpenAI, then the registered engines (`preferring` first),
    /// then the OS voice.
    public func cloudFirstPolicy(preferring: HudVoiceProviderID? = nil, voiceId: String? = nil) -> HudSpeechPolicy {
        var policy = HudSpeechPolicy.cloudFirst(localEngines: ordered(preferring: preferring))
        policy.applyVoice(voiceId, to: preferring)
        return policy
    }

    private func ordered(preferring: HudVoiceProviderID?) -> [HudVoiceProviderID] {
        guard let preferring, localEngines[preferring] != nil else { return localOrder }
        return [preferring] + localOrder.filter { $0 != preferring }
    }

    // MARK: Preload

    /// Make a registered local engine ready to speak: install it when it is
    /// not on disk, then load and warm it. This is the host's explicit
    /// acquisition, the counterpart of Vox's `preload(modelId:)`; nothing
    /// else downloads. `onState` receives the engine's states as they change,
    /// download progress included. Cancel the calling task to stop.
    public func preload(
        _ provider: HudVoiceProviderID,
        onState: (@Sendable (HudLocalModelState) -> Void)? = nil
    ) async throws {
        guard let engine = localEngines[provider] else {
            throw HudSpeechError.unknownModel(provider.rawValue)
        }
        // Subscribe before acting so no state is missed; the stream buffers.
        var watcher: Task<Void, Never>?
        if let onState {
            let updates = await engine.stateUpdates()
            watcher = Task {
                for await state in updates {
                    onState(state)
                    if state == .ready { break }
                    if case .failed = state { break }
                }
            }
        }
        defer { watcher?.cancel() }
        let state = await engine.currentState()
        if case .unsupported(let detail) = state {
            throw HudLocalModelFailure(kind: .unsupported, message: detail)
        }
        if !state.isInstalled {
            try await engine.install()
        }
        try Task.checkCancellation()
        try await engine.prepare()
        // Let the watcher deliver through `.ready`, but never hang on an
        // engine that settles without announcing it.
        if let watcher {
            let stop = Task { try? await Task.sleep(for: .seconds(1)); watcher.cancel() }
            await watcher.value
            stop.cancel()
        }
    }

    // MARK: Catalog

    /// Every backend Hudson can route to, with availability. Unavailable
    /// models stay listed with the reason, so a host can show a stored choice
    /// that cannot speak right now. Reads no network.
    public func catalog() async -> HudSpeechCatalog {
        var providers: [HudSpeechCatalogProvider] = []
        for provider in HudSpeechProvider.allCases {
            let id = HudVoiceProviderID(provider)
            let availability: HudSpeechAvailability = (!provider.requiresCredential || credentials[provider] != nil)
                ? .available : .missingCredential
            let models = provider.modelIds.map { modelId in
                HudSpeechCatalogModel(
                    id: modelId,
                    name: modelId,
                    provider: id,
                    isLocal: provider == .system,
                    availability: availability,
                    localState: nil
                )
            }
            providers.append(HudSpeechCatalogProvider(
                id: id,
                label: provider.label,
                isLocal: provider == .system,
                availability: availability,
                defaultModelId: provider.modelIds.first ?? "",
                models: models
            ))
        }
        for id in localOrder {
            guard let engine = localEngines[id] else { continue }
            let state = await engine.currentState()
            let availability = Self.availability(for: state)
            providers.append(HudSpeechCatalogProvider(
                id: id,
                label: engine.info.name,
                isLocal: true,
                availability: availability,
                defaultModelId: engine.info.modelId,
                models: [HudSpeechCatalogModel(
                    id: engine.info.modelId,
                    name: engine.info.name,
                    provider: id,
                    isLocal: true,
                    availability: availability,
                    localState: state
                )]
            ))
        }
        return HudSpeechCatalog(providers: providers)
    }

    /// Voices for one provider's model. Cloud voice lists may reach the
    /// network (ElevenLabs reads the account); local engines read the disk.
    public func voices(provider: HudVoiceProviderID, modelId: String? = nil) async throws -> [HudSpeechCatalogVoice] {
        if let speechProvider = provider.speechProvider {
            let model = modelId ?? speechProvider.modelIds.first ?? ""
            guard HudSpeechProvider.owning(modelId: model) == speechProvider else {
                throw HudSpeechError.unknownModel(model)
            }
            return try await cloudSynthesis.voices(modelId: model).map {
                HudSpeechCatalogVoice(id: $0.id, name: $0.name, modelId: $0.modelId, provider: provider, isDefault: $0.isDefault)
            }
        }
        guard let engine = localEngines[provider] else {
            throw HudSpeechError.unknownModel(modelId ?? provider.rawValue)
        }
        let defaultVoice = engine.info.defaultVoiceId
        return try await engine.voices().map {
            HudSpeechCatalogVoice(id: $0.id, name: $0.name, modelId: engine.info.modelId, provider: provider, isDefault: $0.id == defaultVoice)
        }
    }

    // MARK: Resolution

    /// Walk the policy without producing audio. Never mutates the policy.
    public func resolve(_ policy: HudSpeechPolicy) async -> HudSpeechResolution {
        var candidates: [HudSpeechRoute] = []
        var attempts: [HudSpeechAttempt] = []
        for (index, preference) in policy.preferences.enumerated() {
            if index > 0, policy.fallback == .none {
                attempts.append(HudSpeechAttempt(preference: preference, outcome: .skipped(.fallbackDisabled)))
                continue
            }
            switch await route(for: preference, locality: policy.locality) {
            case .success(let route):
                candidates.append(route)
            case .failure(let reason):
                attempts.append(HudSpeechAttempt(preference: preference, outcome: .skipped(reason)))
            }
        }
        return HudSpeechResolution(candidates: candidates, attempts: attempts)
    }

    private enum RouteCheck {
        case success(HudSpeechRoute)
        case failure(HudSpeechSkipReason)
    }

    private func route(for preference: HudSpeechPreference, locality: HudSpeechLocality) async -> RouteCheck {
        if let provider = preference.provider.speechProvider {
            if locality == .localOnly, provider != .system {
                return .failure(.blockedByLocality)
            }
            let modelId = preference.modelId ?? provider.modelIds.first ?? ""
            guard HudSpeechProvider.owning(modelId: modelId) == provider else {
                return .failure(.modelProviderMismatch(modelId))
            }
            if provider.requiresCredential, credentials[provider] == nil {
                return .failure(.missingCredential)
            }
            return .success(HudSpeechRoute(
                provider: preference.provider,
                modelId: modelId,
                voiceId: preference.voiceId,
                isLocal: provider == .system,
                delivery: provider == .system ? .liveSystem : .generatedAudio
            ))
        }

        guard let engine = localEngines[preference.provider] else {
            return .failure(.unknownProvider)
        }
        if let modelId = preference.modelId, modelId != engine.info.modelId {
            return .failure(.modelProviderMismatch(modelId))
        }
        let state = await engine.currentState()
        switch state {
        case .unsupported(let detail):
            return .failure(.unsupportedHardware(detail))
        case .notInstalled:
            return .failure(.notInstalled)
        case .downloading, .verifying:
            return .failure(.installing)
        case .failed(let failure):
            return .failure(failure.kind == .unsupported ? .unsupportedHardware(failure.message) : .modelFailed(failure.message))
        case .installed, .compiling, .warming, .ready:
            break
        }
        if let voiceId = preference.voiceId {
            let voices = (try? await engine.voices()) ?? []
            guard voices.contains(where: { $0.id == voiceId }) else {
                return .failure(.unknownVoice(voiceId))
            }
        }
        return .success(HudSpeechRoute(
            provider: preference.provider,
            modelId: engine.info.modelId,
            voiceId: preference.voiceId,
            isLocal: true,
            delivery: .streamedPCM
        ))
    }

    // MARK: Speak

    /// Speak `text` aloud. Returns when audible playback finished, the
    /// request was cancelled or replaced, or every allowed route failed.
    /// The receipt names the route that actually spoke.
    @discardableResult
    public func speak(
        _ text: String,
        policy: HudSpeechPolicy,
        requestId: String = UUID().uuidString,
        onEvent: (@Sendable (HudSpeechUtteranceEvent) -> Void)? = nil
    ) async -> HudSpeechReceipt {
        let clock = ContinuousClock()
        let start = clock.now
        let elapsed = { Self.milliseconds(clock.now - start) }

        let token = await interrupt()
        let emit: @Sendable (HudSpeechUtterancePhase, HudSpeechRoute?, HudLocalModelState?, String?) -> Void = { phase, route, state, error in
            onEvent?(HudSpeechUtteranceEvent(requestId: requestId, phase: phase, route: route, localState: state, error: error))
        }

        var receipt = HudSpeechReceipt(
            requestId: requestId,
            requested: policy.preferences.first,
            route: nil,
            attempts: [],
            outcome: .failed("no route")
        )
        guard token == generation else { return cancelledReceipt(receipt, emit: emit) }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            receipt.outcome = .failed(HudSpeechError.emptyText.localizedDescription)
            emit(.failed, nil, nil, receipt.outcome.message)
            return receipt
        }

        emit(.resolving, nil, nil, nil)
        let resolution = await resolve(policy)
        receipt.attempts = Self.mergeAttempts(policy: policy, skipped: resolution.attempts, tried: [])
        guard token == generation else { return cancelledReceipt(receipt, emit: emit) }

        var tried: [(HudSpeechRoute, HudSpeechAttempt.Outcome)] = []
        for (index, route) in resolution.candidates.enumerated() {
            receipt.route = route
            let result: AttemptResult
            if route.delivery == .streamedPCM {
                result = await speakLocal(trimmed, route: route, token: token, elapsed: elapsed, emit: emit)
            } else {
                result = await speakCloud(trimmed, route: route, token: token, elapsed: elapsed, emit: emit)
            }
            receipt.firstAudioMs = result.firstAudioMs
            receipt.generationFinishedMs = result.generationFinishedMs
            receipt.playbackFinishedMs = result.playbackFinishedMs
            receipt.audioSeconds = result.audioSeconds

            switch result.outcome {
            case .playbackFinished, .generated:
                tried.append((route, .used))
                receipt.attempts = Self.mergeAttempts(policy: policy, skipped: resolution.attempts, tried: tried)
                receipt.outcome = .playbackFinished
                emit(.playbackFinished, route, nil, nil)
                return receipt
            case .cancelled:
                tried.append((route, .used))
                receipt.attempts = Self.mergeAttempts(policy: policy, skipped: resolution.attempts, tried: tried)
                return cancelledReceipt(receipt, emit: emit)
            case .failed(let message):
                tried.append((route, .failed(message)))
                receipt.attempts = Self.mergeAttempts(policy: policy, skipped: resolution.attempts, tried: tried)
                receipt.outcome = .failed(message)
                let canFallBack = policy.fallback == .whenUnavailableOrFailed
                    && result.firstAudioMs == nil
                    && index + 1 < resolution.candidates.count
                if !canFallBack {
                    emit(.failed, route, nil, message)
                    return receipt
                }
            }
        }

        if resolution.candidates.isEmpty {
            receipt.outcome = .failed(HudSpeechRoutingError.noRoute(receipt).localizedDescription)
            emit(.failed, nil, nil, receipt.outcome.message)
        }
        return receipt
    }

    /// Stop generation and audible playback. Late chunks from the stopped
    /// request are dropped. Idempotent.
    public func cancel() async {
        _ = await interrupt()
    }

    private func beginInterruption() -> (UInt64, Task<Void, Never>) {
        generation &+= 1
        let token = generation
        localTask?.cancel()
        localTask = nil
        pcmOutput.stop()
        hub.cancelAll()
        let prior = cloudCancellation
        let playback = cloudPlayback
        let stopping = Task {
            await prior?.value
            await playback.cancel()
        }
        cloudCancellation = stopping
        return (token, stopping)
    }

    private func interrupt() async -> UInt64 {
        let (token, stopping) = beginInterruption()
        await stopping.value
        return token
    }

    private func cancelledReceipt(
        _ receipt: HudSpeechReceipt,
        emit: (HudSpeechUtterancePhase, HudSpeechRoute?, HudLocalModelState?, String?) -> Void
    ) -> HudSpeechReceipt {
        var receipt = receipt
        receipt.outcome = .cancelled
        emit(.cancelled, receipt.route, nil, nil)
        return receipt
    }

    struct AttemptResult {
        var outcome: HudSpeechOutcome
        var firstAudioMs: Int?
        var generationFinishedMs: Int?
        var playbackFinishedMs: Int?
        var audioSeconds: Double?
    }

    private func speakCloud(
        _ text: String,
        route: HudSpeechRoute,
        token: UInt64,
        elapsed: @escaping @Sendable () -> Int,
        emit: @escaping @Sendable (HudSpeechUtterancePhase, HudSpeechRoute?, HudLocalModelState?, String?) -> Void
    ) async -> AttemptResult {
        let attemptId = UUID().uuidString
        let events = hub.subscribe(attemptId)
        let request = SynthesisRequest(
            requestId: attemptId,
            text: text,
            modelId: route.modelId,
            voiceId: route.voiceId,
            providerCredentials: HudSpeechSynthesizer.lentCredentials(credentials)
        )
        await cloudPlayback.speak(request)

        var result = AttemptResult(outcome: .cancelled)
        for await event in events {
            guard token == generation else { break }
            switch event.phase {
            case .resolving:
                break
            case .generating:
                emit(.generating, route, nil, nil)
            case .starting:
                result.firstAudioMs = elapsed()
                emit(.firstAudio, route, nil, nil)
                if route.delivery == .generatedAudio {
                    // The whole clip exists before the player starts.
                    result.generationFinishedMs = result.firstAudioMs
                    emit(.generationFinished, route, nil, nil)
                }
            case .playing:
                emit(.playing, route, nil, nil)
            case .finished:
                if result.generationFinishedMs == nil {
                    // The OS voice generates while it speaks; generation
                    // ends with the last word.
                    result.generationFinishedMs = elapsed()
                    emit(.generationFinished, route, nil, nil)
                }
                result.playbackFinishedMs = elapsed()
                result.outcome = .playbackFinished
            case .cancelled:
                result.outcome = .cancelled
            case .failed:
                result.outcome = .failed(event.error ?? "\(route.provider) failed")
            }
            if event.phase.isTerminal { break }
        }
        hub.unsubscribe(attemptId)
        if token != generation { result.outcome = .cancelled }
        return result
    }

    private func speakLocal(
        _ text: String,
        route: HudSpeechRoute,
        token: UInt64,
        elapsed: @escaping @Sendable () -> Int,
        emit: @escaping @Sendable (HudSpeechUtterancePhase, HudSpeechRoute?, HudLocalModelState?, String?) -> Void
    ) async -> AttemptResult {
        guard let engine = localEngines[route.provider] else {
            return AttemptResult(outcome: .failed("\(route.provider) is not registered"))
        }
        var result = AttemptResult(outcome: .cancelled)

        let preparing = await engine.currentState()
        if preparing != .ready {
            emit(.preparing, route, preparing, nil)
            // Subscribe before preparing so no compile/warm state is missed.
            let updates = await engine.stateUpdates()
            let watcher = Task {
                for await state in updates {
                    if Task.isCancelled { break }
                    if state == .compiling || state == .warming {
                        emit(.preparing, route, state, nil)
                    }
                    if state == .ready { break }
                }
            }
            defer { watcher.cancel() }
            do {
                try await engine.prepare()
            } catch {
                watcher.cancel()
                return AttemptResult(outcome: .failed(error.localizedDescription))
            }
            // prepare() ended at .ready, which is buffered in `updates`;
            // drain so every state reached the caller in order.
            if await engine.currentState() == .ready { await watcher.value } else { watcher.cancel() }
        }
        guard token == generation else { return result }

        let playbackToken: UInt64
        do {
            playbackToken = try pcmOutput.begin(sampleRate: engine.info.sampleRate)
        } catch {
            return AttemptResult(outcome: .failed("Audio output failed to start: \(error.localizedDescription)"))
        }

        emit(.generating, route, nil, nil)
        let output = pcmOutput
        let firstAudio = HudOnce()
        let firstAudioMs = HudLockedValue<Int?>(nil)
        let task = Task<HudLocalSynthesisStats, Error> {
            try await engine.synthesize(text, voiceId: route.voiceId) { samples in
                guard !samples.isEmpty, output.enqueue(samples, token: playbackToken) else { return }
                if firstAudio.claim() {
                    firstAudioMs.set(elapsed())
                    emit(.firstAudio, route, nil, nil)
                    emit(.playing, route, nil, nil)
                }
            }
        }
        localTask = task

        let stats: HudLocalSynthesisStats
        do {
            stats = try await task.value
        } catch {
            result.firstAudioMs = firstAudioMs.get()
            if token != generation || error is CancellationError {
                return result
            }
            pcmOutput.stop()
            result.outcome = .failed(error.localizedDescription)
            return result
        }
        if localTask == task { localTask = nil }
        result.firstAudioMs = firstAudioMs.get()
        result.audioSeconds = stats.audioSeconds
        guard token == generation else { return result }

        result.generationFinishedMs = elapsed()
        emit(.generationFinished, route, nil, nil)

        if result.firstAudioMs == nil {
            pcmOutput.stop()
            result.outcome = .failed("\(route.provider) produced no audio")
            return result
        }

        let played = await pcmOutput.finish(token: playbackToken)
        guard played, token == generation else { return result }
        result.playbackFinishedMs = elapsed()
        result.outcome = .playbackFinished
        return result
    }

    // MARK: Generate

    /// Produce playable audio without playing it. Local engines return
    /// 16-bit PCM WAV; cloud providers return their native format.
    public func generate(
        _ text: String,
        policy: HudSpeechPolicy,
        speed: Double? = nil,
        instructions: String? = nil,
        requestId: String = UUID().uuidString
    ) async throws -> HudSpeechGeneration {
        let clock = ContinuousClock()
        let start = clock.now
        let elapsed: @Sendable () -> Int = { Self.milliseconds(clock.now - start) }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw HudSpeechRoutingError.emptyText }

        let resolution = await resolve(policy)
        var receipt = HudSpeechReceipt(
            requestId: requestId,
            requested: policy.preferences.first,
            route: nil,
            attempts: Self.mergeAttempts(policy: policy, skipped: resolution.attempts, tried: []),
            outcome: .failed("no route")
        )
        guard !resolution.candidates.isEmpty else {
            throw HudSpeechRoutingError.noRoute(receipt)
        }

        var tried: [(HudSpeechRoute, HudSpeechAttempt.Outcome)] = []
        for (index, route) in resolution.candidates.enumerated() {
            receipt.route = route
            do {
                let (data, format, contentType, seconds, firstAudio, voiceId) = try await generateOne(
                    trimmed, route: route, speed: speed, instructions: instructions, elapsed: elapsed
                )
                tried.append((route, .used))
                receipt.route?.voiceId = voiceId ?? route.voiceId
                receipt.attempts = Self.mergeAttempts(policy: policy, skipped: resolution.attempts, tried: tried)
                receipt.outcome = .generated
                receipt.audioSeconds = seconds
                receipt.firstAudioMs = firstAudio
                receipt.generationFinishedMs = elapsed()
                return HudSpeechGeneration(data: data, format: format, contentType: contentType, receipt: receipt)
            } catch is CancellationError {
                receipt.outcome = .cancelled
                throw HudSpeechRoutingError.cancelled(receipt)
            } catch {
                let message = error.localizedDescription
                tried.append((route, .failed(message)))
                receipt.attempts = Self.mergeAttempts(policy: policy, skipped: resolution.attempts, tried: tried)
                receipt.outcome = .failed(message)
                let canFallBack = policy.fallback == .whenUnavailableOrFailed && index + 1 < resolution.candidates.count
                if !canFallBack { throw HudSpeechRoutingError.failed(receipt) }
            }
        }
        throw HudSpeechRoutingError.failed(receipt)
    }

    private func generateOne(
        _ text: String,
        route: HudSpeechRoute,
        speed: Double?,
        instructions: String?,
        elapsed: @escaping @Sendable () -> Int
    ) async throws -> (Data, String, String, Double?, Int?, String?) {
        if route.delivery != .streamedPCM {
            let audio = try await cloudSynthesis.synthesize(
                text, modelId: route.modelId, voiceId: route.voiceId, speed: speed, instructions: instructions
            )
            return (audio.data, audio.format, audio.contentType, nil, nil, audio.voiceId.isEmpty ? nil : audio.voiceId)
        }
        guard let engine = localEngines[route.provider] else {
            throw HudSpeechError.unknownModel(route.modelId)
        }
        try await engine.prepare()
        let samples = HudLockedValue<[Float]>([])
        let firstAudioMs = HudLockedValue<Int?>(nil)
        let stats = try await engine.synthesize(text, voiceId: route.voiceId) { chunk in
            guard !chunk.isEmpty else { return }
            firstAudioMs.mutate { if $0 == nil { $0 = elapsed() } }
            samples.mutate { $0 += chunk }
        }
        try Task.checkCancellation()
        let pcm = samples.get()
        guard !pcm.isEmpty else { throw HudSpeechError.noAudio }
        let wav = HudSpeechWAV.encode(pcm, sampleRate: engine.info.sampleRate)
        return (wav, "wav", "audio/wav", stats.audioSeconds, firstAudioMs.get(), route.voiceId ?? engine.info.defaultVoiceId)
    }

    // MARK: Helpers

    /// Attempts in policy order: skipped ones with their reason, tried ones
    /// with their result.
    static func mergeAttempts(
        policy: HudSpeechPolicy,
        skipped: [HudSpeechAttempt],
        tried: [(HudSpeechRoute, HudSpeechAttempt.Outcome)]
    ) -> [HudSpeechAttempt] {
        var skippedQueue = skipped
        var triedQueue = tried
        var merged: [HudSpeechAttempt] = []
        for preference in policy.preferences {
            if let index = skippedQueue.firstIndex(where: { $0.preference == preference }) {
                merged.append(skippedQueue.remove(at: index))
            } else if let index = triedQueue.firstIndex(where: { $0.0.provider == preference.provider }) {
                merged.append(HudSpeechAttempt(preference: preference, outcome: triedQueue.remove(at: index).1))
            }
        }
        return merged
    }

    static func availability(for state: HudLocalModelState) -> HudSpeechAvailability {
        switch state {
        case .unsupported(let detail): return .unsupported(detail)
        case .notInstalled: return .notInstalled
        case .downloading, .verifying: return .installing
        case .installed, .compiling, .warming, .ready: return .available
        case .failed(let failure):
            return failure.kind == .unsupported ? .unsupported(failure.message) : .failed(failure.message)
        }
    }

    static func milliseconds(_ duration: Duration) -> Int {
        let (seconds, attoseconds) = duration.components
        return Int(seconds) * 1000 + Int(attoseconds / 1_000_000_000_000_000)
    }
}

extension HudSpeechOutcome {
    var message: String? {
        if case .failed(let message) = self { return message }
        return nil
    }
}

extension SpeechOutputPhase {
    var isTerminal: Bool {
        self == .finished || self == .cancelled || self == .failed
    }
}

// MARK: - Cloud seams

/// The part of `HudSpeechSynthesizer` the router uses for generation and
/// voice lists. A seam for tests.
protocol HudSpeechCloudSynthesizing: Sendable {
    func voices(modelId: String) async throws -> [HudSpeechVoice]
    func synthesize(_ text: String, modelId: String, voiceId: String?, speed: Double?, instructions: String?) async throws -> HudSpeechAudio
}

extension HudSpeechSynthesizer: HudSpeechCloudSynthesizing {}

/// Fans Vox playback events out to the attempt waiting on each request id.
final class HudSpeechEventHub: @unchecked Sendable {
    private let lock = NSLock()
    private var waiters: [String: AsyncStream<SpeechOutputEvent>.Continuation] = [:]

    func subscribe(_ requestId: String) -> AsyncStream<SpeechOutputEvent> {
        let (stream, continuation) = AsyncStream<SpeechOutputEvent>.makeStream()
        lock.lock()
        waiters[requestId] = continuation
        lock.unlock()
        return stream
    }

    func unsubscribe(_ requestId: String) {
        lock.lock()
        let continuation = waiters.removeValue(forKey: requestId)
        lock.unlock()
        continuation?.finish()
    }

    func deliver(_ event: SpeechOutputEvent) {
        lock.lock()
        let continuation = waiters[event.requestId]
        lock.unlock()
        continuation?.yield(event)
    }

    func cancelAll() {
        lock.lock()
        let all = waiters
        waiters.removeAll()
        lock.unlock()
        for continuation in all.values { continuation.finish() }
    }
}

final class HudOnce: @unchecked Sendable {
    private let lock = NSLock()
    private var claimed = false

    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if claimed { return false }
        claimed = true
        return true
    }
}

final class HudLockedValue<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value

    init(_ value: Value) { self.value = value }

    func get() -> Value {
        lock.lock()
        defer { lock.unlock() }
        return value
    }

    func set(_ next: Value) {
        lock.lock()
        value = next
        lock.unlock()
    }

    func mutate(_ body: (inout Value) -> Void) {
        lock.lock()
        body(&value)
        lock.unlock()
    }
}

extension HudSpeechPolicy {
    /// Give `provider`'s preference this voice; voices never carry to another provider.
    mutating func applyVoice(_ voiceId: String?, to provider: HudVoiceProviderID?) {
        guard let voiceId, let provider,
              let index = preferences.firstIndex(where: { $0.provider == provider }) else { return }
        preferences[index].voiceId = voiceId
    }
}
