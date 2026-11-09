#if os(macOS)
import AppKit
import Combine
import HudsonNotchCore
import HudsonShell
import SwiftUI

/// Owns the notch panel and its presentation: hover, pin, peek timers, and
/// the stage of activities. Hosts post activities directly or call
/// `serve(socketURL:)` to take them over the wire, and hear the person's
/// answers through `onResponse`.
///
/// The controller adds no status item, settings window, or brand; the host
/// app decides those.
///
/// Whatever the notch shows, the person puts it away the same way: the ×
/// that shows on hover, a swipe up over the notch, Escape while it has the
/// keyboard, or right-click, Dismiss. See `putAway(_:)`. A scene with
/// `escapeWhileVisible` also goes away on Escape pressed in any app while it
/// shows; that press is observed, never taken from the app in front.
@MainActor
public final class HudNotchController: ObservableObject {
    public struct Copy: Sendable {
        /// Accessibility label for the notch as a whole.
        public var name: String
        /// Shown when the notch is opened with nothing on the stage.
        public var idleTitle: String
        public var idleDetail: String

        public init(
            name: String = "Notch",
            idleTitle: String = "Nothing running",
            idleDetail: String = "Updates from your tools appear here"
        ) {
            self.name = name
            self.idleTitle = idleTitle
            self.idleDetail = idleDetail
        }
    }

    @Published public private(set) var notchInfo = HudNotchInfo.effective()
    @Published public private(set) var isVisible = false
    /// The silhouette is out of the housing. False while the panel is
    /// ordered in but the shape has not grown yet, and while it tucks away.
    @Published public private(set) var isPresented = false
    @Published public private(set) var isHovered = false
    @Published public private(set) var isHoverActivated = false
    @Published public private(set) var isExpanded = false
    @Published public private(set) var isPinned = false
    /// The reply field has focus; the notch stays open until it loses it.
    @Published public private(set) var isComposing = false
    /// Bumps each time something asks for attention; the surface flashes on it.
    @Published public private(set) var attentionSerial = 0
    /// Bumps when something asks for attention while the card is already
    /// open; the surface gives the card a small stretch.
    @Published public private(set) var nudgeSerial = 0
    @Published public private(set) var stage: HudNotchStage
    @Published public private(set) var configuration: HudNotchConfiguration
    /// Host content shown in place of the stage. See `present(_:)`.
    @Published public private(set) var scene: HudNotchScene? {
        didSet { syncEscapeWatch() }
    }
    /// Room the scenes shown so far need. It only grows, so the panel never
    /// shrinks under a shape that is still animating down.
    @Published private var sceneRoom: CGSize = .zero
    /// How far a swipe up has gone, 0…1. The surface lifts a little with it.
    @Published public private(set) var swipeProgress: Double = 0

    /// Called on the main actor with each answer or dismissal, after it has
    /// been sent to the socket (when serving).
    public var onResponse: ((HudNotchResponse) -> Void)?

    public let copy: Copy
    public let theme: HudNotchTheme
    private let persistenceKey: String?
    private var panel: HudOverlayPanel?
    private var server: HudNotchSocketServer?
    private var screenObserver: NSObjectProtocol?
    private var presentationDisplayID: CGDirectDisplayID?
    private var hoverActivationTask: Task<Void, Never>?
    private var collapseTask: Task<Void, Never>?
    private var retractTask: Task<Void, Never>?
    private var keyMonitor: Any?
    private var scrollMonitor: Any?
    /// Watches key presses in other apps while a scene with
    /// `escapeWhileVisible` is up. Nil the rest of the time.
    private var escapeMonitor: Any?
    private var swipe = HudNotchSwipe()
    /// The scene last presented, kept so its content can fade out after
    /// `present(nil)`.
    public private(set) var lastScene: HudNotchScene?

