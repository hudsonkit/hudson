import SwiftUI

// MARK: - Rail inset

private struct HudSidebarRailInsetKey: EnvironmentKey {
    static let defaultValue: CGFloat = HudSidebarLayout.railContentInset
}

extension EnvironmentValues {
    /// Space on each side of the rail glyphs. The compact rail is
    /// `inset + railWidth + inset`, so the glyphs sit centred between the
    /// window edge and the divider. Defaults to `HudSidebarLayout.railContentInset`.
    public var hudsonSidebarRailInset: CGFloat {
        get { self[HudSidebarRailInsetKey.self] }
        set { self[HudSidebarRailInsetKey.self] = newValue }
    }
}

extension View {
    /// Set the rail inset for descendant navigation sidebars.
    public func hudsonSidebarRailInset(_ inset: CGFloat) -> some View {
        environment(\.hudsonSidebarRailInset, max(0, inset))
    }
}
