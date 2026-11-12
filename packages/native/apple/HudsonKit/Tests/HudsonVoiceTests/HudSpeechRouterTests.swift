import Foundation
import Testing
import VoxAppleSpeech
import VoxCore
import VoxEngine
@testable import HudsonVoice

// Router behavior with fake engines, fake audio output and a scripted cloud
// controller. Nothing here downloads, loads a model or reaches the network.

// MARK: - Fakes

extension HudVoiceProviderID {
    /// A stand-in on-device engine. HudsonVoice names no engine of its own.
    static let testEngine = HudVoiceProviderID(rawValue: "test-engine")
    static let otherEngine = HudVoiceProviderID(rawValue: "other-engine")
}

actor FirstCancelGate {
    private var entered = false
    private var released = false
    private var enterWaiters: [CheckedContinuation<Void, Never>] = []
    private var releaseWaiter: CheckedContinuation<Void, Never>?

    func blockOnce() async {
        guard !entered else { return }
        entered = true
        for waiter in enterWaiters { waiter.resume() }
        enterWaiters.removeAll()
        if released { return }
        await withCheckedContinuation { releaseWaiter = $0 }
    }

    func waitUntilBlocked() async {
        if entered { return }
        await withCheckedContinuation { enterWaiters.append($0) }
    }

    func release() {
        released = true
        releaseWaiter?.resume()
        releaseWaiter = nil
    }
}

actor FakeLocalEngine: HudLocalSpeechEngine {
    nonisolated let info: HudLocalSpeechModelInfo
    private let states: HudLocalModelStateBroadcaster
    var chunks: Int
    var chunkDelay: Duration
    var failBeforeAudio: String?
    var failAfterChunks: Int?
    private(set) var prepareCount = 0
    private(set) var installCount = 0
    private(set) var voicesRequested: [String?] = []
    private(set) var producedChunks = 0

    init(
        provider: HudVoiceProviderID = .testEngine,
        state: HudLocalModelState = .installed,
        chunks: Int = 3,
        chunkDelay: Duration = .milliseconds(5)
    ) {
        info = HudLocalSpeechModelInfo(
            provider: provider,
            modelId: "\(provider.rawValue):test",
            name: "Fake \(provider.rawValue)",
            version: "1",
            license: "test",
            languages: ["en"],
            sampleRate: 24_000,
            downloadBytes: nil,
            installedBytes: nil,
            defaultVoiceId: "default"
        )
        states = HudLocalModelStateBroadcaster(state)
        self.chunks = chunks
        self.chunkDelay = chunkDelay
    }

    func configure(chunks: Int? = nil, delay: Duration? = nil, failBeforeAudio: String? = nil, failAfterChunks: Int? = nil) {
        if let chunks { self.chunks = chunks }
        if let delay { self.chunkDelay = delay }
        self.failBeforeAudio = failBeforeAudio
        self.failAfterChunks = failAfterChunks
    }

    func setState(_ state: HudLocalModelState) { states.send(state) }

    func currentState() async -> HudLocalModelState { states.current }
    func stateUpdates() async -> AsyncStream<HudLocalModelState> { states.stream() }
    func install() async throws {
        installCount += 1
        states.send(.downloading(0.5))
        states.send(.verifying)
        states.send(.installed)
    }
    func cancelInstall() async {}
    func uninstall() async throws { states.send(.notInstalled) }
    func verify() async throws {}

    func prepare() async throws {
        prepareCount += 1
        if states.current == .ready { return }
        states.send(.compiling)
        states.send(.warming)
        states.send(.ready)
    }

    func unload() async { states.send(.installed) }

    func voices() async throws -> [HudLocalSpeechVoice] {
        [HudLocalSpeechVoice(id: "default", name: "Default"), HudLocalSpeechVoice(id: "Alfie", name: "Alfie")]
    }

    func synthesize(
        _ text: String,
        voiceId: String?,
        onChunk: @escaping @Sendable ([Float]) -> Void
    ) async throws -> HudLocalSynthesisStats {
        try await prepare()
        voicesRequested.append(voiceId)
        if let failBeforeAudio { throw HudLocalModelFailure(kind: .synthesis, message: failBeforeAudio) }
        for index in 0..<chunks {
            if let failAfterChunks, index == failAfterChunks {
                throw HudLocalModelFailure(kind: .synthesis, message: "broke mid-utterance")
            }
            // Keep producing after cancellation for one chunk, like a real
            // engine finishing its current 80 ms step.
            try? await Task.sleep(for: chunkDelay)
            onChunk([Float](repeating: Float(index % 100) / 100, count: 1920))
            producedChunks += 1
            if Task.isCancelled { throw CancellationError() }
        }
        return HudLocalSynthesisStats(audioSeconds: Double(chunks) * 0.08, firstAudioMs: 1)
    }
}

