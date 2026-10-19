import Darwin
import Foundation
import XCTest
import VoxService
@testable import HudsonVoice

final class HudVoicePrivateTransportTests: XCTestCase {
    func testProbeAndLiveEventsUsePrivateSocket() async throws {
        let directory = URL(fileURLWithPath: "/private/tmp").appendingPathComponent(UUID().uuidString)
        let path = directory.appendingPathComponent("voice.sock").path
        let token = String(repeating: "p", count: 43)
        let bridge = ServiceBridge(port: 0, serviceName: "HudsonTest", authToken: token, socketPath: path)
        bridge.handle("health") { _, reply in reply(["service": "PrivateVox", "version": "test", "port": 0], nil) }
        bridge.handleStreaming("transcribe.startSession") { params, progress, reply in
            XCTAssertEqual(params?["clientId"] as? String, "private-client")
            XCTAssertNotNil(params?["_connectionID"])
            progress("session.partial", ["sessionId": "private-session", "text": "socket text"])
            reply(["sessionId": "private-session", "text": "completed", "elapsedMs": 1], nil)
        }
        try bridge.start()
        defer { bridge.stop(); try? FileManager.default.removeItem(at: directory) }
        let endpoint = HudVoxEndpoint(host: "localhost", port: 0, socketPath: path)
        let health = try await HudVoxProbe.health(endpoint: endpoint, authToken: token)
        XCTAssertEqual(health.service, "PrivateVox")
        let session = HudVoxLiveSession(endpoint: endpoint, options: HudVoxLiveSessionOptions(clientId: "private-client", authToken: token))
        defer { session.close() }
        let events = try await session.start()
        var received: [String] = []
        for try await event in events {
            switch event {
            case .partial(let value): received.append(value.text)
            case .final(let value): received.append(value.text)
            default: break
            }
            if received.count == 2 { break }
        }
        XCTAssertEqual(received, ["socket text", "completed"])
        XCTAssertEqual(session.id, "private-session")
        assertPrivateDescriptorsCloseOnExec(path, minimum: 4)
        do { _ = try await HudVoxProbe.health(endpoint: endpoint, authToken: String(repeating: "x", count: 43)); XCTFail("wrong token admitted") }
        catch { /* Expected pre-upgrade denial. */ }
    }

    func testCapabilityReadRejectsPublicOrSymlinkFiles() throws {
        let directory = URL(fileURLWithPath: "/private/tmp").appendingPathComponent(UUID().uuidString)
        let url = directory.appendingPathComponent("runtime.json")
        defer { try? FileManager.default.removeItem(at: directory) }
        let document: [String: Any] = ["schemaVersion": 1, "service": "hudson-voice", "transport": "unix+ws+json-rpc", "host": "localhost", "port": 0, "webSocketUrl": "", "socketPath": directory.appendingPathComponent("voice.sock").path, "authToken": String(repeating: "c", count: 43), "pid": getpid()]
        try VoxPrivateIPC.writePrivateFile(JSONSerialization.data(withJSONObject: document), to: url)
        let env = [HudsonVoiceRuntime.runtimePathEnvironmentKey: url.path]
        XCTAssertEqual(try HudsonVoiceRuntime.read(environment: env).endpoint.socketPath, directory.appendingPathComponent("voice.sock").path)
        chmod(url.path, 0o644)
        XCTAssertThrowsError(try HudsonVoiceRuntime.read(environment: env))
        chmod(url.path, 0o600)
        let link = directory.appendingPathComponent("linked.json")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: url)
        XCTAssertThrowsError(try HudsonVoiceRuntime.read(environment: [HudsonVoiceRuntime.runtimePathEnvironmentKey: link.path]))
    }
}

// Inspect live descriptors, including both ends of the real client/server
// transport, so child processes cannot retain its listeners or locks.
private func assertPrivateDescriptorsCloseOnExec(_ path: String, excluding: Set<Int32> = [], minimum: Int = 2) {
    var matching = 0
    var lockInfo = stat()
    let hasLock = lstat(path + ".lock", &lockInfo) == 0
    for fd in 0..<getdtablesize() where !excluding.contains(fd) {
        let flags = fcntl(fd, F_GETFD)
        if flags < 0 { continue }
        var matches = false
        for peer in [false, true] {
            var address = sockaddr_un()
            var length = socklen_t(MemoryLayout<sockaddr_un>.size)
            let result = withUnsafeMutablePointer(to: &address) {
                $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                    peer ? getpeername(fd, $0, &length) : getsockname(fd, $0, &length)
                }
            }
            if result == 0, address.sun_family == sa_family_t(AF_UNIX) {
                let name = withUnsafeBytes(of: address.sun_path) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
                matches = matches || name == path
            }
        }
        var info = stat()
        if hasLock, fstat(fd, &info) == 0, info.st_dev == lockInfo.st_dev, info.st_ino == lockInfo.st_ino { matches = true }
        if matches {
            matching += 1
            XCTAssertNotEqual(flags & FD_CLOEXEC, 0, "Private IPC descriptor \(fd) leaks across exec")
        }
    }
    XCTAssertGreaterThanOrEqual(matching, minimum)
}
