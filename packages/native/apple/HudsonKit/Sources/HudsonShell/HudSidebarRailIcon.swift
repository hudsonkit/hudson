import SwiftUI
import HudsonUI

// MARK: - HudSidebarRailIcon
//
// One icon cell for the fixed rail column of `HudNavigationSidebar`.
//
// Hover/focus/selection states honor `@Environment(\.accessibilityReduceMotion)`.
// Full-row hover, compact selection, and compact hover labels are rendered by
// `HudNavigationSidebar` so rail and label columns stay visually connected.
//
// Public so callers composing custom rail rows (groupings, badges, drag
// affordances) can build on the same hover/focus/selection visuals without
// re-implementing them. The standard `HudNavigationSidebar` uses this directly.

public struct HudSidebarRailIcon<Selection: Hashable>: View {
    public let item: HudSidebarItem<Selection>
    public let isSelected: Bool
    public let accent: Color
    public let progress: Double
    public let compactBarOpacity: Double
    public let style: HudSidebarStyle
    public let reduceMotion: Bool
    public let onTap: () -> Void
    public let onHoverChange: (Bool) -> Void

    @State private var isHovering = false
    @State private var isPressing = false
    @FocusState private var isFocused: Bool
    @Environment(\.hudTheme) private var theme

    public init(
        item: HudSidebarItem<Selection>,
        isSelected: Bool,
        accent: Color,
        progress: Double,
        compactBarOpacity: Double,
        style: HudSidebarStyle,
        reduceMotion: Bool,
        onTap: @escaping () -> Void,
        onHoverChange: @escaping (Bool) -> Void = { _ in }
    ) {
        self.item = item
        self.isSelected = isSelected
        self.accent = accent
        self.progress = progress
        self.compactBarOpacity = compactBarOpacity
        self.style = style
        self.reduceMotion = reduceMotion
        self.onTap = onTap
        self.onHoverChange = onHoverChange
    }

    private var glyphName: String {
        if isSelected, let s = item.selectedIcon { return s }
        return item.icon
    }

    private var iconColor: Color {
        if isSelected  { return accent }
        if isHovering  { return theme.palette.ink }
        return theme.palette.muted
    }

    private var iconScale: CGFloat {
        isPressing ? 0.92 : 1.0
    }

    private var hoverAnimation: Animation {
        switch style.icon {
        case .kinetic:   return .spring(response: 0.28, dampingFraction: 0.72)
        case .glass:     return .spring(response: 0.22, dampingFraction: 0.85)
        case .editorial: return .easeInOut(duration: 0.16)
        case .base:      return .easeOut(duration: 0.12)
        }
    }

    private var showsFocusRing: Bool {
        guard isFocused else { return false }
        // The selected item already reads as active via its accent glyph and
        // selection surround, so a focus ring there is redundant noise. Keep the
        // ring only for keyboard focus on *unselected* rows (an a11y affordance).
        return !isSelected
    }

    public var body: some View {
        Image(systemName: glyphName)
            .font(.system(size: HudSidebarLayout.iconSize, weight: .light))
            .foregroundStyle(iconColor)
            .frame(width: HudSidebarLayout.railWidth, height: HudSidebarLayout.rowHeight)
            .scaleEffect(iconScale)
            .animation(reduceMotion ? nil : hoverAnimation, value: isHovering)
            .animation(
                reduceMotion ? nil : .spring(response: 0.20, dampingFraction: 0.65),
                value: isPressing
            )
            .overlay(
                RoundedRectangle(cornerRadius: HudRadius.standard)
                    .stroke(showsFocusRing ? theme.focus.ring : Color.clear, lineWidth: theme.focus.ringWidth)
            )
            .contentShape(Rectangle())
            .onTapGesture { onTap() }
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { _ in isPressing = true }
                    .onEnded   { _ in isPressing = false }
            )
            .focusable(true)
            .focused($isFocused)
            .onAppear {
                // AppKit will hand first-responder to the first focusable rail
                // icon. Drop that so a non-rail page (Settings, Docs) does not
                // open with a leftover ring on Home.
                if !isSelected { isFocused = false }
            }
            .onChange(of: isSelected) { _, selected in
                if !selected { isFocused = false }
            }
            .onHover { setHovering($0) }
            .onContinuousHover { phase in
                switch phase {
                case .active: setHovering(true)
                case .ended:  setHovering(false)
                }
            }
            .accessibilityLabel(item.tooltipLabel ?? item.title)
            .accessibilityValue(isSelected ? "Selected" : "Not selected")
            // The tap gesture alone leaves the row an inert image to VoiceOver
            // and AX clients; the button trait and default action make it
            // pressable (AXPress), and Return/Space select it from the keyboard.
            .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
            .accessibilityAction { onTap() }
            .onKeyPress(.return) { onTap(); return .handled }
            .onKeyPress(.space) { onTap(); return .handled }
    }

    private func setHovering(_ hovering: Bool) {
        guard isHovering != hovering else { return }
        isHovering = hovering
        onHoverChange(hovering)
    }
}