final class FakePCMOutput: HudPCMOutput, @unchecked Sendable {
    private let lock = NSLock()
    private var token: UInt64 = 0
    private(set) var accepted: [(UInt64, Int)] = []
    private(set) var dropped = 0
    private(set) var stops = 0
    var playDuration: Duration = .milliseconds(20)

    func begin(sampleRate: Double) throws -> UInt64 {
        lock.lock(); defer { lock.unlock() }
        token &+= 1
        return token
    }

    func enqueue(_ samples: [Float], token expected: UInt64) -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard expected == token else { dropped += 1; return false }
        accepted.append((expected, samples.count))
        return true
    }

    func finish(token expected: UInt64) async -> Bool {
        try? await Task.sleep(for: playDuration)
        lock.lock(); defer { lock.unlock() }
        return expected == token
    }

    func stop() {
        lock.lock(); defer { lock.unlock() }
        token &+= 1
        stops += 1
    }

    var acceptedCount: Int { lock.lock(); defer { lock.unlock() }; return accepted.count }
    var droppedCount: Int { lock.lock(); defer { lock.unlock() }; return dropped }
}

/// Scripted Vox controller: emits the phases a real one would, through the
/// router's hub.
final class FakeCloud: HudSpeechPlaybackControlling, HudSpeechCloudSynthesizing, @unchecked Sendable {
    enum Script { case succeed, failBeforeAudio(String) }

    private let lock = NSLock()
    let hub: HudSpeechEventHub
    let credentials: [HudSpeechProvider: String]
    let cancelGate: FirstCancelGate?
    var script: Script = .succeed
    private(set) var spoken: [SynthesisRequest] = []
    private(set) var synthesized: [String] = []
    private(set) var synthesisOptions: [(Double?, String?)] = []
    private var current: Task<Void, Never>?

    init(hub: HudSpeechEventHub, credentials: [HudSpeechProvider: String], cancelGate: FirstCancelGate? = nil) {
        self.hub = hub
        self.credentials = credentials
        self.cancelGate = cancelGate
    }

    var spokenModels: [String] { lock.lock(); defer { lock.unlock() }; return spoken.map(\.modelId) }
    var spokenCount: Int { lock.lock(); defer { lock.unlock() }; return spoken.count }

    func speak(_ request: SynthesisRequest) async {
        lock.lock()
        spoken.append(request)
        let script = self.script
        current?.cancel()
        lock.unlock()
        let hub = self.hub
        let delivery: SpeechOutputDelivery = request.modelId == "avspeech:system" ? .liveSystem : .generatedAudio
        func event(_ phase: SpeechOutputPhase, _ error: String? = nil) -> SpeechOutputEvent {
            SpeechOutputEvent(
                requestId: request.requestId,
                generation: 1,
                phase: phase,
                synthesis: SpeechSynthesisIdentity(requestedModelId: request.modelId, delivery: delivery),
                audioOutput: SpeechAudioOutputRoute(kind: delivery == .liveSystem ? .systemSynthesizer : .generatedAudioPlayer),
                error: error
            )
        }
        let task = Task {
            hub.deliver(event(.resolving))
            hub.deliver(event(.generating))
            try? await Task.sleep(for: .milliseconds(5))
            if case .failBeforeAudio(let message) = script {
                hub.deliver(event(.failed, message))
                return
            }
            if Task.isCancelled { hub.deliver(event(.cancelled)); return }
            hub.deliver(event(.starting))
            hub.deliver(event(.playing))
            try? await Task.sleep(for: .milliseconds(20))
            if Task.isCancelled { hub.deliver(event(.cancelled)); return }
            hub.deliver(event(.finished))
        }
        lock.lock()
        current = task
        lock.unlock()
    }

    func stop() async { await cancel() }

