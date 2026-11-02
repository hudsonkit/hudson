import Foundation
import SwiftUI
import HudsonUI

#if os(macOS)
import AppKit
#endif

// MARK: - Public behavior opt-in

public extension HudNavigationSidebar {

    /// Adds edge-drag resizing, drag-to-collapse, drag-to-expand, and a
    /// double-click toggle to the sidebar.
    ///
    /// Resizing is a *behavior* of `HudNavigationSidebar`, not a second
    /// component: the same rendering path draws the fixed rail, the animated
    /// label column, headers, footer, selection, and instrumentation.
    ///
    /// ```swift
    /// @AppStorage("sidebarLabelWidth") private var labelWidth = 156.0
    /// @State private var isCompact = false
    ///
    /// HudNavigationSidebar(
    ///     selection: $section,
    ///     entries: entries,
    ///     isCompact: isCompact,
    ///     railHeader: { AppMark() },
    ///     labelHeader: { Text("SpeakEasy") }
    /// )
    /// .resizable(isCompact: $isCompact, labelWidth: $labelWidth)
    /// ```
    ///
    /// Hudson never persists the width itself — `labelWidth` and `isCompact`
    /// are caller-owned bindings, so `@AppStorage`, a model object, or any
    /// other store works. Every committed resize writes through `labelWidth`;
    /// every collapse or expand writes through `isCompact`.
    ///
    /// The bindings are authoritative: the `progress`/`labelWidth` values used
    /// to construct the sidebar are superseded by `isCompact` and `labelWidth`
    /// here. An `onHeaderTap` handler supplied at construction is preserved; if
    /// none was supplied, tapping the header toggles compact state.
    ///
    /// This is a method on `HudNavigationSidebar`, so it must be applied
    /// directly to the sidebar expression — before any modifier that erases the
    /// concrete type. `.environment(...)`, `.frame(...)`, and friends belong
    /// after `.resizable(...)`, not before it.
    ///
    /// Do not clip the result: the edge handle straddles the trailing edge, so
    /// a `.clipShape` on the outside removes half its hit area.
    ///
    /// - Parameters:
    ///   - isCompact: Caller-owned collapsed state.
    ///   - labelWidth: Caller-owned expanded label-column width.
    ///   - minLabelWidth: Narrowest width that can be committed.
    ///   - maxLabelWidth: Widest width, for both preview and committed values.
    ///   - collapseLabelWidth: Dragging left past this preview width collapses.
    ///   - activationDistance: Horizontal travel before a drag counts as resize.
    ///   - leadingInset: Space reserved left of the rail column.
    ///   - onResizePhaseChange: `true` when a resize drag begins, `false` when
    ///     it ends — once per gesture. Useful for suspending expensive content
    ///     redraws while the user drags.
    func resizable(
        isCompact: Binding<Bool>,
        labelWidth: Binding<CGFloat>,
        minLabelWidth: CGFloat = 100,
        maxLabelWidth: CGFloat = 360,
        collapseLabelWidth: CGFloat = 44,
        activationDistance: CGFloat = 6,
        leadingInset: CGFloat = HudSidebarLayout.leadingInset,
        onResizePhaseChange: @escaping (Bool) -> Void = { _ in }
    ) -> some View {
        HudSidebarResizeHost(
            selection: $selection,
            entries: entries,
            isCompact: isCompact,
            labelWidth: labelWidth,
            variant: variant,
            accent: accent,
            geometry: HudSidebarResizeGeometry(
                minLabelWidth: minLabelWidth,
                maxLabelWidth: maxLabelWidth,
                collapseLabelWidth: collapseLabelWidth,
                activationDistance: activationDistance
            ),
            leadingInset: leadingInset,
            onHeaderTap: onHeaderTap,
            onResizePhaseChange: onResizePhaseChange,
            railHeader: railHeader,
            labelHeader: labelHeader,
            verticalTabs: verticalTabs,
            footer: footer
        )
    }
}

// MARK: - Internal resize host

/// Talkie-derived host that wraps `HudNavigationSidebar` with the shell
/// behavior SwiftUI does not provide: an edge handle, preview-then-commit
/// resizing in expanded mode, drag-left-to-collapse, and drag-right-to-expand
/// from compact mode.
///
/// Deliberately internal. Applications reach it through
/// `HudNavigationSidebar.resizable(isCompact:labelWidth:)` so there is never a
/// second sidebar type to choose between; the deprecated
/// `HudResizableNavigationSidebar` is sugar over this same host.
struct HudSidebarResizeHost<
    Selection: Hashable,
    RailHeader: View,
    LabelHeader: View,
    Footer: View
