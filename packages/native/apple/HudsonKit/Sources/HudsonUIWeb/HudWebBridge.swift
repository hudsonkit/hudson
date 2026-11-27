import Foundation
import WebKit

// The native end of the Hudson host bridge (HUD-015 §9, §13), protocol v1.
//
// The web end is `createWebKitAdapter()` in hudsonkit
// (packages/web/hudsonkit/src/platform/webkit.ts); the wire format lives in
// bridgeProtocol.ts there and must match this file.
//
// - Commands: a Swift `CommandGroup` (or a menu-bar item) calls
//   `send(command:)`, and the page's tab shell runs it. The host owns the
//   accelerators, so shortcuts work while a guest has focus.
// - Activities: the host that owns long-running work (recording,
//   transcription, playback) implements `HudActivityProvider`, and calls
//   `publish(_:)` whenever one changes. The page only reads them, so a
//   reloaded or killed web content process loses nothing.

/// A serializable pointer to an activity. Lives in tab params on the web side.
public struct HudActivityRef: Codable, Hashable, Sendable {
    public var kind: String
    public var id: String

    public init(kind: String, id: String) {
        self.kind = kind
        self.id = id
    }
}

public struct HudActivitySnapshot: Codable, Equatable, Sendable {
    public enum State: String, Codable, Sendable {
        case starting, running, paused, ended, failed, unreachable
    }

    /// `ui`: stops when the last UI detaches. `host`: survives quitting the UI.
    public enum Lifetime: String, Codable, Sendable {
        case ui, host
    }

    public struct Progress: Codable, Equatable, Sendable {
        /// Seconds.
        public var position: Double
        /// Seconds, when known.
        public var duration: Double?

        public init(position: Double, duration: Double? = nil) {
            self.position = position
            self.duration = duration
        }
    }

    public var ref: HudActivityRef
    public var state: State
    public var lifetime: Lifetime
    public var title: String?
    public var progress: Progress?
    /// Commands that apply now: "pause", "resume", "stop", "seek", "rate", or app-defined.
    public var controls: [String]
    public var error: String?

    public init(
        ref: HudActivityRef,
        state: State,
        lifetime: Lifetime,
        title: String? = nil,
        progress: Progress? = nil,
        controls: [String] = [],
        error: String? = nil
    ) {
        self.ref = ref
        self.state = state
        self.lifetime = lifetime
        self.title = title
        self.progress = progress
        self.controls = controls
        self.error = error
    }
}

/// The host side of activities. Usually the app's menu-bar agent.
@MainActor
public protocol HudActivityProvider: AnyObject {
    /// Every activity the host knows about now.
    func activities() async -> [HudActivitySnapshot]
    /// Run a command (pause, stop, an app-defined one). Throw to report failure to the page.
    func send(_ ref: HudActivityRef, command: String, args: Any?) async throws
}

@MainActor
public final class HudWebBridge {
    nonisolated public static let version = 1
    nonisolated public static let defaultHandlerName = "hudsonBridge"
    nonisolated public static let defaultGlobalName = "__hudsonBridge"
    /// Events the document-start buffer keeps before the page's adapter connects.
    nonisolated public static let bufferLimit = 100

    public let handlerName: String
    public let globalName: String
    public weak var activityProvider: HudActivityProvider?

    private weak var integration: HudWebViewIntegration?

    public init(
        handlerName: String = HudWebBridge.defaultHandlerName,
        globalName: String = HudWebBridge.defaultGlobalName,
        activityProvider: HudActivityProvider? = nil
    ) {
        self.handlerName = handlerName
        self.globalName = globalName
        self.activityProvider = activityProvider
    }

    /// Add the bootstrap script and message handler to an integration, before
    /// the web view is made. Call once per integration.
    public func install(into integration: HudWebViewIntegration) {
        self.integration = integration
        integration.userScripts.append(HudWebViewUserScript(
            source: Self.bootstrapScript(globalName: globalName),
            injectionTime: .documentStart,
            forMainFrameOnly: true
        ))
        integration.messageHandlers.append(HudWebViewMessageHandler(name: handlerName) { [weak self] body, reply in
            guard let self else {
                reply.fail("bridge_gone")
                return
            }
            self.handle(body, reply: reply)
        })
    }