    func cancel() async {
        await cancelGate?.blockOnce()
        lock.lock()
        current?.cancel()
        lock.unlock()
    }

    func voices(modelId: String) async throws -> [HudSpeechVoice] { [] }

    func synthesize(_ text: String, modelId: String, voiceId: String?, speed: Double?, instructions: String?) async throws -> HudSpeechAudio {
        lock.lock()
        synthesized.append(modelId)
        synthesisOptions.append((speed, instructions))
        lock.unlock()
        if case .failBeforeAudio(let message) = script { throw HudSpeechError.synthesisFailed(message) }
        return HudSpeechAudio(
            data: Data([1, 2, 3]),
            modelId: modelId,
            voiceId: voiceId ?? "",
            provider: HudSpeechProvider.owning(modelId: modelId) ?? .system,
            format: "mp3",
            contentType: "audio/mpeg",
            elapsedMs: 1
        )
    }
}

final class CloudBox: @unchecked Sendable {
    private let lock = NSLock()
    private var all: [FakeCloud] = []
    var script: FakeCloud.Script = .succeed
    let cancelGate: FirstCancelGate?

    init(cancelGate: FirstCancelGate? = nil) {
        self.cancelGate = cancelGate
    }

    func make(_ credentials: [HudSpeechProvider: String], _ hub: HudSpeechEventHub) -> FakeCloud {
        let cloud = FakeCloud(hub: hub, credentials: credentials, cancelGate: cancelGate)
        lock.lock()
        cloud.script = script
        all.append(cloud)
        lock.unlock()
        return cloud
    }

    var latest: FakeCloud? { lock.lock(); defer { lock.unlock() }; return all.last }
    var builds: Int { lock.lock(); defer { lock.unlock() }; return all.count }
}

final class EventLog: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [HudSpeechUtteranceEvent] = []
    func append(_ event: HudSpeechUtteranceEvent) { lock.lock(); storage.append(event); lock.unlock() }
    var phases: [HudSpeechUtterancePhase] { lock.lock(); defer { lock.unlock() }; return storage.map(\.phase) }
    var events: [HudSpeechUtteranceEvent] { lock.lock(); defer { lock.unlock() }; return storage }
}

func makeRouter(
    credentials: [HudSpeechProvider: String] = [:],
    engines: [any HudLocalSpeechEngine] = [],
    output: FakePCMOutput = FakePCMOutput(),
    cloud: CloudBox = CloudBox()
) -> HudSpeechRouter {
    HudSpeechRouter(
        credentials: credentials,
        localEngines: engines,
        pcmOutput: output,
        makeCloud: { credentials, hub in
            let fake = cloud.make(credentials, hub)
            return (fake, fake)
        }
    )
}

// MARK: - Resolution

@Suite struct HudSpeechRouterResolutionTests {
    @Test func explicitChoiceWithoutKeyIsReportedNotReplaced() async {
        let router = makeRouter(engines: [FakeLocalEngine()])
        let policy = HudSpeechPolicy.explicit(HudSpeechPreference(provider: .elevenLabs, voiceId: "voice-1"))
        let resolution = await router.resolve(policy)
        #expect(resolution.route == nil)
        #expect(resolution.attempts == [HudSpeechAttempt(preference: policy.preferences[0], outcome: .skipped(.missingCredential))])
        // The policy value itself is untouched.
        #expect(policy.preferences == [HudSpeechPreference(provider: .elevenLabs, voiceId: "voice-1")])

        let receipt = await router.speak("hello", policy: policy)
        #expect(receipt.route == nil)
        #expect(receipt.requested?.provider == .elevenLabs)
        guard case .failed = receipt.outcome else { Issue.record("expected failure"); return }
    }

    @Test func cloudFirstFallsToInstalledLocalEngineAndSaysWhy() async {
        let router = makeRouter(engines: [FakeLocalEngine()])
        let resolution = await router.resolve(router.cloudFirstPolicy())
        #expect(resolution.route?.provider == .testEngine)
        #expect(resolution.route?.isLocal == true)
        #expect(resolution.attempts.map(\.outcome) == [.skipped(.missingCredential), .skipped(.missingCredential)])

        let receipt = await router.speak("hello", policy: await router.cloudFirstPolicy())
        #expect(receipt.outcome == .playbackFinished)
        #expect(receipt.route?.provider == .testEngine)
        #expect(receipt.usedFallback)
        #expect(receipt.fallbackReason == "elevenLabs: no credential")
    }

