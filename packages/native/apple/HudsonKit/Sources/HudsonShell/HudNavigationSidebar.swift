import SwiftUI
import HudsonUI
import HudsonObservability

// MARK: - HudSidebarItem

/// One selectable row in the sidebar. `id` is the type-safe selection key.
/// `selectedIcon` is the SF Symbol name to use when this item is active —
/// typically the `.fill` variant of `icon`.
public struct HudSidebarItem<Selection: Hashable>: Identifiable, Equatable {
    public let id: Selection
    public let title: String
    public let icon: String
    public let selectedIcon: String?
    public let tooltipLabel: String?

    public init(
        id: Selection,
        title: String,
        icon: String,
        selectedIcon: String? = nil,
        tooltipLabel: String? = nil
    ) {
        self.id = id
        self.title = title
        self.icon = icon
        self.selectedIcon = selectedIcon
        self.tooltipLabel = tooltipLabel
    }

    public static func == (lhs: HudSidebarItem, rhs: HudSidebarItem) -> Bool {
        lhs.id == rhs.id
    }
}

extension HudSidebarItem: Sendable where Selection: Sendable {}

// MARK: - HudSidebarEntry

/// An entry in the sidebar — either a selectable item or a section header.
public enum HudSidebarEntry<Selection: Hashable>: Identifiable {
    case item(HudSidebarItem<Selection>)
    case section(id: String, title: String)

    public var id: String {
        switch self {
        case .item(let item):       return "item-\(item.id.hashValue)"
        case .section(let id, _):  return "section-\(id)"
        }
    }
}
// MARK: - HudNavigationSidebarVariant

/// Structural presentation for `HudNavigationSidebar`.
///
/// `standard` preserves the destination-only sidebar. `verticalTabs` reserves
/// the flexible middle region for a caller-supplied vertical-tab list while
/// keeping the same typed destinations, compact rail, header, and footer.
public enum HudNavigationSidebarVariant: String, CaseIterable, Identifiable, Sendable {
    case standard
    case verticalTabs

    public var id: String { rawValue }
}

// MARK: - HudSidebarPresentationState

/// The three observable presentation states of a dismissible sidebar.
///
/// A hidden sidebar may preview while the pointer crosses either its reveal
/// control or the revealed sidebar itself. Clicking the control pins that
/// preview; clicking again returns it to pointer-owned preview until the
/// pointer leaves. The caller owns any dismissal grace period.
public enum HudSidebarPresentation: String, CaseIterable, Identifiable, Sendable {
    case hidden
    case preview
    case pinned

    public var id: String { rawValue }
}

/// Caller-owned interaction state for a sidebar that can dismiss completely,
/// preview on hover, and be pinned back into the layout.
public struct HudSidebarPresentationState: Equatable, Sendable {
    public private(set) var isPinned: Bool
    public private(set) var isRevealControlHovered = false
    public private(set) var isSidebarHovered = false

    public init(isPinned: Bool = true) {
        self.isPinned = isPinned
    }

    public var presentation: HudSidebarPresentation {
        if isPinned {
            return .pinned
        }
        if isRevealControlHovered || isSidebarHovered {
            return .preview
        }
        return .hidden
    }

    public var isPresented: Bool {
        presentation != .hidden
    }

    public mutating func setRevealControlHovered(_ hovered: Bool) {
        isRevealControlHovered = hovered
    }

    public mutating func setSidebarHovered(_ hovered: Bool) {
        isSidebarHovered = hovered
    }

    public mutating func togglePinned() {
        isPinned.toggle()
    }

    public mutating func pin() {
        isPinned = true
    }

    public mutating func dismiss() {
        isPinned = false
        isRevealControlHovered = false
        isSidebarHovered = false
    }
}


// MARK: - HudNavigationSidebar

/// Two-column navigation sidebar for `HudAppShell`'s leading slot.
///
/// The key structural property: icons live in a fixed-width rail column that
/// never animates. Labels live in a parallel column whose WIDTH animates from
/// `labelWidth → 0` as `progress` goes from 0 (expanded) to 1 (compact).
/// Because icon x-positions depend only on the fixed rail column, they cannot
/// bounce during the transition.
///
/// Brand accent defaults to `manifest.accent` from `@Environment(\.hudsonAppManifest)`.
/// Pass an explicit `accent` to override per call-site.
///
/// Motion respects `@Environment(\.accessibilityReduceMotion)` — all animations
/// are skipped when reduced motion is on.
public struct HudNavigationSidebar<
    Selection: Hashable,
    RailHeader: View,
    LabelHeader: View,
    Footer: View
