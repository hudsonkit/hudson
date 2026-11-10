import CryptoKit
import Foundation
import HudsonVoice
import PhononTTS

/// Where the Phonon model comes from when the host installs it.
public struct HudPhononModelSource: Sendable, Equatable {
    public enum Kind: Sendable, Equatable {
        /// A zip of the model folder. Checked against `sha256` before it is
        /// opened. macOS only (it is unpacked with `ditto`).
        case archive(URL, sha256: String, bytes: Int64?)
        /// A static host serving `bundle.json` and every file it lists.
        /// Each file is checked; interrupted downloads resume.
        case mirror(URL)
        /// A model folder shipped inside the app.
        case bundled(URL)
    }

    public var kind: Kind
    /// The export stamp (`bundle.json` `built`) Hudson accepts. Nil accepts
    /// any export that passes its own checksums.
    public var expectedBuilt: Int?

    public init(kind: Kind, expectedBuilt: Int?) {
        self.kind = kind
        self.expectedBuilt = expectedBuilt
    }

    /// The `phonon-31m-en-coreml.zip` asset of ptts v0.7.0: 137,300,950
    /// bytes, Apache-2.0 weights from `hf://gradium/phonon-31m-en@92741c5`.
    public static let release070 = HudPhononModelSource(
        kind: .archive(
            URL(string: "https://github.com/gradium-ai/xn-ptts/releases/download/v0.7.0/phonon-31m-en-coreml.zip")!,
            sha256: "058cde756a5e67bcdb986e7c45fe431d41a1a9073e68aabae314c80631a34b76",
            bytes: 137_300_950
        ),
        expectedBuilt: 1_794_219_155
    )
}