    @Test func hostOrderIsHonored() async {
        let router = makeRouter(credentials: [.openAI: "sk-test", .elevenLabs: "el-test"])
        let policy = HudSpeechPolicy(preferences: [
            HudSpeechPreference(provider: .openAI, modelId: "tts-1", voiceId: "alloy"),
            HudSpeechPreference(provider: .elevenLabs),
        ])
        let route = await router.resolve(policy).route
        #expect(route == HudSpeechRoute(provider: .openAI, modelId: "tts-1", voiceId: "alloy", isLocal: false, delivery: .generatedAudio))
    }

    @Test func localOnlyNeverEscalatesToCloud() async {
        let cloud = CloudBox()
        let engine = FakeLocalEngine(state: .notInstalled)
        let router = makeRouter(credentials: [.openAI: "sk-test", .elevenLabs: "el-test"], engines: [engine], cloud: cloud)
        let policy = HudSpeechPolicy(
            preferences: [
                HudSpeechPreference(provider: .testEngine),
                HudSpeechPreference(provider: .openAI),
                HudSpeechPreference(provider: .elevenLabs),
            ],
            fallback: .whenUnavailableOrFailed,
            locality: .localOnly
        )
        let receipt = await router.speak("hello", policy: policy)
        #expect(receipt.route == nil)
        #expect(receipt.attempts.map(\.outcome) == [
            .skipped(.notInstalled), .skipped(.blockedByLocality), .skipped(.blockedByLocality),
        ])
        #expect(cloud.latest?.spokenModels.isEmpty == true)
        #expect(await engine.installCount == 0)
    }

    @Test func modelIdsStayWithTheirProvider() async {
        let router = makeRouter(credentials: [.openAI: "sk-test"], engines: [FakeLocalEngine()])
        let mismatch = HudSpeechPreference(provider: .openAI, modelId: "eleven_multilingual_v2")
        let local = HudSpeechPreference(provider: .testEngine, modelId: "tts-1")
        let resolution = await router.resolve(HudSpeechPolicy(preferences: [mismatch, local, HudSpeechPreference(provider: .system)]))
        #expect(resolution.attempts.map(\.outcome) == [
            .skipped(.modelProviderMismatch("eleven_multilingual_v2")),
            .skipped(.modelProviderMismatch("tts-1")),
        ])
        #expect(resolution.route?.provider == .system)
        #expect(resolution.route?.modelId == "avspeech:system")
    }

    @Test func unknownLocalVoiceIsSkipped() async {
        let router = makeRouter(engines: [FakeLocalEngine()])
        let resolution = await router.resolve(.explicit(HudSpeechPreference(provider: .testEngine, voiceId: "Nobody")))
        #expect(resolution.attempts.first?.outcome == .skipped(.unknownVoice("Nobody")))
    }

    @Test func localModelStatesMapToReasons() async {
        let unsupported = FakeLocalEngine(provider: HudVoiceProviderID(rawValue: "a"), state: .unsupported("needs arm64"))
        let installing = FakeLocalEngine(provider: HudVoiceProviderID(rawValue: "b"), state: .downloading(0.4))
        let corrupt = FakeLocalEngine(
            provider: HudVoiceProviderID(rawValue: "c"),
            state: .failed(HudLocalModelFailure(kind: .integrity, message: "host.safetensors fails its SHA-256 check"))
        )
        let router = makeRouter(engines: [unsupported, installing, corrupt])
        let policy = HudSpeechPolicy(preferences: ["a", "b", "c", "missing"].map { HudSpeechPreference(provider: HudVoiceProviderID(rawValue: $0)) })
        let resolution = await router.resolve(policy)
        #expect(resolution.attempts.map(\.outcome) == [
            .skipped(.unsupportedHardware("needs arm64")),
            .skipped(.installing),
            .skipped(.modelFailed("host.safetensors fails its SHA-256 check")),
            .skipped(.unknownProvider),
        ])
        let catalog = await router.catalog()
        #expect(catalog.provider(HudVoiceProviderID(rawValue: "a"))?.availability == .unsupported("needs arm64"))
        #expect(catalog.provider(HudVoiceProviderID(rawValue: "c"))?.models.first?.localState != nil)
    }

    @Test func fallbackNoneStopsAfterFirst() async {
        let router = makeRouter(engines: [FakeLocalEngine()])
        let policy = HudSpeechPolicy(
            preferences: [HudSpeechPreference(provider: .openAI), HudSpeechPreference(provider: .testEngine)],
            fallback: .none
        )
        let resolution = await router.resolve(policy)
        #expect(resolution.route == nil)
        #expect(resolution.attempts.map(\.outcome) == [.skipped(.missingCredential), .skipped(.fallbackDisabled)])
    }

    @Test func keyChangesReRouteAndRebuildCloud() async {
        let cloud = CloudBox()
        let router = makeRouter(engines: [FakeLocalEngine()], cloud: cloud)
        #expect(await router.resolve(router.cloudFirstPolicy()).route?.provider == .testEngine)

        await router.updateCredentials([.elevenLabs: "  el-key  "])
        #expect(cloud.builds == 2)
        #expect(cloud.latest?.credentials == [.elevenLabs: "el-key"])
        #expect(await router.resolve(router.cloudFirstPolicy()).route?.provider == .elevenLabs)

        await router.updateCredentials([.elevenLabs: "el-key"])
        #expect(cloud.builds == 2, "unchanged keys do not rebuild")

        await router.updateCredentials([:])
        #expect(await router.resolve(router.cloudFirstPolicy()).route?.provider == .testEngine)
    }

    @Test func catalogListsUnavailableModelsWithoutNetwork() async {
        let router = makeRouter(engines: [FakeLocalEngine(state: .notInstalled)])
        let catalog = await router.catalog()
        #expect(catalog.provider(.openAI)?.availability == .missingCredential)
        #expect(catalog.provider(.openAI)?.models.contains { $0.id == "gpt-4o-mini-tts" } == true)
        #expect(catalog.provider(.system)?.availability == .available)
        #expect(catalog.provider(.testEngine)?.availability == .notInstalled)
        #expect(catalog.provider(.testEngine)?.isLocal == true)
    }
}

