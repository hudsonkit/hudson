import CoreGraphics
import SwiftUI
import Observation

/// Spacing scale — synthesized from the values that recur across Lattices'
/// `LatsDesignSystem` and Hudson's web chrome. Lattices uses inline literals
/// (`spacing: 4`, `12`, `14`, `28`); these constants give native callers the
/// same vocabulary and let consumers override per-app via HudAppManifest.
public enum HudSpacing {
    public static var xxs: CGFloat { 2 }
    public static var xs:  CGFloat { 4 }
    public static var sm:  CGFloat { 6 }
    public static var md:  CGFloat { 8 }
    public static var lg:  CGFloat { 10 }
    public static var xl:  CGFloat { 12 }
    public static var xxl: CGFloat { 14 }
    public static var xxxl: CGFloat { 20 }
    public static var huge: CGFloat { 28 }
}

// MARK: - Radius

/// Corner-radius scale matching the `--hud-radius` web default and Lattices'
/// 3/6/8 hierarchy: `tight` for badges, `standard` for inset rows and small
/// controls, `card` for surface containers.
/// Web template identifiers are retained so hosts can persist one shared choice.
public enum HudCornerTemplate: String, CaseIterable, Sendable {
    case rounded = "hudson"
    case nearSquare = "editorial"
    case square = "drafting"
}

/// SwiftUI tracks reads of the tokens in view bodies, including existing open
/// windows. Hosts change the template on the UI thread; no view identity reset.
@Observable
private final class HudCornerState: @unchecked Sendable {
    var template: HudCornerTemplate = .rounded
}

public enum HudRadius {
    private static let state = HudCornerState()

    public static var template: HudCornerTemplate {
        get { state.template }
        set { state.template = newValue }
    }
    public static var tight: CGFloat {
        switch template { case .rounded: 3; case .nearSquare: 2; case .square: 0 }
    }
    public static var standard: CGFloat {
        switch template { case .rounded: 6; case .nearSquare: 2; case .square: 0 }
    }
    public static var card: CGFloat {
        switch template { case .rounded: 8; case .nearSquare: 2; case .square: 0 }
    }
}

// MARK: - Layout

/// Chrome dimensions ported from `SHELL_THEME.layout` in
/// `packages/web/hudsonkit/src/lib/theme.ts`. Native shells (HudsonShell) read
/// from this so iOS/iPadOS chrome stays dimensionally consistent with the web
/// shell where it makes sense.
public enum HudLayout {
    public static var navHeight:        CGFloat { 48 }
    public static var panelWidth:       CGFloat { 280 }
    public static var panelTopOffset:   CGFloat { 48 }
    public static var statusBarHeight:  CGFloat { 28 }
    public static var panelBottomOffset: CGFloat { 28 }

    // Control row heights — used by HudField, HudButton, HudSettings rows.
    public static var buttonHeight:     CGFloat { 32 }
    public static var fieldHeight:      CGFloat { 36 }
    public static var rowHeightCompact: CGFloat { 28 }
    public static var rowHeightRegular: CGFloat { 44 }

    // Common content widths — page caps for legibility, modal widths.
    public static var readableWidth:    CGFloat { 720 }
    public static var dialogWidth:      CGFloat { 560 }
    public static var popoverWidth:     CGFloat { 380 }
    public static var popoverWidthCompact: CGFloat { 340 }
    public static var cliffWidth:       CGFloat { 760 }

    // Primitive defaults — sizes for self-sized primitives (QR codes, avatars, etc).
    public static var qrCodeDefault:    CGFloat { 200 }
    public static var qrViewfinderSize: CGFloat { 250 }
    public static var textDocumentPreviewHeight: CGFloat { 360 }
    public static var textDocumentModeButtonHeight: CGFloat { 24 }
    public static var textDocumentLineNumberWidth: CGFloat { 36 }
    public static var markdownTableCellWidth: CGFloat { 150 }
    public static var composerAccessoryButtonSize: CGFloat { 26 }
    public static var settingsPickerWidth: CGFloat { 148 }
}

// MARK: - Deprecated Hudson* aliases

@available(*, deprecated, renamed: "HudSpacing")
public typealias HudsonSpacing = HudSpacing
@available(*, deprecated, renamed: "HudRadius")
public typealias HudsonRadius = HudRadius
@available(*, deprecated, renamed: "HudLayout")
public typealias HudsonLayout = HudLayout

// MARK: - Liquid bar geometry

public enum HudLiquidBarMetrics {
    public static var minHeight: CGFloat { 56 }
    public static var itemMinHeight: CGFloat { 44 }
    public static var maxWidth: CGFloat { HudLayout.dialogWidth }
    public static var selectionAnimation: Animation { Animation.spring(response: 0.32, dampingFraction: 0.8) }
}
