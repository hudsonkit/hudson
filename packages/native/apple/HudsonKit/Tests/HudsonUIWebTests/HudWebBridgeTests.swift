import Foundation
import Testing
@testable import HudsonUIWeb

@MainActor
private final class FakeActivityHost: HudActivityProvider {
    var snapshots: [HudActivitySnapshot] = []
    var sent: [(HudActivityRef, String)] = []
    var failNext = false

    func activities() async -> [HudActivitySnapshot] { snapshots }

    func send(_ ref: HudActivityRef, command: String, args: Any?) async throws {
        if failNext {
            failNext = false
            throw NSError(domain: "test", code: 1, userInfo: [NSLocalizedDescriptionKey: "host refused"])
        }
        sent.append((ref, command))
    }
}

/// Collects one reply, and lets the test await it.
@MainActor
private final class ReplyProbe {
    var value: Any?
    var error: String?
    var done = false

    func make() -> HudWebViewReply {
        HudWebViewReply(completion: { [weak self] value, error in
            self?.value = value
            self?.error = error
            self?.done = true
        }, didFinish: {})
    }

    func wait() async {
        for _ in 0..<200 where !done {
            await Task.yield()
        }
    }
}

@Suite("HudWebBridge")
@MainActor
struct HudWebBridgeTests {
    private let recording = HudActivitySnapshot(
        ref: HudActivityRef(kind: "recording", id: "r1"),
        state: .running,
        lifetime: .host,
        title: "Standup",
        progress: .init(position: 12),
        controls: ["pause", "stop"]
    )

    @Test("bootstrap script buffers events under the global")
    func bootstrapScript() {
        let script = HudWebBridge.bootstrapScript()
        #expect(script.contains("k=\"__hudsonBridge\""))
        #expect(script.contains("q.length>100"))
        #expect(!script.contains("__KEY__"))
        #expect(!script.contains("__LIMIT__"))
    }

    @Test("install adds one user script and one handler")
    func installation() {
        let integration = HudWebBridge().makeIntegration()
        #expect(integration.userScripts.count == 1)
        #expect(integration.userScripts.first?.injectionTime == .documentStart)
        #expect(integration.messageHandlers.map(\.name) == ["hudsonBridge"])
        #expect(integration.isAttached == false)
    }

    @Test("receive scripts carry the event as JSON")
    func receiveScript() throws {
        let script = try #require(HudWebBridge.receiveScript(
            globalName: "__hudsonBridge",
            event: ["type": "command", "command": "tabs.close"]
        ))
        #expect(script.contains("window[\"__hudsonBridge\"]"))
        #expect(script.contains("{\"command\":\"tabs.close\",\"type\":\"command\"}"))
        #expect(HudWebBridge.receiveScript(globalName: "x", event: ["bad": Date()]) == nil)
    }

    @Test("snapshots encode in the web shape")
    func snapshotEncoding() throws {
        let object = try #require(HudWebBridge.jsonObject(recording) as? [String: Any])
        let ref = try #require(object["ref"] as? [String: Any])
        #expect(ref["kind"] as? String == "recording")
        #expect(object["state"] as? String == "running")
        #expect(object["lifetime"] as? String == "host")
        #expect(object["controls"] as? [String] == ["pause", "stop"])
        #expect((object["progress"] as? [String: Any])?["position"] as? Double == 12)
    }

    @Test("hello reports the bridges served")
    func hello() async {
        let host = FakeActivityHost()
        let bridge = HudWebBridge()
        let probe = ReplyProbe()
        bridge.handle(["op": "hello", "version": 1], reply: probe.make())
        #expect((probe.value as? [String: Any])?["capabilities"] as? [String] == ["commands"])

        bridge.activityProvider = host
        let second = ReplyProbe()
        bridge.handle(["op": "hello", "version": 1], reply: second.make())
        #expect((second.value as? [String: Any])?["capabilities"] as? [String] == ["commands", "activities"])
        #expect((second.value as? [String: Any])?["version"] as? Int == 1)
    }

    @Test("list returns the host's activities, or none without a host")
    func list() async {
        let bridge = HudWebBridge()
        let empty = ReplyProbe()
        bridge.handle(["op": "activities.list"], reply: empty.make())
        #expect((empty.value as? [Any])?.isEmpty == true)

        let host = FakeActivityHost()
        host.snapshots = [recording]
        bridge.activityProvider = host
        let probe = ReplyProbe()
        bridge.handle(["op": "activities.list"], reply: probe.make())
        await probe.wait()
        let list = probe.value as? [[String: Any]]
        #expect(list?.count == 1)
        #expect(list?.first?["title"] as? String == "Standup")
    }

    @Test("send reaches the host and reports failures")
    func send() async {
        let host = FakeActivityHost()
        let bridge = HudWebBridge(activityProvider: host)
        let body: [String: Any] = ["op": "activities.send", "ref": ["kind": "recording", "id": "r1"], "command": "stop"]

        let ok = ReplyProbe()
        bridge.handle(body, reply: ok.make())
        await ok.wait()
        #expect(ok.error == nil)
        #expect(host.sent.map(\.1) == ["stop"])
        #expect(host.sent.first?.0 == HudActivityRef(kind: "recording", id: "r1"))

        host.failNext = true
        let failed = ReplyProbe()
        bridge.handle(body, reply: failed.make())
        await failed.wait()
        #expect(failed.error == "host refused")
    }

    @Test("malformed and unknown requests fail")
    func malformed() {
        let bridge = HudWebBridge(activityProvider: FakeActivityHost())
        let notADict = ReplyProbe()
        bridge.handle("hi", reply: notADict.make())
        #expect(notADict.error == "malformed_request")

        let noRef = ReplyProbe()
        bridge.handle(["op": "activities.send", "command": "stop"], reply: noRef.make())
        #expect(noRef.error == "malformed_request")

        let unknown = ReplyProbe()
        bridge.handle(["op": "nope"], reply: unknown.make())
        #expect(unknown.error == "unsupported_op")
    }

    @Test("send and publish are dropped while no web view is attached")
    func detachedDelivery() {
        let bridge = HudWebBridge()
        _ = bridge.makeIntegration()
        // Nothing to assert beyond not crashing: evaluate() has no web view.
        bridge.send(command: "tabs.next")
        bridge.publish(recording)
    }
}