// MARK: - Speak, cancel, receipts

@Suite struct HudSpeechRouterPlaybackTests {
    @Test func overlappingStartsCannotReviveTheOlderUtterance() async throws {
        let gate = FirstCancelGate()
        let cloud = CloudBox(cancelGate: gate)
        let router = makeRouter(credentials: [.openAI: "sk-test"], cloud: cloud)
        let policy = HudSpeechPolicy.explicit(HudSpeechPreference(provider: .openAI))
        let first = Task { await router.speak("first", policy: policy, requestId: "first") }
        await gate.waitUntilBlocked()
        let second = Task { await router.speak("second", policy: policy, requestId: "second") }
        try await Task.sleep(for: .milliseconds(40))
        await gate.release()

        #expect(await first.value.outcome == .cancelled)
        #expect(await second.value.outcome == .playbackFinished)
        #expect(cloud.latest?.spokenCount == 1, "only the newest request may reach playback")
    }

    @Test func localSpeechSeparatesGenerationFromPlayback() async {
        let engine = FakeLocalEngine(chunks: 4)
        let output = FakePCMOutput()
        output.playDuration = .milliseconds(50)
        let router = makeRouter(engines: [engine], output: output)
        let log = EventLog()
        let receipt = await router.speak("hello", policy: await router.localOnlyPolicy(), requestId: "r1") { log.append($0) }

        #expect(receipt.requestId == "r1")
        #expect(receipt.outcome == .playbackFinished)
        #expect(receipt.route?.delivery == .streamedPCM)
        let phases = log.phases
        #expect(phases.first == .resolving)
        #expect(phases.contains(.preparing))
        let generation = phases.firstIndex(of: .generationFinished)
        let playback = phases.firstIndex(of: .playbackFinished)
        #expect(generation != nil && playback != nil && generation! < playback!)
        #expect(phases.firstIndex(of: .firstAudio)! < generation!)
        let first = receipt.firstAudioMs ?? -1, gen = receipt.generationFinishedMs ?? -1, play = receipt.playbackFinishedMs ?? -1
        #expect(first >= 0 && first <= gen && gen < play)
        #expect(output.acceptedCount == 4)
        #expect(receipt.audioSeconds == 0.32)
        // Preparing events report compile/warm states.
        #expect(log.events.compactMap(\.localState).contains(.warming))
    }

