import CoreGraphics

// MARK: - HudSidebarLayout
//
// Geometry tokens for the two-column sidebar.
//
//   ┌──────────┬───────────────────────┐
//   │ rail     │ label                 │
//   │  32      │   200 → 0  (animates) │
//   └──────────┴───────────────────────┘
//
// Rail: fixed compact column, icons centered. Never animated.
// Label: variable-width column. Width animates from labelWidth → 0 via
//   `progress` (0 = expanded, 1 = compact). Text inside is fixed-size and
//   clipped from the right — icons cannot bounce because their x-position
//   depends on nothing that animates.
//
// All values sit on the 8pt grid via HudSpacing.

public enum HudSidebarLayout {

    // ── Columns ──────────────────────────────────────────────────────────────

    /// Fixed compact column at the leading edge. Icons center on x = railWidth/2.
    /// This is the minimized sidebar width; expansion only adds label width to
    /// the trailing side, so icon x-positions never move between states.
    public static var railWidth: CGFloat { 32 }

    /// Maximum width of the animated label column when fully expanded.
    public static var labelWidth: CGFloat { 200 }

    /// Optional host-level offset. The compact rail owns its internal padding,
    /// so resizable hosts default to zero extra inset.
    public static var leadingInset: CGFloat { 0 }

    /// Center of the first window control (the close button) from the window's
    /// leading edge, in a standard titled window.
    public static var windowControlCenterX: CGFloat { 26 }

    /// Space between the sidebar's leading edge and the rail glyphs, so they
    /// center under the first window control. Applied to the rows only: the
    /// selection stripe and hover band stay on the edge.
    public static var railContentInset: CGFloat { max(0, windowControlCenterX - railWidth / 2) }

    /// Height of the band that holds the rail's first and last rows, matching a
    /// 30pt page toolbar. Rows sit centered in it at both ends of the sidebar.
    public static var edgeBandHeight: CGFloat { 30 }

    // ── Cells ────────────────────────────────────────────────────────────────

    /// Height of a single nav row.
    public static var rowHeight: CGFloat { 26 }

    /// Height of the section-header label cell.
    public static var sectionHeaderHeight: CGFloat { 28 }

    /// Vertical gap inserted above a section header (breathing room between groups).
    public static var sectionTopGap: CGFloat { 8 }  // HudSpacing.md

    // ── Header ───────────────────────────────────────────────────────────────

    /// Height of the logo / wordmark header row.
    public static var headerHeight: CGFloat { 40 }

    /// Padding above the header — keeps the logo clear of the traffic-light cluster.
    public static var headerTopPadding: CGFloat { 10 }

    /// Padding below the header before the first nav row. Completes the 64pt
    /// first-row rhythm shared by native content and inspector headers.
    public static var headerBottomPadding: CGFloat { 14 }  // HudSpacing.xxl

    /// Offset a header slot to share the center line of an adjacent page header.
    /// `topInset` is the distance from the sidebar's top to the page header's top.
    /// Apply to the complete header control so its hit area moves with its label.
    /// Navigation rows retain their existing positions and compact-mode geometry.
    public static func headerOffset(topInset: CGFloat, pageHeaderHeight: CGFloat) -> CGFloat {
        topInset + pageHeaderHeight / 2 - (headerTopPadding + headerHeight / 2)
    }

    // ── Glyphs ───────────────────────────────────────────────────────────────

    /// SF Symbol point size for row icons.
    public static var iconSize: CGFloat { 14 }

    // ── Label inset ──────────────────────────────────────────────────────────

    /// Horizontal inset between the rail's trailing edge and the label text.
    public static var labelLeading: CGFloat { 0 }  // icon edge sits 9pt from the label

    /// Inset for a section label hung off the column's *trailing* edge.
    ///
    /// Deliberately not `labelLeading`. That 0pt gutter sits between the rail and
    /// the labels beside it — there is a 32pt icon column doing the visual work of
    /// separating them. On the trailing side there is nothing: the label column's
    /// right edge is the sidebar's own edge, so the same 0pt puts the text against
    /// the divider rather than in a margin.
    public static var sectionTrailingInset: CGFloat { 12 }  // HudSpacing.xl

    /// Leading inset for a section label sitting on the sidebar's own edge.
    ///
    /// Lines the text up with the left edge of the rail glyphs rather than with
    /// the label column: `(railWidth - iconSize) / 2` is where an icon starts, and
    /// a group name that starts anywhere else reads as a fourth column.
    public static var sectionRailLeading: CGFloat {
        ((railWidth - iconSize) / 2).rounded()
    }

    // ── Selection underlay ───────────────────────────────────────────────────

    public static var selectionCornerRadius: CGFloat { 6 }      // HudRadius.standard
    public static var selectionHorizontalInset: CGFloat { 4 }   // HudSpacing.xs
    public static var selectionVerticalInset: CGFloat { 2 }     // HudSpacing.xxs

    // ── Compact accent bar ───────────────────────────────────────────────────

    /// Width and height of the bottom accent bar shown in compact (icon-only) mode.
    public static var compactAccentBarWidth: CGFloat { 16 }
    public static var compactAccentBarHeight: CGFloat { 2 }

    // ── Liquid-glass surface ─────────────────────────────────────────────────

    /// Inset applied around the surface when `surface == .liquidGlass`.
    /// Lets the rounded floating shape read against the window background.
    public static var liquidGlassInset: CGFloat { 6 }

    /// Continuous corner radius for the liquid-glass surface.
    public static var liquidGlassCornerRadius: CGFloat { 10 }

    // ── Convenience ──────────────────────────────────────────────────────────

    /// Full expanded width (rail + label columns).
    public static var totalWidth: CGFloat { railWidth + labelWidth }

    /// Intrinsic width at a given progress (0 = expanded, 1 = compact).
    /// The host uses this to size its column slot; only the label column's
    /// width changes — the rail column stays fixed.
    /// Pass an explicit `labelWidth` when the sidebar instance overrides the default
    /// (e.g., user-resizable expanded width persisted via `@AppStorage`).
    public static func intrinsicWidth(progress: Double, labelWidth: CGFloat = HudSidebarLayout.labelWidth) -> CGFloat {
        railContentInset + railWidth + max(0, labelWidth * CGFloat(1 - progress))
    }
}