/// Gradium Phonon 31m English as a `HudLocalSpeechEngine`.
///
/// Creating the engine and reading its state touch only the disk. Nothing
/// is downloaded until the host calls `install()`. `prepare()` loads the
/// installed model, compiling it for this device the first time, then
/// keeps one warm instance for every later request.
public actor HudPhononSpeechEngine: HudLocalSpeechEngine {
    public static let provider = HudVoiceProviderID.phonon
    public static let modelId = "phonon:31m-en"

    public nonisolated let info: HudLocalSpeechModelInfo
    public nonisolated let directory: URL
    public nonisolated let source: HudPhononModelSource

    private let states: HudLocalModelStateBroadcaster
    private var stateLoaded = false
    private var phonon: Phonon?
    private var prepareTask: Task<Phonon, Error>?
    private var installTask: Task<Void, Error>?
    private var currentVoice: String?

    /// - Parameters:
    ///   - directory: Install location. Defaults to
    ///     `Application Support/HudsonVoice/Models/phonon-31m-en`.
    ///   - source: Where `install()` fetches from.
    public init(directory: URL? = nil, source: HudPhononModelSource = .release070) {
        let directory = directory ?? Self.defaultDirectory
        self.directory = directory
        self.source = source
        self.info = HudLocalSpeechModelInfo(
            provider: Self.provider,
            modelId: Self.modelId,
            name: "Phonon 31m (English)",
            version: "ptts 0.7.0 / phonon-31m-en@92741c5",
            license: "Apache-2.0",
            languages: ["en"],
            sampleRate: Phonon.sampleRate,
            downloadBytes: {
                if case .archive(_, _, let bytes) = source.kind { return bytes }
                return nil
            }(),
            installedBytes: 309_000_000,
            defaultVoiceId: "default"
        )
        self.states = HudLocalModelStateBroadcaster(.notInstalled)
    }

    public static var defaultDirectory: URL {
        URL.applicationSupportDirectory
            .appending(path: "HudsonVoice/Models/phonon-31m-en", directoryHint: .isDirectory)
    }

    // MARK: State

    public func currentState() async -> HudLocalModelState {
        loadStateIfNeeded()
        return states.current
    }

    public func stateUpdates() async -> AsyncStream<HudLocalModelState> {
        loadStateIfNeeded()
        return states.stream()
    }

    private func loadStateIfNeeded() {
        guard !stateLoaded else { return }
        stateLoaded = true
        states.send(diskState())
    }

    /// Cheap check: manifest present, version accepted, every listed file
    /// present at its listed size. Checksums are `verify()`'s job.
    private func diskState() -> HudLocalModelState {
        #if !arch(arm64)
        return .unsupported("Phonon needs Apple silicon (arm64).")
        #else
        guard let manifest = HudPhononManifest.read(at: directory) else {
            return .notInstalled
        }
        if let expected = source.expectedBuilt, manifest.built != expected {
            return .failed(HudLocalModelFailure(
                kind: .version,
                message: "Installed Phonon export \(manifest.built) is not the expected \(expected). Install again."
            ))
        }
        if let problem = manifest.firstProblem(in: directory, checksums: false) {
            return .failed(HudLocalModelFailure(kind: .integrity, message: problem))
        }
        return .installed
        #endif
    }

    // MARK: Install

    public func install() async throws {
        #if !arch(arm64)
        throw HudLocalModelFailure(kind: .unsupported, message: "Phonon needs Apple silicon (arm64).", recoverable: false)
        #else
        if let installTask {
            return try await installTask.value
        }
        loadStateIfNeeded()
        let previous = states.current
        if previous.isInstalled, (try? verifyFiles()) != nil {
            return
        }
        let task = Task { try await self.performInstall() }
        installTask = task
        defer { installTask = nil }
        do {
            try await withTaskCancellationHandler {
                try await task.value
            } onCancel: {
                task.cancel()
            }
            states.send(.installed)
        } catch {
            if error is CancellationError || (error as? URLError)?.code == .cancelled
                || (error as? HudLocalModelFailure)?.kind == .cancelled {
                states.send(diskState())
                throw HudLocalModelFailure(kind: .cancelled, message: "Phonon install was cancelled.")
            }
            let failure = (error as? HudLocalModelFailure)
                ?? HudLocalModelFailure(kind: .download, message: error.localizedDescription)
            states.send(.failed(failure))
            throw failure
        }
        #endif
    }

    public func cancelInstall() async {
        installTask?.cancel()
    }

    public func uninstall() async throws {
        installTask?.cancel()
        await unload()
        if FileManager.default.fileExists(atPath: directory.path) {
            try FileManager.default.removeItem(at: directory)
        }
        stateLoaded = true
        states.send(diskState())
    }

    public func verify() async throws {
        do {
            try verifyFiles()
            if !states.current.isInstalled { states.send(.installed) }
        } catch let failure as HudLocalModelFailure {
            await unload()
            states.send(.failed(failure))
            throw failure
        }
    }

    private func verifyFiles() throws {
        guard let manifest = HudPhononManifest.read(at: directory) else {
            throw HudLocalModelFailure(kind: .integrity, message: "No Phonon model at \(directory.path).")
        }
        if let expected = source.expectedBuilt, manifest.built != expected {
            throw HudLocalModelFailure(kind: .version, message: "Phonon export \(manifest.built) is not the expected \(expected).")
        }
        if let problem = manifest.firstProblem(in: directory, checksums: true) {
            throw HudLocalModelFailure(kind: .integrity, message: problem)
        }
    }

    private func performInstall() async throws {
        let fm = FileManager.default
        let parent = directory.deletingLastPathComponent()
        try fm.createDirectory(at: parent, withIntermediateDirectories: true)
        states.send(.downloading(0))

        switch source.kind {
        case .bundled(let folder):
            states.send(.verifying)
            try Self.verifyStaged(folder, expectedBuilt: source.expectedBuilt)
            try Task.checkCancellation()
            _ = try PhononModels.install(bundled: folder, to: directory)

        case .mirror(let base):
            let broadcaster = states
            _ = try await PhononModels.download(from: base, to: directory) { fraction in
                broadcaster.send(.downloading(fraction))
            }
            states.send(.verifying)

        case .archive(let url, let sha256, let bytes):
            #if os(macOS)
            let staging = parent.appending(path: ".phonon-staging-\(UUID().uuidString)", directoryHint: .isDirectory)
            try fm.createDirectory(at: staging, withIntermediateDirectories: true)
            defer { try? fm.removeItem(at: staging) }
            let zip = staging.appending(path: "model.zip")
            let broadcaster = states
            try await HudPhononDownloader.download(url, to: zip, expectedBytes: bytes) { fraction in
                broadcaster.send(.downloading(fraction))
            }
            try Task.checkCancellation()
            states.send(.verifying)
            let digest = try HudPhononManifest.sha256(of: zip)
            guard digest == sha256 else {
                throw HudLocalModelFailure(kind: .integrity, message: "Downloaded Phonon archive has SHA-256 \(digest), expected \(sha256).")
            }
            let unpacked = staging.appending(path: "unpacked", directoryHint: .isDirectory)
            try Self.unzip(zip, to: unpacked)
            guard let folder = Self.findBundle(in: unpacked) else {
                throw HudLocalModelFailure(kind: .integrity, message: "Phonon archive has no bundle.json.")
            }
            try Self.verifyStaged(folder, expectedBuilt: source.expectedBuilt)
            try Task.checkCancellation()
            await unload()
            if fm.fileExists(atPath: directory.path) {
                try fm.removeItem(at: directory)
            }
            try fm.moveItem(at: folder, to: directory)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var installed = directory
            try? installed.setResourceValues(values)
            #else
            throw HudLocalModelFailure(
                kind: .unsupported,
                message: "Archive install is macOS-only. Use a mirror or bundled source on iOS.",
                recoverable: false
            )
            #endif
        }

        try verifyFiles()
        try writeReceipt()
    }

    private func writeReceipt() throws {
        let manifest = HudPhononManifest.read(at: directory)
        let sourceDescription: String
        switch source.kind {
        case .archive(let url, let sha256, _): sourceDescription = "\(url.absoluteString)#sha256=\(sha256)"
        case .mirror(let base): sourceDescription = base.absoluteString
        case .bundled(let folder): sourceDescription = folder.path
        }
        let receipt: [String: Any] = [
            "modelId": Self.modelId,
            "built": manifest?.built ?? 0,
            "source": sourceDescription,
            "installedAt": ISO8601DateFormatter().string(from: Date()),
        ]
        let data = try JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: directory.appending(path: "hudson-install.json"))
    }

    static func verifyStaged(_ folder: URL, expectedBuilt: Int?) throws {
        guard let manifest = HudPhononManifest.read(at: folder) else {
            throw HudLocalModelFailure(kind: .integrity, message: "No readable bundle.json in \(folder.lastPathComponent).")
        }
        if let expectedBuilt, manifest.built != expectedBuilt {
            throw HudLocalModelFailure(kind: .version, message: "Phonon export \(manifest.built) is not the expected \(expectedBuilt).")
        }
        if let problem = manifest.firstProblem(in: folder, checksums: true) {
            throw HudLocalModelFailure(kind: .integrity, message: problem)
        }
    }

    #if os(macOS)
    static func unzip(_ zip: URL, to destination: URL) throws {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        process.arguments = ["-x", "-k", zip.path, destination.path]
        process.standardOutput = FileHandle.nullDevice
        let errors = Pipe()
        process.standardError = errors
        try process.run()
        let detail = String(decoding: errors.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            let suffix = detail.isEmpty ? "" : ": \(detail.prefix(300))"
            throw HudLocalModelFailure(kind: .disk, message: "Could not unpack the Phonon archive (ditto exit \(process.terminationStatus))\(suffix)")
        }
    }
    #endif

    static func findBundle(in root: URL) -> URL? {
        if FileManager.default.fileExists(atPath: root.appending(path: "bundle.json").path) { return root }
        let children = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return children.first { FileManager.default.fileExists(atPath: $0.appending(path: "bundle.json").path) }
    }

    // MARK: Load

    public func prepare() async throws {
        _ = try await loaded()
    }

    private func loaded() async throws -> Phonon {
        if let phonon { return phonon }
        if let prepareTask { return try await prepareTask.value }
        loadStateIfNeeded()
        let state = states.current
        switch state {
        case .unsupported(let detail):
            throw HudLocalModelFailure(kind: .unsupported, message: detail, recoverable: false)
        case .notInstalled:
            throw HudLocalModelFailure(kind: .load, message: "Phonon is not installed.")
        case .downloading, .verifying:
            throw HudLocalModelFailure(kind: .load, message: "Phonon is still installing.")
        case .failed(let failure):
            throw failure
        case .installed, .compiling, .warming, .ready:
            break
        }

        let directory = self.directory
        let broadcaster = states
        let task = Task<Phonon, Error> {
            #if arch(arm64)
            broadcaster.send(Phonon.needsCompiling(directory) ? .compiling : .warming)
            let tts: Phonon
            do {
                tts = try await Phonon.load(models: directory, language: .english)
            } catch {
                throw HudLocalModelFailure(kind: .compile, message: "Phonon failed to load: \(error)")
            }
            broadcaster.send(.warming)
            do {
                // One short utterance so the first real request starts warm.
                _ = try await tts.speak("Ready.") { _ in }
            } catch {
                throw HudLocalModelFailure(kind: .load, message: "Phonon warm-up failed: \(error)")
            }
            return tts
            #else
            throw HudLocalModelFailure(kind: .unsupported, message: "Phonon needs Apple silicon (arm64).", recoverable: false)
            #endif
        }
        prepareTask = task
        do {
            let tts = try await task.value
            prepareTask = nil
            phonon = tts
            currentVoice = tts.voice
            states.send(.ready)
            return tts
        } catch {
            prepareTask = nil
            let failure = (error as? HudLocalModelFailure)
                ?? HudLocalModelFailure(kind: .load, message: error.localizedDescription)
            states.send(.failed(failure))
            throw failure
        }
    }

    public func unload() async {
        prepareTask?.cancel()
        prepareTask = nil
        phonon = nil
        currentVoice = nil
        if states.current == .ready || states.current == .warming || states.current == .compiling {
            states.send(.installed)
        }
    }

    // MARK: Voices and synthesis

    public func voices() async throws -> [HudLocalSpeechVoice] {
        guard let manifest = HudPhononManifest.read(at: directory) else {
            throw HudLocalModelFailure(kind: .load, message: "Phonon is not installed.")
        }
        return manifest.voices.map { HudLocalSpeechVoice(id: $0, name: $0 == "default" ? "Default" : $0) }
    }

    public func synthesize(
        _ text: String,
        voiceId: String?,
        onChunk: @escaping @Sendable ([Float]) -> Void
    ) async throws -> HudLocalSynthesisStats {
        let tts = try await loaded()
        let wanted = voiceId ?? info.defaultVoiceId
        if wanted != currentVoice {
            do {
                try await tts.setVoice(wanted)
            } catch {
                throw HudLocalModelFailure(kind: .synthesis, message: "Phonon has no voice \(wanted).")
            }
            currentVoice = wanted
        }
        try Task.checkCancellation()
        let stats: SpeechStats
        do {
            stats = try await tts.speak(text, onAudio: onChunk)
        } catch {
            throw HudLocalModelFailure(kind: .synthesis, message: "Phonon synthesis failed: \(error)")
        }
        try Task.checkCancellation()
        return HudLocalSynthesisStats(
            audioSeconds: stats.audioSeconds,
            firstAudioMs: Int(stats.timeToFirstAudio.components.seconds * 1000)
                + Int(stats.timeToFirstAudio.components.attoseconds / 1_000_000_000_000_000)
        )
    }
}