>: View {

    @Binding public var selection: Selection?
    public let entries: [HudSidebarEntry<Selection>]
    public let progress: Double
    public let accent: Color?           // nil = use manifest.accent
    public let labelWidth: CGFloat      // expanded label-column width; defaults to HudSidebarLayout.labelWidth
    public let onHeaderTap: (() -> Void)?
    public let variant: HudNavigationSidebarVariant
    public let railHeader: RailHeader
    public let labelHeader: LabelHeader
    let verticalTabs: AnyView?
    public let footer: Footer

    @Environment(\.hudsonAppManifest) private var manifest
    @Environment(\.hudTheme) private var theme
    @Environment(\.hudsonSidebarStyle) private var style
    @Environment(\.hudsonSidebarMotionMode) private var motionMode
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var hoveredID: Selection?

    public init(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        progress: Double,
        accent: Color? = nil,
        labelWidth: CGFloat = HudSidebarLayout.labelWidth,
        onHeaderTap: (() -> Void)? = nil,
        @ViewBuilder railHeader: () -> RailHeader,
        @ViewBuilder labelHeader: () -> LabelHeader,
        @ViewBuilder footer: () -> Footer
    ) {
        self.init(
            selection: selection,
            entries: entries,
            progress: progress,
            variant: .standard,
            accent: accent,
            labelWidth: labelWidth,
            onHeaderTap: onHeaderTap,
            railHeader: railHeader(),
            labelHeader: labelHeader(),
            verticalTabs: nil,
            footer: footer()
        )
    }

    public init<Tabs: View>(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        progress: Double,
        variant: HudNavigationSidebarVariant = .verticalTabs,
        accent: Color? = nil,
        labelWidth: CGFloat = HudSidebarLayout.labelWidth,
        onHeaderTap: (() -> Void)? = nil,
        @ViewBuilder railHeader: () -> RailHeader,
        @ViewBuilder labelHeader: () -> LabelHeader,
        @ViewBuilder verticalTabs: () -> Tabs,
        @ViewBuilder footer: () -> Footer
    ) {
        self.init(
            selection: selection,
            entries: entries,
            progress: progress,
            variant: variant,
            accent: accent,
            labelWidth: labelWidth,
            onHeaderTap: onHeaderTap,
            railHeader: railHeader(),
            labelHeader: labelHeader(),
            verticalTabs: AnyView(verticalTabs()),
            footer: footer()
        )
    }

    init(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        progress: Double,
        variant: HudNavigationSidebarVariant,
        accent: Color?,
        labelWidth: CGFloat,
        onHeaderTap: (() -> Void)?,
        railHeader: RailHeader,
        labelHeader: LabelHeader,
        verticalTabs: AnyView?,
        footer: Footer
    ) {
        self._selection = selection
        self.entries = entries
        self.progress = progress
        self.accent = accent
        self.labelWidth = labelWidth
        self.onHeaderTap = onHeaderTap
        self.variant = variant
        self.railHeader = railHeader
        self.labelHeader = labelHeader
        self.verticalTabs = verticalTabs
        self.footer = footer
    }

    // MARK: Resolved accent

    private var resolvedAccent: Color { accent ?? manifest.accent }

    // MARK: Motion helpers

    private var labelsSettled: Bool { progress < 0.001 }
    private var compactSettled: Bool { progress > 0.999 }

    /// Opacity for label-column content.
    private var labelOpacity: Double {
        switch motionMode {
        case .smoothFade:                        return 1 - progress
        case .quietTransition, .snapEverything:  return labelsSettled ? 1 : 0
        }
    }

    /// Opacity for the expanded-mode selection underlay.
    private var underlayOpacity: Double {
        switch motionMode {
        case .smoothFade:                        return max(0, 1 - progress * 2)
        case .quietTransition, .snapEverything:  return labelsSettled ? 1 : 0
        }
    }

    /// Opacity for the compact-mode bottom accent bar.
    private var compactBarOpacity: Double {
        switch motionMode {
        case .smoothFade:                        return progress
        case .quietTransition, .snapEverything:  return compactSettled ? 1 : 0
        }
    }

    /// Visible width of the animated label column at the current transition point.
    private var visibleLabelWidth: CGFloat {
        max(0, labelWidth * CGFloat(1 - progress))
    }

    /// Hover labels take over only once the real label column can no longer
    /// carry readable text. This also covers user-resized narrow states.
    private var compactHoverLabelReveal: Double {
        let fadeStart: CGFloat = 88
        let fadeEnd: CGFloat = 28

        if visibleLabelWidth <= fadeEnd { return 1 }
        if visibleLabelWidth >= fadeStart { return 0 }

        return Double((fadeStart - visibleLabelWidth) / (fadeStart - fadeEnd))
    }

    // MARK: Body

    public var body: some View {
        let isLiquid = (style.surface == .liquidGlass)
        let glass = style.liquidGlass
        let inset: CGFloat = isLiquid ? glass.inset : 0
        let radius: CGFloat = isLiquid ? glass.cornerRadius : 0
        // Liquid-glass surround stroke: white-tinted at low alpha when no accent override,
        // otherwise the supplied accent at a calibrated opacity.
        // hudlint:disable next-line palette,opacity
        let strokeColor: Color = glass.accent ?? Color.white.opacity(0.08)
        // hudlint:disable next-line opacity
        let strokeOpacity: Double = glass.accent == nil ? 1.0 : 0.45
        let intrinsic = HudSidebarLayout.intrinsicWidth(progress: progress, labelWidth: labelWidth)

        return VStack(spacing: 0) {
            sidebarBody
            if variant == .verticalTabs, let verticalTabs {
                HudDivider(color: theme.hairline.subtle)
                verticalTabs
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            } else {
                Spacer(minLength: 0)
            }
            footerBlock
        }
        // Self-size to intrinsic width so the whole sidebar narrows as `progress` goes 0→1.
        // The donor relied on a NavigationSplitView column to clip; standalone hosts need
        // the sidebar to own its width. Hosts that want different sizing can wrap in their
        // own `.frame(width:)`.
        .frame(width: intrinsic, alignment: .leading)
        .frame(maxHeight: .infinity)
        // In .liquidGlass mode, push the surface in by `inset` so its rounded edge floats
        // against the window background. .padding lives OUTSIDE .frame so the inner
        // content keeps its rail/label geometry; only the outer (host-facing) bounds grow.
        .padding(inset)
        .background {
            if isLiquid {
                #if os(macOS)
                HudVisualEffectView(material: .sidebar, blendingMode: .behindWindow)
                    .opacity(glass.translucency)
                    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .strokeBorder(strokeColor.opacity(strokeOpacity), lineWidth: 0.5)
                    )
                    .padding(inset)
                    .allowsHitTesting(false)
                #else
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .fill(.regularMaterial)
                    .opacity(glass.translucency)
                    .overlay(
                        RoundedRectangle(cornerRadius: radius, style: .continuous)
                            .strokeBorder(strokeColor.opacity(strokeOpacity), lineWidth: 0.5)
                    )
                    .padding(inset)
                    .allowsHitTesting(false)
                #endif
            } else if variant == .verticalTabs {
                SidebarSurface(style: style.surface)
                    .ignoresSafeArea(.container, edges: .top)
            } else {
                SidebarSurface(style: style.surface)
            }
        }
        .overlay(alignment: .trailing) {
            if !isLiquid, variant == .verticalTabs {
                SidebarTrailingRule(style: style.surface)
                    .ignoresSafeArea(.container, edges: .top)
            } else if !isLiquid {
                SidebarTrailingRule(style: style.surface)
            }
        }
    }

    // MARK: Main body (header + rows)

    private var sidebarBody: some View {
        ZStack(alignment: .topLeading) {
            hoverUnderlay
            selectionUnderlay
            HStack(alignment: .top, spacing: 0) {
                railColumn
                labelColumn
            }
            .padding(.leading, HudSidebarLayout.railContentInset)
            compactAccentBar
        }
        .overlay(alignment: .topLeading) {
            compactHoverLabel
        }
        // Clear the hover highlight when the pointer leaves the whole sidebar — a
        // per-row hover-end can be missed when the cursor exits the window quickly,
        // leaving a stray pill stuck on the last-hovered item.
        .onHover { inside in
            if !inside, hoveredID != nil { hoveredID = nil }
        }
    }

    // MARK: Footer

    /// Footer slot. Spans the sidebar's full intrinsic width so consumers can
    /// fit picker controls, account chips, etc. when expanded — and naturally
    /// clips to rail width when compact (the parent's outer frame does the clip).
    /// Consumers wanting a rail-only icon can constrain themselves with
    /// `.frame(width: HudSidebarLayout.railWidth, alignment: .leading)`.
    @ViewBuilder
    private var footerBlock: some View {
        if Footer.self != EmptyView.self {
            VStack(spacing: 0) {
                HudDivider(color: theme.hairline.subtle)
                footer
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, (HudSidebarLayout.edgeBandHeight - HudSidebarLayout.rowHeight) / 2)
            }
        }
    }

    // MARK: Rail column

    private var railColumn: some View {
        VStack(spacing: 0) {
            railHeader
                .frame(width: HudSidebarLayout.railWidth, height: HudSidebarLayout.headerHeight)
                .padding(.top, HudSidebarLayout.headerTopPadding)
                .padding(.bottom, HudSidebarLayout.headerBottomPadding)
                .contentShape(Rectangle())
                .onTapGesture { onHeaderTap?() }

            ForEach(entries) { entry in
                railCell(for: entry)
            }
        }
        .frame(width: HudSidebarLayout.railWidth)
    }

    @ViewBuilder
    private func railCell(for entry: HudSidebarEntry<Selection>) -> some View {
        switch entry {
        case .item(let item):
            HudSidebarRailIcon(
                item: item,
                isSelected: selection == item.id,
                accent: resolvedAccent,
                progress: progress,
                compactBarOpacity: compactBarOpacity,
                style: style,
                reduceMotion: reduceMotion,
                onTap: {
                    selectItem(item)
                },
                onHoverChange: { hovering in
                    updateHover(item.id, hovering: hovering)
                }
            )
            .frame(width: HudSidebarLayout.railWidth, height: HudSidebarLayout.rowHeight)

        case .section(_, let title):
            // Same height as the label column's section header so the two columns
            // stay y-aligned. Usually empty — but a `railLeading` group name is
            // drawn from here, since this is the column whose leading edge it
            // wants. It is an overlay rather than a child so the text can run past
            // the rail's 48pt into the label column's space: a parent `frame` sizes
            // an overlay's anchor, it does not clip what the overlay draws.
            Color.clear
                .frame(
                    width: HudSidebarLayout.railWidth,
                    height: Self.sectionExtent(title)
                )
                .overlay(alignment: .bottomLeading) {
                    if style.sectionAlignment == .railLeading {
                        sectionLabel(title)
                            .padding(.leading, HudSidebarLayout.sectionRailLeading)
                            .frame(height: HudSidebarLayout.sectionHeaderHeight, alignment: .bottomLeading)
                            // Fades with the label column it overhangs. Without this
                            // a collapsing sidebar would keep the group names, and
                            // they would be the only thing left sticking out of a
                            // 48pt rail.
                            .opacity(labelOpacity)
                            .animation(nil, value: labelsSettled)
                            .allowsHitTesting(false)
                    }
                }
        }
    }

    /// The group name itself, so the two places that can draw it agree on what it
    /// looks like.
    private func sectionLabel(_ title: String) -> some View {
        Text(title.uppercased())
            .font(HudFont.mono(HudTextSize.xxs, weight: .regular))
            .tracking(HudTracking.wider)
            .foregroundStyle(theme.palette.dim)
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
    }

    // MARK: Label column

    private var labelColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            labelHeader
                .frame(height: HudSidebarLayout.headerHeight, alignment: .leading)
                .padding(.top, HudSidebarLayout.headerTopPadding)
                .padding(.bottom, HudSidebarLayout.headerBottomPadding)
                .padding(.leading, HudSidebarLayout.labelLeading)
                .contentShape(Rectangle())
                .onTapGesture { onHeaderTap?() }

            ForEach(entries) { entry in
                labelCell(for: entry)
            }
        }
        // Width animates from labelWidth → 0. Text inside is fixed-size and
        // clipped from the right — labels never reflow, icons never move.
        .frame(width: max(0, labelWidth * (1 - progress)), alignment: .leading)
        .clipped()
        .opacity(labelOpacity)
        .animation(nil, value: labelsSettled)
        .allowsHitTesting(labelsSettled)
    }

    @ViewBuilder
    private func labelCell(for entry: HudSidebarEntry<Selection>) -> some View {
        switch entry {
        case .item(let item):
            let isSelected = selection == item.id
            Text(item.title)
                .font(HudFont.ui(HudTextSize.base, weight: isSelected ? .medium : .regular))
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .foregroundStyle(isSelected ? theme.palette.ink : theme.palette.muted)
                .padding(.leading, HudSidebarLayout.labelLeading)
                .frame(height: HudSidebarLayout.rowHeight, alignment: .leading)
                .contentShape(Rectangle())
                .onTapGesture { selectItem(item) }
                .onContinuousHover { phase in
                    switch phase {
                    case .active: updateHover(item.id, hovering: true)
                    case .ended:  updateHover(item.id, hovering: false)
                    }
                }

        case .section(_, let title) where title.isEmpty:
            Color.clear
                .frame(height: Self.sectionExtent(title))

        case .section(_, let title):
            let alignment = style.sectionAlignment
            let trailingAligned = alignment == .trailing
            VStack(alignment: .leading, spacing: 0) {
                Spacer().frame(height: HudSidebarLayout.sectionTopGap)
                // `railLeading` draws its name from the rail column instead; this
                // slot still reserves the height so the rows below stay put.
                if alignment == .railLeading {
                    Color.clear
                        .frame(height: HudSidebarLayout.sectionHeaderHeight)
                } else {
                    sectionLabel(title)
                        .padding(.leading, trailingAligned ? 0 : HudSidebarLayout.labelLeading)
                        .padding(.trailing, trailingAligned ? HudSidebarLayout.sectionTrailingInset : 0)
                        .frame(
                            maxWidth: .infinity,
                            alignment: trailingAligned ? .bottomTrailing : .bottomLeading
                        )
                        .frame(
                            height: HudSidebarLayout.sectionHeaderHeight,
                            alignment: trailingAligned ? .bottomTrailing : .bottomLeading
                        )
                }
            }
        }
    }

    // MARK: Selection underlay

    @ViewBuilder
    private var selectionUnderlay: some View {
        if let y = selectionY {
            SidebarSelectionUnderlay(style: style.indicator, accent: resolvedAccent)
                .opacity(underlayOpacity)
                .animation(nil, value: labelsSettled)
                .offset(y: y)
                // Slide animation respects reduce-motion.
                .animation(
                    reduceMotion ? nil : style.motion.selectionSlide,
                    value: y
                )
                .allowsHitTesting(false)
        }
    }

    // MARK: Compact accent bar

    @ViewBuilder
    private var compactAccentBar: some View {
        if let y = selectionY {
            SidebarCompactAccent(style: style.indicator, accent: resolvedAccent)
                .offset(y: y)
                .opacity(compactBarOpacity)
                .animation(
                    reduceMotion ? nil : style.motion.selectionSlide,
                    value: y
                )
                .animation(nil, value: compactSettled)
                .allowsHitTesting(false)
        }
    }

    // MARK: Geometry helpers

    /// Y-offset of the selected row, measured from the top of the sidebar body.
    /// Computed from the entries array — no GeometryReader needed.
    private var selectionY: CGFloat? {
        rowY(for: selection)
    }

    private var hoveredY: CGFloat? {
        guard let hoveredID, hoveredID != selection else { return nil }
        return rowY(for: hoveredID)
    }

    private var hoveredLabelY: CGFloat? {
        rowY(for: hoveredID)
    }

    private var hoveredItem: HudSidebarItem<Selection>? {
        guard let hoveredID else { return nil }
        for entry in entries {
            if case .item(let item) = entry, item.id == hoveredID {
                return item
            }
        }
        return nil
    }

    private func updateHover(_ id: Selection, hovering: Bool) {
        if hovering {
            if hoveredID != id { hoveredID = id }
        } else if hoveredID == id {
            hoveredID = nil
        }
    }

    private func rowY(for id: Selection?) -> CGFloat? {
        guard let id else { return nil }
        // `EmptyView` header slots collapse out of the VStack entirely. Keep the
        // selection/hover geometry on the same contract as the rendered columns;
        // otherwise an app that moves its branding into a shared top bar gets a
        // phantom 64pt header and every indicator lands several rows too low.
        var y = headerExtent
        for entry in entries {
            switch entry {
            case .item(let item):
                if item.id == id { return y }
                y += HudSidebarLayout.rowHeight
            case .section(_, let title):
                y += Self.sectionExtent(title)
            }
        }
        return nil
    }

    /// An untitled section is a plain gap of one row, so groups stay on the row grid.
    static func sectionExtent(_ title: String) -> CGFloat {
        title.isEmpty
            ? HudSidebarLayout.rowHeight
            : HudSidebarLayout.sectionTopGap + HudSidebarLayout.sectionHeaderHeight
    }

    private var headerExtent: CGFloat {
        guard RailHeader.self != EmptyView.self || LabelHeader.self != EmptyView.self else {
            return 0
        }
        return HudSidebarLayout.headerTopPadding
             + HudSidebarLayout.headerHeight
             + HudSidebarLayout.headerBottomPadding
    }

    /// Full-row hover treatment from the Talkie sidebar. It sits below
    /// selection, teleports between rows, and keeps hover feedback continuous
    /// as the pointer crosses between rail and label columns.
    @ViewBuilder
    private var hoverUnderlay: some View {
        if let y = hoveredY, style.hover == .flat {
            Rectangle()
                .fill(HudSurface.tint(theme.palette.ink, opacity: 0.05))
                .frame(height: HudSidebarLayout.rowHeight)
                .offset(y: y)
                .animation(nil, value: hoveredY)
                .allowsHitTesting(false)
                .transition(.opacity.animation(.easeOut(duration: 0.06)))
        } else if let y = hoveredY {
            RoundedRectangle(cornerRadius: HudSidebarLayout.selectionCornerRadius)
                .fill(theme.palette.surface)
                .overlay(
                    RoundedRectangle(cornerRadius: HudSidebarLayout.selectionCornerRadius)
                        .strokeBorder(theme.hairline.subtle, lineWidth: HudStrokeWidth.thin)
                )
                .frame(height: HudSidebarLayout.rowHeight - HudSidebarLayout.selectionVerticalInset * 2)
                .padding(.horizontal, HudSidebarLayout.selectionHorizontalInset)
                .padding(.vertical, HudSidebarLayout.selectionVerticalInset)
                .offset(y: y)
                .animation(nil, value: hoveredY)
                .allowsHitTesting(false)
                .transition(.opacity.animation(.easeOut(duration: 0.06)))
        }
    }

    /// Talkie-style hover label for compact/narrow sidebar states.
    ///
    /// This is an overlay, not a ZStack child, so the pill can float past the
    /// rail edge without changing the sidebar's measured width.
    @ViewBuilder
    private var compactHoverLabel: some View {
        if let item = hoveredItem,
           let y = hoveredLabelY,
           compactHoverLabelReveal > 0 {
            HudSidebarCompactHoverLabel(
                title: item.tooltipLabel ?? item.title,
                style: style
            )
            .opacity(compactHoverLabelReveal)
            .scaleEffect(
                reduceMotion ? 1 : CGFloat(0.97 + compactHoverLabelReveal * 0.03),
                anchor: .leading
            )
            .offset(
                x: HudSidebarLayout.railContentInset + HudSidebarLayout.railWidth
                    + visibleLabelWidth + HudSpacing.xs,
                y: y + (HudSidebarLayout.rowHeight - HudSidebarCompactHoverLabel.height) / 2
            )
            .allowsHitTesting(false)
            .zIndex(10)
            .transition(
                .asymmetric(
                    insertion: .opacity.combined(with: .scale(scale: 0.97, anchor: .leading)),
                    removal: .opacity
                )
            )
            .animation(
                HudMotion.ifAllowed(.easeOut(duration: 0.08), reduceMotion: reduceMotion),
                value: hoveredID
            )
            .animation(
                HudMotion.ifAllowed(.easeOut(duration: 0.08), reduceMotion: reduceMotion),
                value: compactHoverLabelReveal
            )
        }
    }

    // MARK: Selection with instrumentation

    private func selectItem(_ item: HudSidebarItem<Selection>) {
        let metadata = selectionMetadata(for: item)
        HudInstrumentation.ui.event("Sidebar.select", metadata: metadata)
        HudInstrumentation.ui.span("Sidebar.select.apply", metadata: metadata) {
            selection = item.id
        }
    }

    private func selectionMetadata(for item: HudSidebarItem<Selection>) -> [String: String] {
        [
            "changed":    "\(selection != item.id)",
            "compact":    "\(progress > 0.5)",
            "itemCount":  "\(entries.count)",
            "progress":   String(format: "%.2f", progress),
        ]
    }
}