    @Test func warmEngineIsReused() async {
        let engine = FakeLocalEngine()
        let router = makeRouter(engines: [engine])
        _ = await router.speak("one", policy: await router.localOnlyPolicy())
        let log = EventLog()
        _ = await router.speak("two", policy: await router.localOnlyPolicy()) { log.append($0) }
        #expect(!log.phases.contains(.preparing), "a ready engine skips preparing")
        #expect(await engine.currentState() == .ready)
    }

    @Test func cancelStopsGenerationAndDropsLateAudio() async throws {
        let engine = FakeLocalEngine(chunks: 50, chunkDelay: .milliseconds(10))
        let output = FakePCMOutput()
        let router = makeRouter(engines: [engine], output: output)
        let log = EventLog()
        let speaking = Task { await router.speak("long", policy: await router.localOnlyPolicy()) { log.append($0) } }
        try await Task.sleep(for: .milliseconds(80))
        await router.cancel()
        let receipt = await speaking.value
        #expect(receipt.outcome == .cancelled)
        #expect(log.phases.last == .cancelled)
        #expect(!log.phases.contains(.playbackFinished))

        let acceptedAtCancel = output.acceptedCount
        try await Task.sleep(for: .milliseconds(60))
        #expect(output.acceptedCount == acceptedAtCancel, "no audio is queued after cancel")
        #expect(await engine.producedChunks < 50, "generation stopped early")
    }

    @Test func newRequestBargesIn() async throws {
        let engine = FakeLocalEngine(chunks: 40, chunkDelay: .milliseconds(10))
        let router = makeRouter(engines: [engine])
        let first = Task { await router.speak("first", policy: await router.localOnlyPolicy(), requestId: "first") }
        try await Task.sleep(for: .milliseconds(50))
        await engine.configure(chunks: 2)
        let second = await router.speak("second", policy: await router.localOnlyPolicy(), requestId: "second")
        #expect(await first.value.outcome == .cancelled)
        #expect(second.outcome == .playbackFinished)
    }

    @Test func voiceSwitchingPassesProviderCorrectVoices() async {
        let engine = FakeLocalEngine()
        let router = makeRouter(engines: [engine])
        _ = await router.speak("a", policy: .explicit(HudSpeechPreference(provider: .testEngine, voiceId: "Alfie")))
        _ = await router.speak("b", policy: .explicit(HudSpeechPreference(provider: .testEngine, voiceId: "default")))
        _ = await router.speak("c", policy: .explicit(HudSpeechPreference(provider: .testEngine)))
        #expect(await engine.voicesRequested == ["Alfie", "default", nil])
    }

    @Test func runtimeFailureBeforeAudioFallsBack() async {
        let engine = FakeLocalEngine()
        await engine.configure(failBeforeAudio: "model broke")
        let cloud = CloudBox()
        let router = makeRouter(engines: [engine], cloud: cloud)
        let receipt = await router.speak("hello", policy: await router.localOnlyPolicy())
        #expect(receipt.outcome == .playbackFinished)
        #expect(receipt.route?.provider == .system)
        #expect(receipt.attempts.map(\.outcome) == [.failed("model broke"), .used])
        #expect(receipt.fallbackReason == "test-engine failed: model broke")
        #expect(cloud.latest?.spokenModels == ["avspeech:system"])
    }

    @Test func whenUnavailableDoesNotRetryFailures() async {
        let engine = FakeLocalEngine()
        await engine.configure(failBeforeAudio: "model broke")
        let router = makeRouter(engines: [engine])
        let policy = HudSpeechPolicy(
            preferences: [HudSpeechPreference(provider: .testEngine), HudSpeechPreference(provider: .system)],
            fallback: .whenUnavailable
        )
        let receipt = await router.speak("hello", policy: policy)
        #expect(receipt.outcome == .failed("model broke"))
        #expect(receipt.route?.provider == .testEngine)
    }

    @Test func failureAfterAudioIsNotRetried() async {
        let engine = FakeLocalEngine(chunks: 5)
        await engine.configure(failAfterChunks: 2)
        let cloud = CloudBox()
        let router = makeRouter(engines: [engine], cloud: cloud)
        let receipt = await router.speak("hello", policy: await router.localOnlyPolicy())
        #expect(receipt.outcome == .failed("broke mid-utterance"))
        #expect(receipt.firstAudioMs != nil)
        #expect(cloud.latest?.spokenModels.isEmpty == true, "nothing is spoken twice")
    }