>: View {
    @Binding private var selection: Selection?
    @Binding private var isCompact: Bool
    @Binding private var labelWidth: CGFloat

    private let entries: [HudSidebarEntry<Selection>]
    private let variant: HudNavigationSidebarVariant
    private let accent: Color?
    private let geometry: HudSidebarResizeGeometry
    private let leadingInset: CGFloat
    private let onHeaderTap: (() -> Void)?
    private let onResizePhaseChange: (Bool) -> Void
    private let railHeader: RailHeader
    private let labelHeader: LabelHeader
    private let verticalTabs: AnyView?
    private let footer: Footer

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dragPreviewLabelWidth: CGFloat?
    @State private var isDragging = false

    init(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        isCompact: Binding<Bool>,
        labelWidth: Binding<CGFloat>,
        variant: HudNavigationSidebarVariant,
        accent: Color?,
        geometry: HudSidebarResizeGeometry,
        leadingInset: CGFloat,
        onHeaderTap: (() -> Void)?,
        onResizePhaseChange: @escaping (Bool) -> Void,
        railHeader: RailHeader,
        labelHeader: LabelHeader,
        verticalTabs: AnyView?,
        footer: Footer
    ) {
        self._selection = selection
        self._isCompact = isCompact
        self._labelWidth = labelWidth
        self.entries = entries
        self.variant = variant
        self.accent = accent
        self.geometry = geometry
        self.leadingInset = leadingInset
        self.onHeaderTap = onHeaderTap
        self.onResizePhaseChange = onResizePhaseChange
        self.railHeader = railHeader
        self.labelHeader = labelHeader
        self.verticalTabs = verticalTabs
        self.footer = footer
    }

    var body: some View {
        navigationSidebar
            .padding(.leading, leadingInset)
            .frame(width: layoutWidth, alignment: .leading)
            .overlay(alignment: .trailing) {
                edgeHandle
                    .alignmentGuide(.trailing) { dimensions in
                        dimensions[.trailing] - dimensions.width / 2
                    }
            }
            .overlay(alignment: .trailing) {
                resizePreviewEdge
            }
            .overlay(alignment: .trailing) {
                Rectangle()
                    // hudlint:disable next-line opacity
                    .fill(activeAccent.opacity(isDragging && dragPreviewLabelWidth == nil ? 0.42 : 0))
                    .frame(width: HudStrokeWidth.standard)
                    .allowsHitTesting(false)
                    .animation(HudMotion.ifAllowed(.easeOut(duration: 0.12), reduceMotion: reduceMotion), value: isDragging)
            }
            .transaction { transaction in
                if isDragging {
                    transaction.animation = nil
                    transaction.disablesAnimations = true
                }
            }
            .onChange(of: isDragging) { _, dragging in
                onResizePhaseChange(dragging)
                if !dragging {
                    dragPreviewLabelWidth = nil
                }
            }
            .onChange(of: isCompact) { _, _ in
                if !isDragging {
                    dragPreviewLabelWidth = nil
                }
            }
    }

    // MARK: Sidebar

    /// The one rendering path. Nothing about headers, footers, entries,
    /// selection, style, or instrumentation is duplicated here.
    private var navigationSidebar: some View {
        HudNavigationSidebar(
            selection: $selection,
            entries: entries,
            progress: progress,
            variant: variant,
            accent: accent,
            labelWidth: effectiveLabelWidth,
            onHeaderTap: headerTapAction,
            railHeader: railHeader,
            labelHeader: labelHeader,
            verticalTabs: verticalTabs,
            footer: footer
        )
        .frame(maxHeight: .infinity, alignment: .top)
    }

    /// A call-site handler wins; otherwise the header behaves like the classic
    /// Hudson toggle so the affordance is never silently lost.
    private var headerTapAction: () -> Void {
        if let onHeaderTap {
            return onHeaderTap
        }
        return toggleCompact
    }

    // MARK: Edge handle

    private var edgeHandle: some View {
        HudSidebarEdgeHandle(
            isCompact: isCompact,
            geometry: geometry,
            currentWidth: effectiveLabelWidth,
            visualOffset: resizePreviewOffset ?? 0,
            reduceMotion: reduceMotion,
            accent: activeAccent,
            isDragging: $isDragging,
            onToggle: toggleCompact,
            onPreview: { width in
                dragPreviewLabelWidth = geometry.previewWidth(width)
            },
            onOutcome: apply
        )
    }

    private func apply(_ outcome: HudSidebarResizeGeometry.Outcome) {
        switch outcome {
        case .resize(let width):
            labelWidth = width
        case .collapse(let restoreWidth):
            labelWidth = restoreWidth
            setCompact(true)
        case .expand(let width):
            labelWidth = width
            setCompact(false)
        }
    }

    // MARK: Geometry

    private var effectiveLabelWidth: CGFloat {
        geometry.committedWidth(labelWidth)
    }

    private var progress: Double {
        isCompact ? 1.0 : 0.0
    }

    private var layoutWidth: CGFloat {
        leadingInset + HudSidebarLayout.intrinsicWidth(progress: progress, labelWidth: effectiveLabelWidth)
    }

    private var resizePreviewOffset: CGFloat? {
        guard let dragPreviewLabelWidth else { return nil }
        let previewWidth = leadingInset + HudSidebarLayout.railContentInset + HudSidebarLayout.railWidth
            + geometry.previewWidth(dragPreviewLabelWidth)
        return previewWidth - layoutWidth
    }

    @ViewBuilder
    private var resizePreviewEdge: some View {
        if let resizePreviewOffset {
            Rectangle()
                .fill(HudSurface.tintStrong(activeAccent))
                .frame(width: HudStrokeWidth.standard)
                .offset(x: resizePreviewOffset)
                .allowsHitTesting(false)
        }
    }

    private var activeAccent: Color {
        accent ?? .accentColor
    }

    // MARK: State transitions

    private func toggleCompact() {
        setCompact(!isCompact)
    }

    private func setCompact(_ compact: Bool) {
        // Under Reduce Motion the animation resolves to nil — the state still
        // changes, it just lands without a transition.
        withAnimation(HudSidebarMotion.expandCollapse(reduceMotion: reduceMotion)) {
            isCompact = compact
        }
    }
}