    /// A new integration with only the bridge installed.
    public func makeIntegration() -> HudWebViewIntegration {
        let integration = HudWebViewIntegration()
        install(into: integration)
        return integration
    }

    // MARK: Host → page

    /// Run a shell command in the page, e.g. "tabs.close" or "palette.toggle".
    /// `args` must be JSON-serializable (an OpenTabRequest dictionary, say).
    public func send(command: String, args: Any? = nil) {
        var event: [String: Any] = ["type": "command", "command": command]
        if let args { event["args"] = args }
        deliver(event)
    }

    /// Tell the page an activity changed. Call on every change, including the end.
    public func publish(_ snapshot: HudActivitySnapshot) {
        guard let object = Self.jsonObject(snapshot) else { return }
        deliver(["type": "activity", "snapshot": object])
    }

    private func deliver(_ event: [String: Any]) {
        guard let integration, let script = Self.receiveScript(globalName: globalName, event: event) else { return }
        integration.evaluate(script)
    }

    // MARK: Page → host

    func handle(_ body: Any, reply: HudWebViewReply) {
        guard let request = body as? [String: Any], let op = request["op"] as? String else {
            reply.fail("malformed_request")
            return
        }
        switch op {
        case "hello":
            var capabilities = ["commands"]
            if activityProvider != nil { capabilities.append("activities") }
            reply.succeed(["version": Self.version, "capabilities": capabilities])
        case "activities.list":
            guard let provider = activityProvider else {
                reply.succeed([Any]())
                return
            }
            Task { @MainActor in
                let list = await provider.activities()
                guard reply.isPending else { return }
                reply.succeed(list.compactMap(Self.jsonObject))
            }
        case "activities.send":
            guard
                let refObject = request["ref"] as? [String: Any],
                let kind = refObject["kind"] as? String,
                let id = refObject["id"] as? String,
                let command = request["command"] as? String
            else {
                reply.fail("malformed_request")
                return
            }
            guard let provider = activityProvider else {
                reply.fail("no_activity_host")
                return
            }
            let args = request["args"]
            Task { @MainActor in
                do {
                    try await provider.send(HudActivityRef(kind: kind, id: id), command: command, args: args)
                    reply.succeed()
                } catch {
                    reply.fail(error.localizedDescription)
                }
            }
        default:
            reply.fail("unsupported_op")
        }
    }

    // MARK: Scripts

    /// Must match `hudsonBridgeBootstrapScript()` in bridgeProtocol.ts; a
    /// hudsonkit test reads this template to keep the two in step.
    nonisolated static let bootstrapTemplate = "(function(){var w=window,k=__KEY__;if(w[k])return;var q=[];w[k]={queue:q,receive:function(e){q.push({event:e,at:Date.now()});if(q.length>__LIMIT__)q.shift();}};})();"

    nonisolated public static func bootstrapScript(globalName: String = defaultGlobalName, limit: Int = bufferLimit) -> String {
        bootstrapTemplate
            .replacingOccurrences(of: "__KEY__", with: jsonString(globalName))
            .replacingOccurrences(of: "__LIMIT__", with: String(limit))
    }

    nonisolated static func receiveScript(globalName: String, event: [String: Any]) -> String? {
        guard
            JSONSerialization.isValidJSONObject(event),
            let data = try? JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]),
            let json = String(data: data, encoding: .utf8)
        else { return nil }
        let key = jsonString(globalName)
        return "(function(){var b=window[\(key)];if(b&&b.receive)b.receive(\(json));})();"
    }

    nonisolated private static func jsonString(_ value: String) -> String {
        guard
            let data = try? JSONSerialization.data(withJSONObject: [value], options: []),
            let array = String(data: data, encoding: .utf8)
        else { return "\"\"" }
        // Strip the surrounding brackets of the one-element array.
        return String(array.dropFirst().dropLast())
    }

    nonisolated static func jsonObject(_ snapshot: HudActivitySnapshot) -> Any? {
        guard let data = try? JSONEncoder().encode(snapshot) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }
}
