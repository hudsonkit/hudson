import SwiftUI

// MARK: - HudSidebarSurfaceStyle

/// Background treatment for the sidebar surface.
/// - `base`: Hudson chrome + subtle gradient (the default house style).
/// - `glass`: SwiftUI `.ultraThinMaterial` approximation.
/// - `editorial`: flat slightly-lighter fill ("print" surface).
/// - `liquidGlass`: real macOS `NSVisualEffectView` with `.sidebar` material,
///   inset from the window edge with continuous-rounded corners — the
///   floating-chrome look that matches stock macOS Tahoe sidebars.
public enum HudSidebarSurfaceStyle: String, CaseIterable, Identifiable, Sendable {
    case base
    case glass
    case editorial
    case liquidGlass

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .base:        return "Base"
        case .glass:       return "Glass"
        case .editorial:   return "Print"
        case .liquidGlass: return "Native"
        }
    }
}

// MARK: - HudSidebarIndicatorStyle

/// Selection indicator shape for nav rows.
public enum HudSidebarIndicatorStyle: String, CaseIterable, Identifiable, Sendable {
    case base
    case glass
    case editorial
    case kinetic

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .base:      return "Base"
        case .glass:     return "Glass"
        case .editorial: return "Stripe"
        case .kinetic:   return "Spring"
        }
    }
}

// MARK: - HudSidebarIconStyle

/// Hover / selection micro-animation treatment for icons.
public enum HudSidebarIconStyle: String, CaseIterable, Identifiable, Sendable {
    case base
    case glass
    case editorial
    case kinetic

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .base:      return "Base"
        case .glass:     return "Bloom"
        case .editorial: return "Quiet"
        case .kinetic:   return "Live"
        }
    }
}

// MARK: - HudSidebarMotionStyle

/// Spring curve for the selection-underlay slide between rows.
public enum HudSidebarMotionStyle: String, CaseIterable, Identifiable, Sendable {
    case base
    case editorial
    case kinetic

    public var id: String { rawValue }

    public var label: String {
        switch self {
        case .base:      return "Base"
        case .editorial: return "Slow"
        case .kinetic:   return "Spring"
        }
    }

    /// Animation used when the selection indicator slides between rows.
    public var selectionSlide: Animation {
        switch self {
        case .base:      return .spring(response: 0.20, dampingFraction: 0.85)
        case .editorial: return .spring(response: 0.30, dampingFraction: 0.92)
        case .kinetic:   return .spring(response: 0.22, dampingFraction: 0.72)
        }
    }
}

// MARK: - HudLiquidGlassConfig

/// Tunable knobs for the `.liquidGlass` surface treatment.
/// Consulted only when `surface == .liquidGlass`; ignored otherwise.
///
/// - `cornerRadius`: continuous-corner radius of the floating surface.
/// - `inset`: margin between the sidebar's outer bounds and the visible glass.
///   Larger values make the chrome float more obviously off the window edges.
/// - `translucency`: opacity applied to the visual-effect material itself.
///   `1.0` (default) keeps the material at its native intensity; lower values
///   fade the glass toward the underlying window background.
/// - `accent`: when non-nil, the rounded surface stroke tints toward this color.
///   `nil` keeps the neutral white hairline (the default native look).
public struct HudLiquidGlassConfig: Equatable, Sendable {
    public var cornerRadius: CGFloat
    public var inset: CGFloat
    public var translucency: Double
    public var accent: Color?

    public init(
        cornerRadius: CGFloat = HudSidebarLayout.liquidGlassCornerRadius,
        inset: CGFloat = HudSidebarLayout.liquidGlassInset,
        translucency: Double = 1.0,
        accent: Color? = nil
    ) {
        self.cornerRadius = cornerRadius
        self.inset = inset
        self.translucency = translucency
        self.accent = accent
    }

    public static var `default`: HudLiquidGlassConfig { HudLiquidGlassConfig() }
}

// MARK: - HudSidebarStyle

/// All four style axes bundled together.
/// Propagated via `\.hudsonSidebarStyle` so the entire sidebar subtree
/// can be restyled with a single `.environment(\.hudsonSidebarStyle, ...)`.
/// Which edge a section's eyebrow label hangs from.
///
/// Leading is the default and what every existing host gets. Trailing suits
/// editorial rails, where the group name reads as a margin note against the
/// column edge rather than as a heading stacked over its rows.
public enum HudSidebarSectionAlignment: String, CaseIterable, Identifiable, Sendable {
    /// On the label column's rule, directly over the rows the group names.
    case leading
    /// Hung off the column's trailing edge.
    case trailing
    /// On the *sidebar's* leading edge, out past the icon rail — so the group
    /// names sit further left than anything they head and read as rules across
    /// the column rather than as another item in it.
    case railLeading

    public var id: String { rawValue }
}

/// Hover treatment for nav rows.
public enum HudSidebarHoverStyle: String, CaseIterable, Identifiable, Sendable {
    /// Inset rounded box with a hairline border.
    case base
    /// Square wash across the full row width, no border.
    case flat

    public var id: String { rawValue }
}

public struct HudSidebarStyle: Equatable, Sendable {
    public var surface: HudSidebarSurfaceStyle
    public var indicator: HudSidebarIndicatorStyle
    public var icon: HudSidebarIconStyle
    public var motion: HudSidebarMotionStyle
    public var liquidGlass: HudLiquidGlassConfig
    public var sectionAlignment: HudSidebarSectionAlignment
    public var hover: HudSidebarHoverStyle

    public init(
        surface: HudSidebarSurfaceStyle = .base,
        indicator: HudSidebarIndicatorStyle = .base,
        icon: HudSidebarIconStyle = .base,
        motion: HudSidebarMotionStyle = .base,
        liquidGlass: HudLiquidGlassConfig = .default,
        sectionAlignment: HudSidebarSectionAlignment = .leading,
        hover: HudSidebarHoverStyle = .base
    ) {
        self.surface = surface
        self.indicator = indicator
        self.icon = icon
        self.motion = motion
        self.liquidGlass = liquidGlass
        self.sectionAlignment = sectionAlignment
        self.hover = hover
    }

    public static var `default`: HudSidebarStyle { HudSidebarStyle() }
}

// MARK: - Environment

private struct HudSidebarStyleKey: EnvironmentKey {
    static let defaultValue: HudSidebarStyle = .default
}

public extension EnvironmentValues {
    var hudsonSidebarStyle: HudSidebarStyle {
        get { self[HudSidebarStyleKey.self] }
        set { self[HudSidebarStyleKey.self] = newValue }
    }
}