// MARK: - Manifest

struct HudPhononManifest: Decodable {
    struct File: Decodable {
        let path: String
        let size: Int
        let sha256: String
    }

    let built: Int
    let files: [File]
    let voices: [String]

    static func read(at directory: URL) -> HudPhononManifest? {
        guard let data = try? Data(contentsOf: directory.appending(path: "bundle.json")) else { return nil }
        return try? JSONDecoder().decode(HudPhononManifest.self, from: data)
    }

    /// The first missing, mis-sized or (with `checksums`) mis-hashed file.
    func firstProblem(in directory: URL, checksums: Bool) -> String? {
        for file in files {
            let url = directory.appending(path: file.path)
            guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize else {
                return "Phonon model file \(file.path) is missing."
            }
            guard size == file.size else {
                return "Phonon model file \(file.path) is \(size) bytes, expected \(file.size)."
            }
            if checksums {
                guard let digest = try? Self.sha256(of: url), digest == file.sha256 else {
                    return "Phonon model file \(file.path) fails its SHA-256 check."
                }
            }
        }
        return nil
    }

    static func sha256(of url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while let chunk = try handle.read(upToCount: 8 << 20), !chunk.isEmpty {
            hasher.update(data: chunk)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: - Download

/// One-file download with byte progress and task cancellation.
enum HudPhononDownloader {
    static func download(
        _ url: URL,
        to destination: URL,
        expectedBytes: Int64?,
        progress: @escaping @Sendable (Double?) -> Void
    ) async throws {
        let delegate = Delegate(expectedBytes: expectedBytes, progress: progress)
        let session = URLSession(configuration: .ephemeral, delegate: delegate, delegateQueue: nil)
        defer { session.invalidateAndCancel() }
        let (temporary, response) = try await session.download(from: url, delegate: delegate)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            try? FileManager.default.removeItem(at: temporary)
            throw HudLocalModelFailure(kind: .download, message: "Phonon download failed: HTTP \(http.statusCode).")
        }
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: temporary, to: destination)
        progress(1)
    }

    final class Delegate: NSObject, URLSessionDownloadDelegate, @unchecked Sendable {
        let expectedBytes: Int64?
        let progress: @Sendable (Double?) -> Void
        private var lastReported = -1.0

        init(expectedBytes: Int64?, progress: @escaping @Sendable (Double?) -> Void) {
            self.expectedBytes = expectedBytes
            self.progress = progress
        }

        func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {}

        func urlSession(
            _ session: URLSession,
            downloadTask: URLSessionDownloadTask,
            didWriteData bytesWritten: Int64,
            totalBytesWritten: Int64,
            totalBytesExpectedToWrite: Int64
        ) {
            let total = totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : (expectedBytes ?? 0)
            guard total > 0 else {
                progress(nil)
                return
            }
            let fraction = min(1, Double(totalBytesWritten) / Double(total))
            // Report in 1% steps so state streams stay quiet.
            if fraction - lastReported >= 0.01 || fraction == 1 {
                lastReported = fraction
                progress(fraction)
            }
        }
    }
}