    @Test func cloudGeneratedAudioReportsGenerationThenPlayback() async {
        let cloud = CloudBox()
        let router = makeRouter(credentials: [.openAI: "sk-test"], cloud: cloud)
        let log = EventLog()
        let receipt = await router.speak("hello", policy: .explicit(HudSpeechPreference(provider: .openAI, modelId: "tts-1", voiceId: "alloy"))) {
            log.append($0)
        }
        #expect(receipt.outcome == .playbackFinished)
        #expect(receipt.route?.provider == .openAI)
        #expect(receipt.route?.voiceId == "alloy")
        #expect(!receipt.usedFallback)
        let phases = log.phases
        #expect(phases.firstIndex(of: .generationFinished)! < phases.firstIndex(of: .playbackFinished)!)
        #expect(cloud.latest?.spokenModels == ["tts-1"])
    }

    @Test func cloudFailureBeforeAudioFallsBackToLocal() async {
        let cloud = CloudBox()
        cloud.script = .failBeforeAudio("401 invalid key")
        let router = makeRouter(credentials: [.elevenLabs: "bad"], engines: [FakeLocalEngine()], cloud: cloud)
        let receipt = await router.speak("hello", policy: await router.cloudFirstPolicy())
        #expect(receipt.route?.provider == .testEngine)
        #expect(receipt.outcome == .playbackFinished)
        #expect(receipt.fallbackReason == "elevenLabs failed: 401 invalid key")
    }

    @Test func longTextStreamsEveryChunkInOrder() async {
        let engine = FakeLocalEngine(chunks: 300, chunkDelay: .zero)
        let output = FakePCMOutput()
        let router = makeRouter(engines: [engine], output: output)
        let text = String(repeating: "This is a long sentence for the local engine. ", count: 200)
        let receipt = await router.speak(text, policy: await router.localOnlyPolicy())
        #expect(receipt.outcome == .playbackFinished)
        #expect(output.acceptedCount == 300)
        #expect(receipt.audioSeconds == 24)
    }

    @Test func emptyTextFailsWithoutRouting() async {
        let cloud = CloudBox()
        let router = makeRouter(cloud: cloud)
        let receipt = await router.speak("   ", policy: await router.cloudFirstPolicy())
        guard case .failed = receipt.outcome else { Issue.record("expected failure"); return }
        #expect(cloud.latest?.spokenModels.isEmpty == true)
    }
}

// MARK: - Generate

@Suite struct HudSpeechRouterGenerationTests {
    @Test func firstAudioReceiptUsesTheFirstChunkTime() async throws {
        let engine = FakeLocalEngine(chunks: 3, chunkDelay: .milliseconds(50))
        let router = makeRouter(engines: [engine])
        let generated = try await router.generate("hello", policy: await router.localOnlyPolicy())
        let first = try #require(generated.receipt.firstAudioMs)
        let finished = try #require(generated.receipt.generationFinishedMs)
        #expect(first >= 20)
        #expect(finished - first >= 60, "first audio precedes the last two chunks")
    }

    @Test func localGenerationReturnsPlayableWAV() async throws {
        let engine = FakeLocalEngine(chunks: 25)
        let output = FakePCMOutput()
        let router = makeRouter(engines: [engine], output: output)
        let generation = try await router.generate("hello", policy: await router.localOnlyPolicy())
        #expect(generation.format == "wav")
        #expect(generation.contentType == "audio/wav")
        #expect(String(data: generation.data.prefix(4), encoding: .ascii) == "RIFF")
        #expect(HudSpeechWAV.duration(of: generation.data) == 2.0)
        #expect(generation.receipt.outcome == .generated)
        #expect(generation.receipt.route?.provider == .testEngine)
        #expect(output.acceptedCount == 0, "generation does not play")
    }

    @Test func cloudGenerationKeepsProviderFormat() async throws {
        let box = CloudBox()
        let router = makeRouter(credentials: [.openAI: "sk-test"], cloud: box)
        let generation = try await router.generate(
            "hello", policy: .explicit(HudSpeechPreference(provider: .openAI)),
            speed: 1.1, instructions: "Speak warmly"
        )
        #expect(generation.format == "mp3")
        #expect(generation.receipt.route?.modelId == HudSpeechProvider.openAI.modelIds.first)
        #expect(box.latest?.synthesisOptions.first?.0 == 1.1)
        #expect(box.latest?.synthesisOptions.first?.1 == "Speak warmly")
    }