// MARK: - Edge handle

/// Trailing-edge grab target. Owns pointer plumbing and cursor state only —
/// every width decision routes through `HudSidebarResizeGeometry`.
private struct HudSidebarEdgeHandle: View {
    let isCompact: Bool
    let geometry: HudSidebarResizeGeometry
    let currentWidth: CGFloat
    let visualOffset: CGFloat
    let reduceMotion: Bool
    let accent: Color
    @Binding var isDragging: Bool
    let onToggle: () -> Void
    let onPreview: (CGFloat) -> Void
    let onOutcome: (HudSidebarResizeGeometry.Outcome) -> Void

    @State private var isHovered = false
    @State private var cursorPushed = false
    @State private var dragStartWidth: CGFloat?
    @State private var latestResizeWidth: CGFloat?
    @State private var didCommitResize = false
    @State private var lastClickTime: Date?

    private static let doubleClickInterval: TimeInterval = 0.35
    /// Width step for the VoiceOver / assistive adjustable action.
    private static let accessibilityWidthStep: CGFloat = 16

    private var hitWidth: CGFloat {
        isCompact ? 26 : 16
    }

    var body: some View {
        let isActive = isHovered || isDragging
        let handleVisualWidth: CGFloat = isCompact ? 4 : 3
        let pillHeight: CGFloat = isCompact ? (isActive ? 74 : 62) : (isActive ? 64 : 56)
        let haloWidth = handleVisualWidth + (isCompact ? 12 : 8)
        let haloHeight = pillHeight + 12
        let haloFill = HudSurface.selected(accent)
        let handleFill = isActive
            ? HudSurface.tintMuted(accent)
            : (isCompact ? HudSurface.tintFill(accent) : Color.clear)

        Rectangle()
            .fill(Color.clear)
            .frame(width: hitWidth)
            .contentShape(Rectangle())
            .overlay {
                ZStack {
                    if isActive {
                        RoundedRectangle(cornerRadius: HudRadius.standard)
                            .fill(haloFill)
                            .frame(width: haloWidth, height: haloHeight)
                            .blur(radius: 6)
                    }

                    RoundedRectangle(cornerRadius: HudRadius.tight)
                        .fill(handleFill)
                        .frame(width: handleVisualWidth, height: pillHeight)
                }
                .offset(x: visualOffset - HudStrokeWidth.thin / 2)
                .animation(HudMotion.ifAllowed(.easeOut(duration: 0.14), reduceMotion: reduceMotion), value: isActive)
            }
            .onContinuousHover { phase in
                switch phase {
                case .active:
                    if !isHovered { isHovered = true }
                    acquireResizeCursor()
                case .ended:
                    isHovered = false
                    releaseResizeCursorIfIdle()
                }
            }
            .gesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .global)
                    .onChanged(handleDragChanged)
                    .onEnded(handleDragEnded)
            )
            .help(isCompact ? "Double-click to expand; drag right to size" : "Drag to resize; drag left past minimum to collapse")
            .accessibilityElement()
            .accessibilityLabel("Resize navigation sidebar")
            .accessibilityValue(isCompact ? "Collapsed" : "\(Int(currentWidth.rounded())) points")
            .accessibilityHint(isCompact ? "Activate to expand the sidebar" : "Adjust to resize, or activate to collapse")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: isCompact ? "Expand sidebar" : "Collapse sidebar") { onToggle() }
            .accessibilityAdjustableAction(adjustWidth)
    }

    // MARK: Drag

    private func handleDragChanged(_ value: DragGesture.Value) {
        if dragStartWidth == nil {
            dragStartWidth = geometry.dragStartWidth(isCompact: isCompact, currentWidth: currentWidth)
            latestResizeWidth = nil
            didCommitResize = false
        }

        let horizontalDelta = value.location.x - value.startLocation.x
        let verticalDelta = value.location.y - value.startLocation.y

        guard geometry.isResizeActivated(
            isCompact: isCompact,
            horizontalDelta: horizontalDelta,
            verticalDelta: verticalDelta
        ) else { return }

        didCommitResize = true
        if !isDragging {
            isDragging = true
            acquireResizeCursor()
        }

        let proposed = geometry.proposedPreviewWidth(
            startWidth: dragStartWidth ?? currentWidth,
            horizontalDelta: horizontalDelta
        )
        latestResizeWidth = proposed

        var transaction = Transaction(animation: nil)
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            onPreview(proposed)
        }
    }

    private func handleDragEnded(_ value: DragGesture.Value) {
        let horizontalDelta = value.location.x - value.startLocation.x
        let verticalDelta = value.location.y - value.startLocation.y

        if didCommitResize {
            onOutcome(
                geometry.outcome(
                    isCompact: isCompact,
                    startWidth: dragStartWidth ?? currentWidth,
                    finalWidth: latestResizeWidth ?? currentWidth,
                    horizontalDelta: horizontalDelta
                )
            )
        } else if geometry.isClick(
            isCompact: isCompact,
            horizontalDelta: horizontalDelta,
            verticalDelta: verticalDelta
        ) {
            handleClick()
        }

        dragStartWidth = nil
        latestResizeWidth = nil
        didCommitResize = false
        isDragging = false
        releaseResizeCursorIfIdle()
    }

    private func handleClick() {
        let now = Date()
        if let lastClickTime,
           now.timeIntervalSince(lastClickTime) <= Self.doubleClickInterval {
            self.lastClickTime = nil
            onToggle()
        } else {
            lastClickTime = now
        }
    }

    // MARK: Accessibility

    /// Keyboard/assistive equivalent of the drag: step the width, and cross the
    /// collapse/expand boundary the same way a drag would.
    private func adjustWidth(_ direction: AccessibilityAdjustmentDirection) {
        switch direction {
        case .increment:
            if isCompact {
                onOutcome(.expand(labelWidth: geometry.committedWidth(geometry.minLabelWidth)))
            } else {
                onOutcome(.resize(labelWidth: geometry.committedWidth(currentWidth + Self.accessibilityWidthStep)))
            }

        case .decrement:
            guard !isCompact else { return }
            let next = currentWidth - Self.accessibilityWidthStep
            if next <= geometry.collapseLabelWidth {
                onOutcome(.collapse(restoreWidth: geometry.committedWidth(currentWidth)))
            } else {
                onOutcome(.resize(labelWidth: geometry.committedWidth(next)))
            }

        @unknown default:
            return
        }
    }

    // MARK: Cursor

    private func acquireResizeCursor() {
        #if os(macOS)
        guard !cursorPushed else { return }
        NSCursor.resizeLeftRight.push()
        cursorPushed = true
        #endif
    }

    private func releaseResizeCursorIfIdle() {
        #if os(macOS)
        guard cursorPushed, !isHovered, !isDragging else { return }
        NSCursor.pop()
        cursorPushed = false
        #endif
    }
}