// MARK: - Convenience init (no footer)

extension HudNavigationSidebar where Footer == EmptyView {
    public init(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        progress: Double,
        accent: Color? = nil,
        labelWidth: CGFloat = HudSidebarLayout.labelWidth,
        onHeaderTap: (() -> Void)? = nil,
        @ViewBuilder railHeader: () -> RailHeader,
        @ViewBuilder labelHeader: () -> LabelHeader
    ) {
        self.init(
            selection: selection,
            entries: entries,
            progress: progress,
            accent: accent,
            labelWidth: labelWidth,
            onHeaderTap: onHeaderTap,
            railHeader: railHeader,
            labelHeader: labelHeader,
            footer: { EmptyView() }
        )
    }

    public init<Tabs: View>(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        progress: Double,
        variant: HudNavigationSidebarVariant = .verticalTabs,
        accent: Color? = nil,
        labelWidth: CGFloat = HudSidebarLayout.labelWidth,
        onHeaderTap: (() -> Void)? = nil,
        @ViewBuilder railHeader: () -> RailHeader,
        @ViewBuilder labelHeader: () -> LabelHeader,
        @ViewBuilder verticalTabs: () -> Tabs
    ) {
        self.init(
            selection: selection,
            entries: entries,
            progress: progress,
            variant: variant,
            accent: accent,
            labelWidth: labelWidth,
            onHeaderTap: onHeaderTap,
            railHeader: railHeader,
            labelHeader: labelHeader,
            verticalTabs: verticalTabs,
            footer: { EmptyView() }
        )
    }
}