    @Test func generationWithNoRouteThrowsWithReceipt() async {
        let router = makeRouter()
        do {
            _ = try await router.generate("hello", policy: .explicit(HudSpeechPreference(provider: .testEngine)))
            Issue.record("expected throw")
        } catch let error as HudSpeechRoutingError {
            #expect(error.receipt?.attempts.first?.outcome == .skipped(.unknownProvider))
        } catch {
            Issue.record("unexpected \(error)")
        }
    }

    @Test func wavEncoderClampsAndSizes() {
        let wav = HudSpeechWAV.encode([0, 2, -2, 0.5], sampleRate: 24_000)
        #expect(wav.count == 44 + 8)
        #expect(HudSpeechWAV.duration(of: wav) == 4.0 / 24_000)
    }
}

// MARK: - Registered engines, policies and preload

@Suite struct HudSpeechLocalEngineRegistryTests {
    @Test func policiesFollowRegisteredEnginesNotANamedOne() async {
        let router = makeRouter(engines: [FakeLocalEngine(), FakeLocalEngine(provider: .otherEngine)])
        #expect(await router.localEngineIDs == [.testEngine, .otherEngine])
        #expect(await router.localOnlyPolicy().preferences.map(\.provider) == [.testEngine, .otherEngine, .system])

        let preferred = await router.localOnlyPolicy(preferring: .otherEngine, voiceId: "Alfie")
        #expect(preferred.preferences.map(\.provider) == [.otherEngine, .testEngine, .system])
        #expect(preferred.preferences.first?.voiceId == "Alfie")
        #expect(preferred.preferences.dropFirst().allSatisfy { $0.voiceId == nil }, "voices never carry to another provider")
        #expect(preferred.locality == .localOnly)

        let cloud = await router.cloudFirstPolicy(preferring: .otherEngine)
        #expect(cloud.preferences.map(\.provider) == [.elevenLabs, .openAI, .otherEngine, .testEngine, .system])
    }

    @Test func noRegisteredEngineLeavesTheOSVoice() async {
        let router = makeRouter()
        #expect(await router.localOnlyPolicy().preferences.map(\.provider) == [.system])
        #expect(await router.localOnlyPolicy(preferring: .testEngine).preferences.map(\.provider) == [.system],
                "an unregistered preference is not invented")
        #expect(HudSpeechPolicy.localOnly().preferences.map(\.provider) == [.system])
    }

    @Test func preloadInstallsThenWarmsAndReportsStates() async throws {
        let engine = FakeLocalEngine(state: .notInstalled)
        let router = makeRouter(engines: [engine])
        let seen = Locked<[HudLocalModelState]>([])
        try await router.preload(.testEngine) { state in seen.mutate { $0.append(state) } }
        #expect(await engine.installCount == 1)
        #expect(await engine.prepareCount == 1)
        #expect(await engine.currentState() == .ready)
        try await Task.sleep(for: .milliseconds(20))
        #expect(seen.get().contains(.downloading(0.5)))
        #expect(await router.resolve(router.localOnlyPolicy()).route?.provider == .testEngine)
    }

    @Test func preloadSkipsInstallWhenOnDisk() async throws {
        let engine = FakeLocalEngine(state: .installed)
        let router = makeRouter(engines: [engine])
        try await router.preload(.testEngine)
        #expect(await engine.installCount == 0)
        #expect(await engine.prepareCount == 1)
    }

    @Test func preloadRejectsUnknownAndUnsupportedEngines() async {
        let router = makeRouter(engines: [FakeLocalEngine(state: .unsupported("Intel Mac"))])
        await #expect(throws: HudSpeechError.unknownModel("other-engine")) { try await router.preload(.otherEngine) }
        await #expect(throws: HudLocalModelFailure.self) { try await router.preload(.testEngine) }
    }
}

final class Locked<Value>: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Value
    init(_ value: Value) { self.value = value }
    func get() -> Value { lock.lock(); defer { lock.unlock() }; return value }
    func mutate(_ body: (inout Value) -> Void) { lock.lock(); body(&value); lock.unlock() }
}
