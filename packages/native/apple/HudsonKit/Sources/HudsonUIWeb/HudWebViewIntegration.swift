import Foundation
import WebKit

public enum HudWebViewActivity: String, Equatable, Sendable {
    case visible
    case hiddenWarm
    case background
}

public enum HudWebViewResetReason: String, Equatable, Sendable {
    case sourceChanged
    case processTerminated
    case dismantled
}

public enum HudWebViewScriptInjectionTime: Equatable, Sendable {
    case documentStart
    case documentEnd

    var webKitValue: WKUserScriptInjectionTime {
        switch self {
        case .documentStart: return .atDocumentStart
        case .documentEnd: return .atDocumentEnd
        }
    }
}

public struct HudWebViewUserScript: Equatable, Sendable {
    public var source: String
    public var injectionTime: HudWebViewScriptInjectionTime
    public var forMainFrameOnly: Bool

    public init(
        source: String,
        injectionTime: HudWebViewScriptInjectionTime = .documentStart,
        forMainFrameOnly: Bool = true
    ) {
        self.source = source
        self.injectionTime = injectionTime
        self.forMainFrameOnly = forMainFrameOnly
    }
}

/// One WebKit request/reply closure. Completion is intentionally one-shot:
/// teardown and late async work may race, but JavaScript receives one result.
@MainActor
public final class HudWebViewReply {
    private var completion: ((Any?, String?) -> Void)?
    private var didFinish: (() -> Void)?

    init(
        completion: @escaping (Any?, String?) -> Void,
        didFinish: @escaping () -> Void
    ) {
        self.completion = completion
        self.didFinish = didFinish
    }

    public var isPending: Bool { completion != nil }

    public func succeed(_ value: Any? = nil) {
        finish(value: value, error: nil)
    }

    public func fail(_ message: String) {
        finish(value: nil, error: message)
    }

    public func cancel() {
        fail("cancelled")
    }

    private func finish(value: Any?, error: String?) {
        guard let completion else { return }
        self.completion = nil
        let didFinish = self.didFinish
        self.didFinish = nil
        completion(value, error)
        didFinish?()
    }
}

public struct HudWebViewMessageHandler {
    public typealias Handler = @MainActor (_ body: Any, _ reply: HudWebViewReply) -> Void

    public var name: String
    public var handler: Handler

    public init(name: String, handler: @escaping Handler) {
        self.name = name
        self.handler = handler
    }
}

/// Generic host integration for an embedded page. Product protocols remain in
/// the host app; Hudson owns only WebKit installation and lifecycle semantics.
@MainActor
public final class HudWebViewIntegration {
    public var userScripts: [HudWebViewUserScript]
    public var messageHandlers: [HudWebViewMessageHandler]
    public var onActivityChange: ((HudWebViewActivity) -> Void)?
    public var onReset: ((HudWebViewResetReason) -> Void)?
    public var onOpenExternalURL: ((URL) -> Void)?

    /// The web view this integration is installed in, while it is attached.
    private weak var webView: WKWebView?

    /// True while a web view is attached, so `evaluate` has somewhere to go.
    public var isAttached: Bool { webView != nil }

    /// Run a script in the page world. Dropped when no web view is attached,
    /// or while the content process is being replaced.
    public func evaluate(_ script: String) {
        webView?.evaluateJavaScript(script, in: nil, in: .page) { _ in }
    }

    func attach(_ webView: WKWebView) {
        self.webView = webView
    }

    func detach() {
        webView = nil
    }

    public init(
        userScripts: [HudWebViewUserScript] = [],
        messageHandlers: [HudWebViewMessageHandler] = [],
        onActivityChange: ((HudWebViewActivity) -> Void)? = nil,
        onReset: ((HudWebViewResetReason) -> Void)? = nil,
        onOpenExternalURL: ((URL) -> Void)? = nil
    ) {
        self.userScripts = userScripts
        self.messageHandlers = messageHandlers
        self.onActivityChange = onActivityChange
        self.onReset = onReset
        self.onOpenExternalURL = onOpenExternalURL
    }
}