// MARK: - isCompact convenience initializers

extension HudNavigationSidebar {
    /// Convenience init taking `isCompact: Bool`. `false` = expanded (progress 0),
    /// `true` = compact (progress 1).
    public init(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        isCompact: Bool,
        accent: Color? = nil,
        labelWidth: CGFloat = HudSidebarLayout.labelWidth,
        onHeaderTap: (() -> Void)? = nil,
        @ViewBuilder railHeader: () -> RailHeader,
        @ViewBuilder labelHeader: () -> LabelHeader,
        @ViewBuilder footer: () -> Footer
    ) {
        self.init(
            selection: selection,
            entries: entries,
            progress: isCompact ? 1.0 : 0.0,
            accent: accent,
            labelWidth: labelWidth,
            onHeaderTap: onHeaderTap,
            railHeader: railHeader,
            labelHeader: labelHeader,
            footer: footer
        )
    }

    public init<Tabs: View>(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        isCompact: Bool,
        variant: HudNavigationSidebarVariant = .verticalTabs,
        accent: Color? = nil,
        labelWidth: CGFloat = HudSidebarLayout.labelWidth,
        onHeaderTap: (() -> Void)? = nil,
        @ViewBuilder railHeader: () -> RailHeader,
        @ViewBuilder labelHeader: () -> LabelHeader,
        @ViewBuilder verticalTabs: () -> Tabs,
        @ViewBuilder footer: () -> Footer
    ) {
        self.init(
            selection: selection,
            entries: entries,
            progress: isCompact ? 1.0 : 0.0,
            variant: variant,
            accent: accent,
            labelWidth: labelWidth,
            onHeaderTap: onHeaderTap,
            railHeader: railHeader,
            labelHeader: labelHeader,
            verticalTabs: verticalTabs,
            footer: footer
        )
    }
}

