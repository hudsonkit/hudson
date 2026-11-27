import SwiftUI
import WebKit

public enum HudWebViewSource: Equatable, Sendable {
    case url(URL)
    case file(URL, readAccessRoot: URL)
    case html(String, baseURL: URL?)
}

public struct HudWebViewState: Equatable, Sendable {
    public var title: String?
    public var url: URL?
    public var isLoading: Bool
    public var estimatedProgress: Double
    public var canGoBack: Bool
    public var canGoForward: Bool
    public var errorMessage: String?

    public init(
        title: String? = nil,
        url: URL? = nil,
        isLoading: Bool = false,
        estimatedProgress: Double = 0,
        canGoBack: Bool = false,
        canGoForward: Bool = false,
        errorMessage: String? = nil
    ) {
        self.title = title
        self.url = url
        self.isLoading = isLoading
        self.estimatedProgress = estimatedProgress
        self.canGoBack = canGoBack
        self.canGoForward = canGoForward
        self.errorMessage = errorMessage
    }
}

public struct HudWebViewConfiguration: Equatable, Sendable {
    public var allowsBackForwardNavigationGestures: Bool
    public var allowsJavaScript: Bool
    public var customUserAgent: String?
    public var usesNonPersistentDataStore: Bool
    public var isInspectable: Bool

    public init(
        allowsBackForwardNavigationGestures: Bool = true,
        allowsJavaScript: Bool = true,
        customUserAgent: String? = nil,
        usesNonPersistentDataStore: Bool = false,
        isInspectable: Bool = false
    ) {
        self.allowsBackForwardNavigationGestures = allowsBackForwardNavigationGestures
        self.allowsJavaScript = allowsJavaScript
        self.customUserAgent = customUserAgent
        self.usesNonPersistentDataStore = usesNonPersistentDataStore
        self.isInspectable = isInspectable
    }
}

#if os(iOS)
public struct HudWebView: UIViewRepresentable {
    private let source: HudWebViewSource
    @Binding private var state: HudWebViewState
    private let configuration: HudWebViewConfiguration
    private let integration: HudWebViewIntegration?
    private let activity: HudWebViewActivity

    public init(
        _ source: HudWebViewSource,
        state: Binding<HudWebViewState> = .constant(HudWebViewState()),
        configuration: HudWebViewConfiguration = HudWebViewConfiguration(),
        integration: HudWebViewIntegration? = nil,
        activity: HudWebViewActivity = .visible
    ) {
        self.source = source
        self._state = state
        self.configuration = configuration
        self.integration = integration
        self.activity = activity
    }

    public func makeCoordinator() -> HudWebViewCoordinator {
        HudWebViewCoordinator(state: $state, integration: integration)
    }

    public func makeUIView(context: Context) -> WKWebView {
        let webView = HudWebViewPlatform.makeWebView(configuration, coordinator: context.coordinator)
        context.coordinator.attach(to: webView)
        context.coordinator.setActivity(activity)
        context.coordinator.load(source, in: webView)
        return webView
    }

    public func updateUIView(_ webView: WKWebView, context: Context) {
        context.coordinator.state = $state
        HudWebViewPlatform.apply(configuration, to: webView)
        context.coordinator.setActivity(activity)
        context.coordinator.load(source, in: webView)
    }

    public static func dismantleUIView(_ webView: WKWebView, coordinator: HudWebViewCoordinator) {
        coordinator.tearDown(webView)
    }
}
#elseif os(macOS)
public struct HudWebView: NSViewRepresentable {
    private let source: HudWebViewSource
    @Binding private var state: HudWebViewState
    private let configuration: HudWebViewConfiguration
    private let integration: HudWebViewIntegration?
    private let activity: HudWebViewActivity

    public init(
        _ source: HudWebViewSource,
        state: Binding<HudWebViewState> = .constant(HudWebViewState()),
        configuration: HudWebViewConfiguration = HudWebViewConfiguration(),
        integration: HudWebViewIntegration? = nil,
        activity: HudWebViewActivity = .visible
    ) {
        self.source = source
        self._state = state
        self.configuration = configuration
        self.integration = integration
        self.activity = activity
    }