    /// - Parameter persistenceKey: a `UserDefaults` key for tuned
    ///   configuration. Nil keeps tuning in memory only.
    public init(
        configuration: HudNotchConfiguration = .default,
        persistenceKey: String? = nil,
        capacity: Int = 8,
        copy: Copy = Copy(),
        theme: HudNotchTheme = .hudson
    ) {
        self.persistenceKey = persistenceKey
        self.copy = copy
        self.theme = theme
        self.stage = HudNotchStage(capacity: capacity)
        let persisted = persistenceKey.flatMap(Self.persistedConfiguration(key:))
        self.configuration = (persisted ?? configuration).normalized()
    }

    deinit {
        if let screenObserver {
            NotificationCenter.default.removeObserver(screenObserver)
        }
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
        }
        if let scrollMonitor {
            NSEvent.removeMonitor(scrollMonitor)
        }
        if let escapeMonitor {
            NSEvent.removeMonitor(escapeMonitor)
        }
    }

    // MARK: Derived geometry

    public var panelSize: CGSize {
        let base = HudNotchMetrics.panelSize(
            notchWidth: notchInfo.notchWidth,
            notchHeight: notchInfo.notchHeight,
            configuration: configuration
        )
        return CGSize(width: max(base.width, sceneRoom.width), height: max(base.height, sceneRoom.height))
    }

    /// The scene is on screen: one is presented and no activity card is
    /// open over it.
    public var showsScene: Bool {
        scene != nil && !(isExpanded && stage.focused != nil)
    }

    public var displayMode: HudNotchDisplayMode {
        configuration.displayMode
    }

    public var renderStyle: HudNotchRenderStyle {
        configuration.displayMode.resolvedStyle(isVirtual: notchInfo.isVirtual)
    }

    public var needsSyntheticNotchFill: Bool {
        renderStyle == .notch && notchInfo.isVirtual
    }

    /// Something ongoing is on the stage, so the collapsed notch widens a
    /// little to show it on the wings.
    public var showsLiveActivity: Bool {
        stage.headline != nil
    }

    public var currentPokeOut: CGFloat {
        if isExpanded || isPinned { return configuration.activePokeOut }
        if isHoverActivated { return configuration.hoverPokeOut }
        if showsLiveActivity { return max(configuration.restPokeOut, min(configuration.hoverPokeOut, 34)) }
        return configuration.restPokeOut
    }

    public var shellHeight: CGFloat {
        max(notchInfo.notchHeight, configuration.shellHeight)
    }

    public var notchGap: CGFloat {
        HudNotchMetrics.notchGap(notchWidth: notchInfo.notchWidth)
    }

    public var shellWidth: CGFloat {
        notchGap + (currentPokeOut * 2) + 24
    }

    public var contentHeight: CGFloat {
        configuration.contentHeight(asksForInput: stage.focused?.asksForInput ?? false)
    }

    // MARK: Lifecycle

    public func start() {
        observeScreenChanges()
        show()
    }

    /// Takes commands from a Unix socket and writes answers back to it.
    public func serve(socketURL: URL = HudNotchSocket.defaultURL) throws {
        guard server == nil else { return }
        let server = HudNotchSocketServer(socketURL: socketURL) { [weak self] command in
            Task { @MainActor in self?.handle(command) }
        }
        try server.start()
        self.server = server
    }

    public func stopServing() {
        server?.stop()
        server = nil
    }

    public var socketURL: URL? { server?.socketURL }

    public func show() {
        refreshNotchInfo()

        if panel == nil {
            let panel = HudOverlayPanelShell.makePanel(
                configuration: HudOverlayPanelShell.Configuration(
                    size: NSSize(width: panelSize.width, height: panelSize.height),
                    title: copy.name,
                    level: NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.screenSaverWindow))),
                    hasShadow: false,
                    hidesOnDeactivate: false,
                    isReleasedWhenClosed: false,
                    collectionBehavior: [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle],
                    activatesOnMouseDown: false,
                    appearance: NSAppearance(named: .darkAqua)
                ),
                rootView: HudNotchSurface(controller: self)
            )
            self.panel = panel
            updatePanelFrame(animated: false)
            installMonitors()
        }

        guard let panel else { return }
        retractTask?.cancel()
        retractTask = nil
        isVisible = true
        guard !isPresented else { return }

        // Never activate the app or take key: the notch must not steal focus.
        panel.alphaValue = 1
        HudOverlayPanelShell.present(panel, activate: false, makeKey: false, orderFrontRegardless: true)
        // Let the tucked-in shape render once so the next frame grows it
        // out of the housing instead of popping in.
        DispatchQueue.main.async { [weak self] in
            guard let self, self.isVisible else { return }
            self.isPresented = true
        }
    }

    /// Folds the card, tucks the shape back into the housing, then orders
    /// the panel out.
    public func hide() {
        guard let panel, panel.isVisible, isVisible else { return }
        isVisible = false
        // The panel goes out from under the pointer without an exit event.
        if isHovered { setHovered(false) }
        swipe.reset()
        swipeProgress = 0
        collapseTask?.cancel()
        setExpanded(false)
        isPresented = false
        retractTask?.cancel()
        retractTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(HudNotchMotion.retractSeconds))
            guard !Task.isCancelled, let self, !self.isVisible else { return }
            self.panel?.orderOut(nil)
        }
    }

    public func toggleVisibility() {
        isVisible ? hide() : show()
    }

    // MARK: Commands

    public func handle(_ command: HudNotchCommand) {
        switch command {
        case .post(let activity): post(activity)
        // Always notify: whoever is still waiting on this id must be released.
        case .dismiss(let id): dismiss(id: id)
        case .pulse: pulse()
        case .subscribe: break
        }
    }

    /// Adds or updates an activity. Progress-only updates stay quiet.
    public func post(_ activity: HudNotchActivity) {
        let change = stage.post(activity)
        guard change.wantsAttention else { return }
        if isExpanded { nudgeSerial += 1 }
        attentionSerial += 1
        show()
        setExpanded(true)
        scheduleCollapse(after: activity.peekDuration)
    }

    /// Removes an activity. With `notify`, a waiting asker and subscribers
    /// hear `dismissed` for it.
    public func dismiss(id: String, notify: Bool = true) {
        guard let removed = stage.dismiss(id: id) else { return }
        if notify, removed.state == .waiting {
            send(.dismissed(id: id))
        }
        if stage.activities.isEmpty, !isHovered, !isPinned {
            scheduleCollapse(after: configuration.collapseDelaySeconds)
        }
    }

    public func choose(_ choice: HudNotchChoice, for activityID: String) {
        if choice.role == .cancel {
            dismiss(id: activityID)
            return
        }
        answer(HudNotchReply(id: activityID, choice: choice.id))
    }

    public func reply(_ text: String, to activityID: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        answer(HudNotchReply(id: activityID, text: trimmed))
    }

    public func focusNext() {
        stage.focusNext()
    }

    public func clearSettled() {
        stage.clearSettled()
    }

    public func open(_ link: HudNotchLink) {
        guard let url = URL(string: link.url) else { return }
        NSWorkspace.shared.open(url)
    }

    /// Opens the card, for a click on the collapsed pill. It folds back on
    /// the focused activity's peek timer unless the pointer stays over it.
    public func expand() {
        show()
        setExpanded(true)
        scheduleCollapse(after: stage.focused?.peekDuration ?? HudNotchActivity.defaultTTL)
    }

    /// Opens briefly without new content.
    public func pulse() {
        if isExpanded { nudgeSerial += 1 }
        attentionSerial += 1
        show()
        setExpanded(true)
        scheduleCollapse(after: 1.35)
    }

    private func answer(_ reply: HudNotchReply) {
        guard stage.answer(reply) != nil else { return }
        isComposing = false
        send(.reply(reply))
        if !isHovered, !isPinned {
            scheduleCollapse(after: 1.6)
        }
    }

    private func send(_ response: HudNotchResponse) {
        server?.respond(response)
        onResponse?(response)
    }

    // MARK: Presentation

    public func setConfiguration(_ configuration: HudNotchConfiguration) {
        let normalized = configuration.normalized()
        guard self.configuration != normalized else { return }
        withAnimation(.easeOut(duration: 0.18)) {
            self.configuration = normalized
        }
        persist(normalized)
        updatePanelFrame(animated: true)
    }

    public func setDisplayMode(_ displayMode: HudNotchDisplayMode) {
        var updated = configuration
        updated.displayMode = displayMode
        setConfiguration(updated)
    }

    public func setHovered(_ hovered: Bool) {
        isHovered = hovered
        hoverActivationTask?.cancel()
        collapseTask?.cancel()
        scene?.onHover?(hovered)

        if hovered {
            // A scene opens on its own terms; hovering it never swaps in the stage.
            guard scene == nil else { return }
            let delay = configuration.hoverActivationDelaySeconds
            hoverActivationTask = Task { [weak self] in
                if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
                guard !Task.isCancelled, let self, self.isHovered else { return }
                self.isHoverActivated = true
                self.setExpanded(true)
            }
            return
        }

        isHoverActivated = false
        scheduleCollapse(after: configuration.collapseDelaySeconds)
    }

    public func setComposing(_ composing: Bool) {
        isComposing = composing
        if composing {
            collapseTask?.cancel()
        } else if !isHovered {
            scheduleCollapse(after: configuration.collapseDelaySeconds)
        }
    }

    public func togglePinned() {
        isPinned.toggle()
        setExpanded(isPinned || isHovered)
    }

    private func scheduleCollapse(after seconds: TimeInterval) {
        guard !isPinned else { return }
        collapseTask?.cancel()
        collapseTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            guard !Task.isCancelled, let self,
                  !self.isHovered, !self.isPinned, !self.isComposing else { return }
            self.setExpanded(false)
        }
    }

    private func setExpanded(_ expanded: Bool) {
        guard isExpanded != expanded else { return }
        isExpanded = expanded
    }

    // MARK: Scenes

    /// Shows host content in the notch in place of the stage, or takes it
    /// away with nil. Presenting again with a new size morphs the shape;
    /// a new `id` cross-fades the body.
    ///
    /// An activity that asks for attention still opens its card over the
    /// scene, and the scene returns when the card folds. Hovering never
    /// opens the stage while a scene is up. Taking the scene away hides the
    /// notch unless the stage has something on it.
    public func present(_ scene: HudNotchScene?) {
        guard let scene else {
            guard self.scene != nil else { return }
            self.scene = nil
            releaseFocus()
            if stage.activities.isEmpty { hide() }
            return
        }
        refreshNotchInfo()
        let room = HudNotchMetrics.sceneRoom(
            width: scene.size.width,
            contentHeight: scene.size.contentHeight,
            notchHeight: notchInfo.notchHeight,
            configuration: configuration
        )
        let grown = CGSize(width: max(sceneRoom.width, room.width), height: max(sceneRoom.height, room.height))
        if grown != sceneRoom {
            sceneRoom = grown
            updatePanelFrame(animated: false)
        }
        lastScene = scene
        self.scene = scene
        if !scene.takesKeys { releaseFocus() }
        show()
    }

    /// Takes the scene away and tells it how through `onDismiss`. With a
    /// person's reason it does nothing for a scene that isn't `dismissible`.
    /// The shape tucks back into the housing unless the stage has something
    /// on it.
    public func dismissScene(_ reason: HudNotchDismissal = .host) {
        guard let scene else { return }
        if reason.byPerson, !scene.dismissible { return }
        self.scene = nil
        releaseFocus()
        if stage.activities.isEmpty {
            hide()
        } else {
            setExpanded(false)
        }
        scene.onDismiss?(reason)
    }

    // MARK: Putting away

    /// What the person would put away right now: the scene, the open card,
    /// or the activity on the collapsed wings.
    public var canPutAway: Bool {
        if showsScene { return scene?.dismissible ?? false }
        return activityToPutAway != nil
    }

    private var activityToPutAway: HudNotchActivity? {
        guard isPresented else { return nil }
        return isExpanded ? stage.focused : stage.headline
    }

    /// The person puts away what the notch is showing. A scene leaves through
    /// `dismissScene(_:)`. An activity leaves the stage and stays off while
    /// its sender keeps posting the same state (see `HudNotchStage.putAway`);
    /// one that was waiting releases its asker with `dismissed`. Returns
    /// whether anything left.
    @discardableResult
    public func putAway(_ reason: HudNotchDismissal) -> Bool {
        if showsScene {
            guard scene?.dismissible == true else { return false }
            dismissScene(reason)
            return true
        }
        guard let activity = activityToPutAway else { return false }
        putAway(activityID: activity.id)
        return true
    }

    /// Puts one activity away for the person: the × on its card.
    public func putAway(activityID id: String) {
        guard let removed = stage.putAway(id: id) else { return }
        isComposing = false
        if removed.state == .waiting { send(.dismissed(id: id)) }
        if stage.waiting.isEmpty { releaseFocus() }
        if stage.activities.isEmpty, scene == nil {
            hide()
        } else {
            // The scene, or what's left on the wings, comes back as the card folds.
            collapseTask?.cancel()
            setExpanded(false)
        }
    }

    /// Makes the notch key so the scene hears keys, without activating the
    /// app. Call it from a click in the scene.
    public func focusScene() {
        guard let panel, showsScene else { return }
        panel.makeKey()
    }

    /// Hands the keyboard back to the app in front, if the notch has it.
    public func releaseFocus() {
        guard let panel, panel.isKeyWindow else { return }
        // A non-activating panel can't resign key to another app directly;
        // ordering it out lets the window server give key back.
        panel.orderOut(nil)
        if isVisible { panel.orderFrontRegardless() }
    }

    /// True while the notch panel is the key window.
    public var hasFocus: Bool { panel?.isKeyWindow ?? false }

    /// Keys and scrolls aimed at the notch's own panel. Both monitors pass
    /// everything else through untouched.
    private func installMonitors() {
        if keyMonitor == nil {
            keyMonitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .flagsChanged]) { [weak self] event in
                // Local monitors run on the main thread.
                nonisolated(unsafe) let event = event
                let consumed = MainActor.assumeIsolated { self?.routeKey(event) ?? false }
                return consumed ? nil : event
            }
        }
        if scrollMonitor == nil {
            scrollMonitor = NSEvent.addLocalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
                nonisolated(unsafe) let event = event
                MainActor.assumeIsolated { self?.routeScroll(event) }
                return event
            }
        }
    }

    /// True when the scene, or Escape, consumed the event. The scene hears
    /// keys first, so a scene that uses Escape itself keeps it.
    private func routeKey(_ event: NSEvent) -> Bool {
        guard let panel else { return false }
        guard event.window === panel else {
            // One of the host's own windows has the keyboard: the same as a
            // press in another app, observed and passed on.
            if event.type == .keyDown { escapePressedElsewhere(event) }
            return false
        }
        if showsScene, let scene {
            let consumed: Bool
            switch event.type {
            case .keyDown: consumed = scene.onKeyDown?(event) ?? false
            case .flagsChanged: consumed = scene.onFlagsChanged?(event) ?? false
            default: consumed = false
            }
            if consumed { return true }
        }
        let bare = event.modifierFlags.intersection([.command, .option, .control, .shift]).isEmpty
        guard event.type == .keyDown, event.keyCode == HudNotchEscape.keyCode, bare, canPutAway else { return false }
        putAway(.escape)
        return true
    }

    // MARK: Escape while visible

    /// Watches key presses in other apps only while the scene asks for it.
    /// A global monitor can't consume events, and that is what we want: the
    /// app in front keeps its Escape. The notch's own panel and the host's
    /// windows go through the local monitor instead.
    private func syncEscapeWatch() {
        let wants = scene.map { $0.escapeWhileVisible && $0.dismissible } ?? false
        if wants, escapeMonitor == nil {
            escapeMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
                let bareEscape = Self.isBareEscape(event)
                guard bareEscape else { return }
                Task { @MainActor in self?.putAwayOnEscapeElsewhere() }
            }
        } else if !wants, let monitor = escapeMonitor {
            NSEvent.removeMonitor(monitor)
            escapeMonitor = nil
        }
    }

    /// True while key presses in other apps are watched for Escape.
    public var watchesEscapeWhileVisible: Bool { escapeMonitor != nil }

    private func escapePressedElsewhere(_ event: NSEvent) {
        guard Self.isBareEscape(event) else { return }
        putAwayOnEscapeElsewhere()
    }

    /// An Escape the notch only overheard: the scene leaves if it is on
    /// screen and asked for it. Nothing else on the notch is put away.
    private func putAwayOnEscapeElsewhere() {
        guard let scene else { return }
        let onScreen = isVisible && isPresented && showsScene
        guard HudNotchEscape.putsAwayWhileVisible(
            bareEscape: true,
            sceneOnScreen: onScreen,
            escapeWhileVisible: scene.escapeWhileVisible,
            dismissible: scene.dismissible
        ) else { return }
        dismissScene(.escape)
    }

    private nonisolated static func isBareEscape(_ event: NSEvent) -> Bool {
        let flags = event.modifierFlags
        return HudNotchEscape.isBareEscape(
            keyCode: event.keyCode,
            control: flags.contains(.control),
            option: flags.contains(.option),
            shift: flags.contains(.shift),
            command: flags.contains(.command),
            isRepeat: event.isARepeat
        )
    }

    /// A swipe up over the notch puts away what it shows.
    private func routeScroll(_ event: NSEvent) {
        guard let panel, event.window === panel else { return }
        let phase: HudNotchSwipe.Phase
        if !event.momentumPhase.isEmpty {
            phase = .momentum
        } else if event.phase.contains(.began) || event.phase.contains(.mayBegin) {
            phase = .began
        } else if event.phase.contains(.ended) || event.phase.contains(.cancelled) {
            phase = .ended
        } else if event.phase.isEmpty {
            phase = .wheel
        } else {
            phase = .changed
        }
        guard canPutAway || phase == .ended else { return }
        // Wheel clicks come in lines; a few of them make a swipe.
        let delta = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.scrollingDeltaY * 12
        let done = swipe.feed(deltaY: delta, inverted: event.isDirectionInvertedFromDevice, phase: phase, at: event.timestamp)
        let progress = swipe.fired ? 0 : swipe.progress
        if swipeProgress != progress { swipeProgress = progress }
        if done { putAway(.swipe) }
    }

    // MARK: Screen

    /// Presents on this display while it is available. Pass nil to restore
    /// the usual preference for a screen with a notch, then the main screen.
    /// The override lasts until cleared and does not change saved settings.
    public func setPresentationScreen(_ screen: NSScreen?) {
        presentationDisplayID = screen.flatMap { HudNotchInfo.displayID(for: $0) }
        observeScreenChanges()
        refreshNotchInfo()
        updatePanelFrame(animated: false)
    }

    private func refreshNotchInfo() {
        notchInfo = HudNotchInfo.effective(for: preferredScreen())
    }

    private func preferredScreen() -> NSScreen? {
        let screens = NSScreen.screens
        if let presentationDisplayID,
           let screen = screens.first(where: { HudNotchInfo.displayID(for: $0) == presentationDisplayID }) {
            return screen
        }
        return screens.first { HudNotchInfo.detect(for: $0).hasNotch }
            ?? NSScreen.main
            ?? screens.first
    }

    private func observeScreenChanges() {
        guard screenObserver == nil else { return }
        screenObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.refreshNotchInfo()
                self?.updatePanelFrame(animated: true)
            }
        }
    }

    private func updatePanelFrame(animated: Bool) {
        guard let panel else { return }
        let size = NSSize(width: panelSize.width, height: panelSize.height)
        let frame = NSRect(
            origin: NSPoint(x: notchInfo.screenCenter - size.width / 2, y: notchInfo.screenFrame.maxY - size.height),
            size: size
        )
        if animated {
            HudOverlayPanelShell.animateFrame(panel, to: frame, duration: 0.18)
        } else {
            panel.setFrame(frame, display: true)
        }
    }

    // MARK: Persistence

    private static func persistedConfiguration(key: String) -> HudNotchConfiguration? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(HudNotchConfiguration.self, from: data)
    }

    private func persist(_ configuration: HudNotchConfiguration) {
        guard let persistenceKey, let data = try? JSONEncoder().encode(configuration) else { return }
        UserDefaults.standard.set(data, forKey: persistenceKey)
    }
}
#endif