extension HudNavigationSidebar where Footer == EmptyView {
    /// `isCompact: Bool` convenience init with no footer slot.
    public init(
        selection: Binding<Selection?>,
        entries: [HudSidebarEntry<Selection>],
        isCompact: Bool,
        accent: Color? = nil,
        labelWidth: CGFloat = HudSidebarLayout.labelWidth,
        onHeaderTap: (() -> Void)? = nil,
        @ViewBuilder railHeader: () -> RailHeader,
        @ViewBuilder labelHeader: () -> LabelHeader
    ) {
        self.init(
            selection: selection,
            entries: entries,
            isCompact: isCompact,
            accent: accent,
            labelWidth: labelWidth,
            onHeaderTap: onHeaderTap,
            railHeader: railHeader,
            labelHeader: labelHeader,
            footer: { EmptyView() }
        )
    }
}

// MARK: - Compact hover label

private struct HudSidebarCompactHoverLabel: View {
    static let height: CGFloat = HudLayout.rowHeightCompact - HudSpacing.xxs

    let title: String
    let style: HudSidebarStyle
    @Environment(\.hudTheme) private var theme

    private var surfaceFill: Color {
        switch style.surface {
        case .glass, .liquidGlass:
            return theme.palette.chrome
        case .base, .editorial:
            return theme.palette.surface
        }
    }