    public func makeCoordinator() -> HudWebViewCoordinator {
        HudWebViewCoordinator(state: $state, integration: integration)
    }

    public func makeNSView(context: Context) -> WKWebView {
        let webView = HudWebViewPlatform.makeWebView(configuration, coordinator: context.coordinator)
        context.coordinator.attach(to: webView)
        context.coordinator.setActivity(activity)
        context.coordinator.load(source, in: webView)
        return webView
    }

    public func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.state = $state
        HudWebViewPlatform.apply(configuration, to: webView)
        context.coordinator.setActivity(activity)
        context.coordinator.load(source, in: webView)
    }

    public static func dismantleNSView(_ webView: WKWebView, coordinator: HudWebViewCoordinator) {
        coordinator.tearDown(webView)
    }
}
#endif

@MainActor
public final class HudWebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    var state: Binding<HudWebViewState>
    private let integration: HudWebViewIntegration?
    private var lastSource: HudWebViewSource?
    private var activity: HudWebViewActivity?
    private var outstandingReplies: [UUID: HudWebViewReply] = [:]
    private var progressObservation: NSKeyValueObservation?
    private var titleObservation: NSKeyValueObservation?
    private var urlObservation: NSKeyValueObservation?
    private var loadingObservation: NSKeyValueObservation?

    init(state: Binding<HudWebViewState>, integration: HudWebViewIntegration?) {
        self.state = state
        self.integration = integration
    }

    func install(in controller: WKUserContentController) {
        guard let integration else { return }
        for script in integration.userScripts {
            controller.addUserScript(WKUserScript(
                source: script.source,
                injectionTime: script.injectionTime.webKitValue,
                forMainFrameOnly: script.forMainFrameOnly,
                in: .page
            ))
        }
        for registration in integration.messageHandlers {
            controller.addScriptMessageHandler(self, contentWorld: .page, name: registration.name)
        }
    }

    func attach(to webView: WKWebView) {
        integration?.attach(webView)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        observe(webView)
        publish(webView)
    }

    func load(_ source: HudWebViewSource, in webView: WKWebView) {
        guard source != lastSource else { return }
        if lastSource != nil {
            cancelOutstandingReplies()
            integration?.onReset?(.sourceChanged)
        }
        lastSource = source
        state.wrappedValue.errorMessage = nil

        switch source {
        case .url(let url):
            webView.load(URLRequest(url: url))
        case .file(let url, let readAccessRoot):
            webView.loadFileURL(url, allowingReadAccessTo: readAccessRoot)
        case .html(let html, let baseURL):
            webView.loadHTMLString(html, baseURL: baseURL)
        }
    }

    func tearDown(_ webView: WKWebView) {
        cancelOutstandingReplies()
        integration?.onReset?(.dismantled)
        integration?.detach()
        uninstall(from: webView.configuration.userContentController)
        progressObservation?.invalidate()
        titleObservation?.invalidate()
        urlObservation?.invalidate()
        loadingObservation?.invalidate()
        progressObservation = nil
        titleObservation = nil
        urlObservation = nil
        loadingObservation = nil
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.loadHTMLString("", baseURL: nil)
        lastSource = nil
    }

    func setActivity(_ next: HudWebViewActivity) {
        guard next != activity else { return }
        activity = next
        integration?.onActivityChange?(next)
    }

    private func uninstall(from controller: WKUserContentController) {
        guard let integration else { return }
        for registration in integration.messageHandlers {
            controller.removeScriptMessageHandler(forName: registration.name, contentWorld: .page)
        }
        controller.removeAllUserScripts()
    }

    private func cancelOutstandingReplies() {
        let replies = Array(outstandingReplies.values)
        outstandingReplies.removeAll()
        for reply in replies { reply.cancel() }
    }

    public func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let registration = integration?.messageHandlers.first(where: { $0.name == message.name }) else {
            replyHandler(nil, "unsupported_handler")
            return
        }
        let id = UUID()
        let reply = HudWebViewReply(completion: replyHandler) { [weak self] in
            self?.outstandingReplies.removeValue(forKey: id)
        }
        outstandingReplies[id] = reply
        registration.handler(message.body, reply)
    }

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard let source = lastSource else { return }
        cancelOutstandingReplies()
        integration?.onReset?(.processTerminated)
        uninstall(from: webView.configuration.userContentController)
        install(in: webView.configuration.userContentController)
        lastSource = nil
        load(source, in: webView)
    }

    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        guard case .file(_, let root) = lastSource else {
            decisionHandler(.allow)
            return
        }
        if url.isFileURL {
            let candidate = url.standardizedFileURL.resolvingSymlinksInPath().path
            let rootPath = root.standardizedFileURL.resolvingSymlinksInPath().path
            let prefix = rootPath.hasSuffix("/") ? rootPath : rootPath + "/"
            decisionHandler(candidate == rootPath || candidate.hasPrefix(prefix) ? .allow : .cancel)
            return
        }
        if url.scheme?.lowercased() == "https" {
            integration?.onOpenExternalURL?(url)
        }
        decisionHandler(.cancel)
    }

    public func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme?.lowercased() == "https" {
            integration?.onOpenExternalURL?(url)
        }
        return nil
    }

    public func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }

    public func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(false)
    }

    public func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        completionHandler(nil)
    }

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        publish(webView, loading: true, errorMessage: nil)
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        publish(webView, loading: false, errorMessage: nil)
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        publish(webView, loading: false, errorMessage: error.localizedDescription)
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        publish(webView, loading: false, errorMessage: error.localizedDescription)
    }

    private func observe(_ webView: WKWebView) {
        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self, weak webView] _, _ in
            guard let webView else { return }
            Task { @MainActor in self?.publish(webView) }
        }
        titleObservation = webView.observe(\.title, options: [.new]) { [weak self, weak webView] _, _ in
            guard let webView else { return }
            Task { @MainActor in self?.publish(webView) }
        }
        urlObservation = webView.observe(\.url, options: [.new]) { [weak self, weak webView] _, _ in
            guard let webView else { return }
            Task { @MainActor in self?.publish(webView) }
        }
        loadingObservation = webView.observe(\.isLoading, options: [.new]) { [weak self, weak webView] _, _ in
            guard let webView else { return }
            Task { @MainActor in self?.publish(webView) }
        }
    }

    @MainActor
    private func publish(_ webView: WKWebView, loading: Bool? = nil, errorMessage: String? = nil) {
        state.wrappedValue = HudWebViewState(
            title: webView.title,
            url: webView.url,
            isLoading: loading ?? webView.isLoading,
            estimatedProgress: webView.estimatedProgress,
            canGoBack: webView.canGoBack,
            canGoForward: webView.canGoForward,
            errorMessage: errorMessage ?? state.wrappedValue.errorMessage
        )
    }
}

private enum HudWebViewPlatform {
    @MainActor
    static func makeWebView(
        _ configuration: HudWebViewConfiguration,
        coordinator: HudWebViewCoordinator
    ) -> WKWebView {
        let webConfiguration = WKWebViewConfiguration()
        webConfiguration.defaultWebpagePreferences.allowsContentJavaScript = configuration.allowsJavaScript
        if configuration.usesNonPersistentDataStore {
            webConfiguration.websiteDataStore = .nonPersistent()
        }
        coordinator.install(in: webConfiguration.userContentController)

        let webView = WKWebView(frame: .zero, configuration: webConfiguration)
        apply(configuration, to: webView)
        return webView
    }

    static func apply(_ configuration: HudWebViewConfiguration, to webView: WKWebView) {
        webView.allowsBackForwardNavigationGestures = configuration.allowsBackForwardNavigationGestures
        webView.customUserAgent = configuration.customUserAgent
        #if os(iOS)
        webView.scrollView.backgroundColor = .clear
        webView.isOpaque = false
        #elseif os(macOS)
        webView.setValue(false, forKey: "drawsBackground")
        #endif
        if #available(iOS 16.4, macOS 13.3, *) {
            webView.isInspectable = configuration.isInspectable
        }
    }
}
