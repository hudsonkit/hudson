import Foundation
import Testing
@testable import HudsonVoice
@testable import HudsonVoicePhonon

/// No test here reaches the network. Installs use a tiny fake export served
/// from a `file://` archive; nothing loads the real model.
@Suite struct HudPhononSpeechEngineTests {
    let root: URL

    init() throws {
        root = FileManager.default.temporaryDirectory
            .appending(path: "hudson-phonon-tests-\(UUID().uuidString)", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    /// A fake export folder with a valid bundle.json, zipped.
    func makeArchive(built: Int = 42, corrupt: Bool = false) throws -> (URL, String) {
        let folder = root.appending(path: "src-\(UUID().uuidString)/phonon-31m-en", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder.appending(path: "voices"), withIntermediateDirectories: true)
        let files: [(String, Data)] = [
            ("host.safetensors", Data(repeating: 7, count: 1024)),
            ("voices/default.safetensors", Data(repeating: 1, count: 64)),
            ("voices/Alfie.safetensors", Data(repeating: 2, count: 64)),
        ]
        var listed: [[String: Any]] = []
        for (path, data) in files {
            let url = folder.appending(path: path)
            try data.write(to: url)
            listed.append(["path": path, "size": data.count, "sha256": try HudPhononManifest.sha256(of: url)])
        }
        if corrupt {
            try Data(repeating: 9, count: 1024).write(to: folder.appending(path: "host.safetensors"))
        }
        let manifest: [String: Any] = ["built": built, "files": listed, "voices": ["Alfie", "default"]]
        try JSONSerialization.data(withJSONObject: manifest).write(to: folder.appending(path: "bundle.json"))
        let zip = root.appending(path: "model-\(UUID().uuidString).zip")
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
        process.arguments = ["-c", "-k", "--keepParent", folder.path, zip.path]
        try process.run()
        process.waitUntilExit()
        return (zip, try HudPhononManifest.sha256(of: zip))
    }

    func engine(_ source: HudPhononModelSource) -> HudPhononSpeechEngine {
        HudPhononSpeechEngine(directory: root.appending(path: "installed/phonon-31m-en"), source: source)
    }

    @Test func constructingReportsNotInstalledWithoutDownloading() async {
        // The source points at a URL that would fail if fetched.
        let source = HudPhononModelSource(
            kind: .archive(URL(string: "https://invalid.example/never.zip")!, sha256: "00", bytes: nil),
            expectedBuilt: nil
        )
        let engine = engine(source)
        #expect(await engine.currentState() == .notInstalled)
        await #expect(throws: HudLocalModelFailure.self) { try await engine.prepare() }
        #expect(await engine.currentState() == .notInstalled)
    }

    @Test func installsFromVerifiedArchiveAndSurvivesRestart() async throws {
        let (zip, sha) = try makeArchive()
        let source = HudPhononModelSource(kind: .archive(zip, sha256: sha, bytes: nil), expectedBuilt: 42)
        let first = engine(source)
        try await first.install()
        #expect(await first.currentState() == .installed)
        try await first.verify()
        let voices = try await first.voices().map(\.id)
        #expect(voices == ["Alfie", "default"])
        #expect(FileManager.default.fileExists(atPath: first.directory.appending(path: "hudson-install.json").path))

        // A new process (new engine) sees the install from disk alone.
        let restarted = engine(source)
        #expect(await restarted.currentState() == .installed)
    }

    @Test func rejectsArchiveWithWrongChecksum() async throws {
        let (zip, _) = try makeArchive()
        let engine = engine(HudPhononModelSource(kind: .archive(zip, sha256: String(repeating: "0", count: 64), bytes: nil), expectedBuilt: nil))
        await #expect(throws: HudLocalModelFailure.self) { try await engine.install() }
        guard case .failed(let failure) = await engine.currentState() else {
            Issue.record("expected failed state")
            return
        }
        #expect(failure.kind == .integrity)
        #expect(failure.recoverable)
        #expect(!FileManager.default.fileExists(atPath: engine.directory.path))
    }

    @Test func rejectsExportWhoseFilesDoNotMatchManifest() async throws {
        let (zip, sha) = try makeArchive(corrupt: true)
        let engine = engine(HudPhononModelSource(kind: .archive(zip, sha256: sha, bytes: nil), expectedBuilt: nil))
        await #expect(throws: HudLocalModelFailure.self) { try await engine.install() }
        guard case .failed(let failure) = await engine.currentState() else {
            Issue.record("expected failed state")
            return
        }
        #expect(failure.kind == .integrity)
    }

    @Test func rejectsUnexpectedExportVersion() async throws {
        let (zip, sha) = try makeArchive(built: 7)
        let engine = engine(HudPhononModelSource(kind: .archive(zip, sha256: sha, bytes: nil), expectedBuilt: 42))
        await #expect(throws: HudLocalModelFailure.self) { try await engine.install() }
        guard case .failed(let failure) = await engine.currentState() else {
            Issue.record("expected failed state")
            return
        }
        #expect(failure.kind == .version)
    }

    @Test func detectsCorruptionAfterInstallAndRecoversOnReinstall() async throws {
        let (zip, sha) = try makeArchive()
        let source = HudPhononModelSource(kind: .archive(zip, sha256: sha, bytes: nil), expectedBuilt: 42)
        let engine = engine(source)
        try await engine.install()
        try Data(repeating: 3, count: 1024).write(to: engine.directory.appending(path: "host.safetensors"))
        await #expect(throws: HudLocalModelFailure.self) { try await engine.verify() }
        guard case .failed = await engine.currentState() else {
            Issue.record("expected failed state")
            return
        }
        // Truncation is caught by the cheap launch check too.
        try Data(repeating: 3, count: 10).write(to: engine.directory.appending(path: "host.safetensors"))
        guard case .failed = await self.engine(source).currentState() else {
            Issue.record("expected failed state at launch")
            return
        }
        try await engine.install()
        #expect(await engine.currentState() == .installed)
    }

    @Test func cancelledInstallLeavesNothingBehind() async throws {
        let (zip, sha) = try makeArchive()
        let engine = engine(HudPhononModelSource(kind: .archive(zip, sha256: sha, bytes: nil), expectedBuilt: nil))
        let task = Task { try await engine.install() }
        task.cancel()
        _ = try? await task.value
        let state = await engine.currentState()
        #expect(state == .notInstalled || state == .installed)
        // Retry works.
        try await engine.install()
        #expect(await engine.currentState() == .installed)
    }

    @Test func uninstallReturnsToNotInstalled() async throws {
        let (zip, sha) = try makeArchive()
        let engine = engine(HudPhononModelSource(kind: .archive(zip, sha256: sha, bytes: nil), expectedBuilt: nil))
        try await engine.install()
        try await engine.uninstall()
        #expect(await engine.currentState() == .notInstalled)
    }

    @Test func routerSkipsUninstalledPhononUnderLocalOnly() async throws {
        let engine = engine(.release070)
        let router = HudSpeechRouter(localEngines: [engine])
        let resolution = await router.resolve(.localOnly())
        #expect(resolution.route?.provider == .system)
        #expect(resolution.attempts.first?.outcome == .skipped(.notInstalled))
    }
}