    private var strokeColor: Color {
        switch style.surface {
        case .glass, .liquidGlass:
            return theme.hairline.standard
        case .base, .editorial:
            return theme.hairline.subtle
        }
    }

    var body: some View {
        HStack(spacing: 0) {
            HudSidebarCompactHoverArrow()
                .fill(surfaceFill)
                .frame(width: HudSpacing.sm, height: HudSpacing.lg)

            Text(title)
                .font(HudFont.ui(HudTextSize.xs, weight: .medium))
                .foregroundStyle(theme.palette.ink)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, HudSpacing.xl)
                .frame(height: Self.height)
                .background(
                    RoundedRectangle(cornerRadius: HudRadius.standard, style: .continuous)
                        .fill(surfaceFill)
                        // hudlint:disable next-line palette,opacity
                        .shadow(color: Color.black.opacity(0.12), radius: 10, x: 3, y: 4)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: HudRadius.standard, style: .continuous)
                        .strokeBorder(strokeColor, lineWidth: HudStrokeWidth.thin)
                )
        }
        .fixedSize()
    }
}

private struct HudSidebarCompactHoverArrow: Shape {
    func path(in rect: CGRect) -> Path {
        Path { path in
            path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
            path.addLine(to: CGPoint(x: rect.minX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
            path.closeSubpath()
        }
    }
}

// MARK: - Surface background

/// Background plane for the sidebar. Mirrors the donor's per-style logic
/// but uses `HudPalette.chrome` as the base surface so it stays
/// consistent with the rail and inspector.
private struct SidebarSurface: View {
    let style: HudSidebarSurfaceStyle
    @Environment(\.hudTheme) private var theme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        switch style {
        case .base:
            // Subtle top-to-bottom gradient over chrome so the sidebar reads
            // slightly brighter near the window title bar. Two calibrated stops.
            ZStack {
                theme.palette.chrome
                LinearGradient(
                    // hudlint:disable next-line palette,opacity
                    colors: [Color.white.opacity(0.045), Color.white.opacity(0.020)],
                    startPoint: .top, endPoint: .bottom
                )
            }
            .allowsHitTesting(false)

        case .glass:
            if reduceTransparency {
                theme.palette.chrome
                    .allowsHitTesting(false)
            } else {
                ZStack {
                    #if os(macOS)
                    HudVisualEffectView(
                        material: .sidebar,
                        blendingMode: .behindWindow,
                        state: .active,
                        isEmphasized: true
                    )
                    #else
                    Rectangle().fill(.ultraThinMaterial)
                    #endif
                    theme.palette.chrome.opacity(HudOpacity.muted)
                    LinearGradient(
                        // hudlint:disable next-line palette,opacity
                        colors: [Color.white.opacity(0.040), Color.white.opacity(0.018), Color.black.opacity(0.060)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }

        case .editorial:
            // Flat, slightly lighter than chrome — "print" surface.
            theme.palette.surface
                .allowsHitTesting(false)

        case .liquidGlass:
            // Rendered directly in HudNavigationSidebar.body so the inset/round
            // floating treatment can size against the outer bounds.
            EmptyView()
        }
    }
}

// MARK: - Trailing separator

/// One-pixel right-edge rule that separates the sidebar from content.
/// Matches `HudHairline.standard` in base/editorial modes; gradient for glass.
private struct SidebarTrailingRule: View {
    let style: HudSidebarSurfaceStyle
    @Environment(\.hudTheme) private var theme

    var body: some View {
        switch style {
        case .glass:
            // Vertical hairline rule with mid-bright glass shimmer.
            LinearGradient(
                // hudlint:disable next-line palette,opacity
                colors: [Color.white.opacity(0.02), Color.white.opacity(0.10), Color.white.opacity(0.02)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(width: HudStrokeWidth.thin)

        case .base, .editorial:
            Rectangle()
                .fill(theme.hairline.standard)
                .frame(width: HudStrokeWidth.thin)

        case .liquidGlass:
            // No trailing rule — the rounded floating surface defines its own edge.
            EmptyView()
        }
    }
}

// MARK: - Expanded selection underlay

/// Accent-tinted fill drawn behind the selected row in expanded mode.
/// Fades out as progress → 1 (compact). The compact-mode accent bar takes
/// over when fully compact.
private struct SidebarSelectionUnderlay: View {
    let style: HudSidebarIndicatorStyle
    let accent: Color

    var body: some View {
        switch style {
        case .base:
            RoundedRectangle(cornerRadius: HudSidebarLayout.selectionCornerRadius)
                .fill(HudSurface.tintFill(accent))
                .frame(height: HudSidebarLayout.rowHeight - HudSidebarLayout.selectionVerticalInset * 2)
                .padding(.horizontal, HudSidebarLayout.selectionHorizontalInset)
                .padding(.vertical, HudSidebarLayout.selectionVerticalInset)

        case .glass:
            // Glass selection underlay: a soft blurred halo plus a sharp tinted
            // gradient with a hairline border. Tints calibrated to the glass surface.
            ZStack {
                RoundedRectangle(cornerRadius: HudSidebarLayout.selectionCornerRadius + 2)
                    .fill(HudSurface.tintAccent(accent))
                    .blur(radius: 8)
                    .padding(.horizontal, max(0, HudSidebarLayout.selectionHorizontalInset - 2))
                    .padding(.vertical, max(0, HudSidebarLayout.selectionVerticalInset - 1))

                RoundedRectangle(cornerRadius: HudSidebarLayout.selectionCornerRadius)
                    .fill(
                        LinearGradient(
                            colors: [HudSurface.tintAccent(accent), HudSurface.tintGhost(accent)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: HudSidebarLayout.selectionCornerRadius)
                            .strokeBorder(HudSurface.tintBorder(accent), lineWidth: HudStrokeWidth.thin)
                    )
                    .padding(.horizontal, HudSidebarLayout.selectionHorizontalInset)
                    .padding(.vertical, HudSidebarLayout.selectionVerticalInset)
            }
            .frame(height: HudSidebarLayout.rowHeight)

        case .editorial:
            // 2pt leading stripe — same shape visible in both expanded and compact modes
            // so the indicator is continuous through the transition.
            HStack(spacing: 0) {
                Rectangle()
                    .fill(accent)
                    .frame(width: HudStrokeWidth.bold)
                    .padding(.vertical, HudSpacing.xs)
                Spacer(minLength: 0)
            }
            .frame(height: HudSidebarLayout.rowHeight)

        case .kinetic:
            // Slightly more vivid fill; the kinetic feel comes from the spring
            // configured in HudSidebarMotionStyle.kinetic.
            RoundedRectangle(cornerRadius: HudSidebarLayout.selectionCornerRadius)
                .fill(HudSurface.tintAccent(accent))
                .frame(height: HudSidebarLayout.rowHeight - HudSidebarLayout.selectionVerticalInset * 2)
                .padding(.horizontal, HudSidebarLayout.selectionHorizontalInset)
                .padding(.vertical, HudSidebarLayout.selectionVerticalInset)
        }
    }
}

// MARK: - Compact accent bar

/// Bottom accent indicator for compact (icon-only) mode.
/// Positioned by the parent via `offset(y:)` so it slides between rows.
private struct SidebarCompactAccent: View {
    let style: HudSidebarIndicatorStyle
    let accent: Color

    var body: some View {
        switch style {
        case .base, .kinetic:
            // Centered bottom bar under the icon.
            RoundedRectangle(cornerRadius: HudStrokeWidth.standard)
                .fill(accent)
                .frame(
                    width: HudSidebarLayout.compactAccentBarWidth,
                    height: HudSidebarLayout.compactAccentBarHeight
                )
                .frame(width: HudSidebarLayout.railWidth, alignment: .center)
                .frame(height: HudSidebarLayout.rowHeight, alignment: .bottom)
                // Follows the glyph, which sits in from the edge.
                .padding(.leading, HudSidebarLayout.railContentInset)

        case .glass:
            // Glowing vertical rod at the leading edge — soft halo (blurred capsule)
            // beneath a crisper inner capsule with a top-to-bottom gradient. Sizes
            // and opacities calibrated together for the floating glow effect.
            ZStack {
                Capsule()
                    // hudlint:disable next-line opacity
                    .fill(accent.opacity(0.55))
                    // hudlint:disable next-line geometry
                    .frame(width: 6, height: 18)
                    .blur(radius: 4)
                Capsule()
                    .fill(
                        LinearGradient(
                            // hudlint:disable next-line opacity
                            colors: [accent.opacity(0.95), accent.opacity(0.65)],
                            startPoint: .top, endPoint: .bottom
                        )
                    )
                    // hudlint:disable next-line geometry
                    .frame(width: 2, height: 16)
            }
            .frame(width: HudSidebarLayout.railWidth, alignment: .leading)
            .frame(height: HudSidebarLayout.rowHeight, alignment: .center)
            .padding(.leading, HudSpacing.xxs)

        case .editorial:
            // Leading 2pt stripe — same shape as the expanded underlay for
            // visual continuity through the transition.
            HStack(spacing: 0) {
                Rectangle()
                    .fill(accent)
                    .frame(width: HudStrokeWidth.bold)
                    .padding(.vertical, HudSpacing.xs)
                Spacer(minLength: 0)
            }
            .frame(width: HudSidebarLayout.railWidth, height: HudSidebarLayout.rowHeight)
        }
    }
}
