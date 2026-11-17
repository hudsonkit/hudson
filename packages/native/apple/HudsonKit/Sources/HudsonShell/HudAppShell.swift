import SwiftUI
import HudsonUI

/// Controls which side columns the status bar spans beneath.
///
/// `.fullWidth` preserves the original shell anatomy. `.besideLeading` gives
/// only the leading column the complete window edge. `.betweenSidebars` gives
/// both side columns the complete edge and keeps the status bar in the center.
public enum HudAppShellStatusBarSpan: String, CaseIterable, Identifiable, Sendable {
    case fullWidth
    case besideLeading
    case betweenSidebars

    public var id: String { rawValue }
}

/// How the shell presents its center column against the window.
///
/// `.flush` is the original anatomy: one background fills the window and the
/// columns meet at square seams. `.card` sets the center column into the
/// window as a card: the shell paints its background only inside that column,
/// clips it to a rounded top-leading corner, and draws a hairline along its
/// top and leading edges. Everything outside the card — the titlebar band
/// and the side columns — shows whatever the host puts behind the shell, so
/// a host that extends its sidebar material there gets one L-shaped frame
/// around the stage, and the traffic lights sit on a single surface instead
/// of a seam.
///
/// `.floating` goes one step further: the center column is set in from the
/// window's trailing and bottom edges by `inset` and rounds all four corners
/// with one `radius`, outlined by a hairline all the way round, so the host's
/// frame wraps it on three sides.
///
/// `.floatingEdges` is `.floating` with each corner and each gap set on its
/// own, so a host can nest the stage in the window's corner (stage radius =
/// window radius − gap) and square off a side that meets other chrome, such
/// as an inspector, with no gap. `openEdges` leaves the hairline off the
/// edges whose neighbour draws its own rule, so the seam stays one line.
public enum HudAppShellStage: Equatable, Sendable {
    case flush
    case card(radius: CGFloat)
    /// All four corners rounded, with one thin border around the full stage.
    /// Use `stageInsets` to reveal the host's background around its edges.
    case roundedCard(radius: CGFloat)
    case floating(radius: CGFloat, inset: CGFloat)
    case floatingEdges(corners: HudStageCorners, gaps: EdgeInsets, openEdges: Edge.Set = [])
}

/// One radius per corner of a floating stage.
public struct HudStageCorners: Equatable, Sendable {
    public var topLeading: CGFloat
    public var bottomLeading: CGFloat
    public var bottomTrailing: CGFloat
    public var topTrailing: CGFloat

    public init(topLeading: CGFloat, bottomLeading: CGFloat, bottomTrailing: CGFloat, topTrailing: CGFloat) {
        self.topLeading = topLeading
        self.bottomLeading = bottomLeading
        self.bottomTrailing = bottomTrailing
        self.topTrailing = topTrailing
    }

    /// The same radius at every corner.
    public init(all radius: CGFloat) {
        self.init(topLeading: radius, bottomLeading: radius, bottomTrailing: radius, topTrailing: radius)
    }
}

/// Top-level app chassis for HudsonKit.
///
/// `HudAppShell` composes the chrome of a Hudson app: a leading rail, a
/// trailing inspector, top/bottom drawers, a content surface, and a status bar.
/// Apps own state and render into slots; the shell handles divider lines,
/// background, and responsive collapse. Conceptual counterpart to the web
/// `AppShell` in `packages/web/hudsonkit/src/components/AppShell.tsx`.
///
/// Layout (regular size class):
/// ```
/// +----------------------------------+
/// |             topDrawer            |
/// +--+----------------------+--------+
/// |  |                      |        |
/// |L |       content        |   T    |
/// |  |                      |        |
/// +--+----------------------+--------+
/// |           bottomDrawer           |
/// +----------------------------------+
/// |            statusBar             |
/// +----------------------------------+
/// ```
///
/// With `statusBarSpan: .besideLeading`, the leading column owns the complete
/// window edge and the remaining chrome forms its sibling column:
/// ```
/// +------+---------------------------+
/// |      | topDrawer                 |
/// |      +---------------------------+
/// | lead | content        | trailing |
/// |      +---------------------------+
/// |      | bottomDrawer               |
/// |      +---------------------------+
/// |      | statusBar                  |
/// +------+---------------------------+
/// ```
///
/// With `statusBarSpan: .betweenSidebars`, both side columns own the full
/// height while drawers, content, and status form the center column:
/// ```
/// +------+----------------------+----------+
/// |      | topDrawer            |          |
/// |      +----------------------|          |
/// | lead | content              | trailing |
/// |      +----------------------|          |
/// |      | bottomDrawer         |          |
/// |      +----------------------|          |
/// |      | statusBar            |          |
/// +------+----------------------+----------+
/// ```
///
/// In compact size class the trailing slot is hidden by the shell; the leading
/// slot is rendered as-is and the rail itself decides whether to collapse to a
/// hamburger.
public struct HudAppShell<
    Leading: View,
    Trailing: View,
    TopDrawer: View,
    BottomDrawer: View,
    Content: View,
    StatusBar: View
>: View {
    private let statusBarSpan: HudAppShellStatusBarSpan
    private let stage: HudAppShellStage
    private let stageInsets: EdgeInsets
    private let leading: Leading
    private let trailing: Trailing
    private let topDrawer: TopDrawer
    private let bottomDrawer: BottomDrawer
    private let content: Content
    private let statusBar: StatusBar

    @Environment(\.hudTheme) private var theme

    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif

    public init(
        statusBarSpan: HudAppShellStatusBarSpan = .fullWidth,
        stage: HudAppShellStage = .flush,
        stageInsets: EdgeInsets = EdgeInsets(),
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder topDrawer: () -> TopDrawer,
        @ViewBuilder bottomDrawer: () -> BottomDrawer,
        @ViewBuilder content: () -> Content,
        @ViewBuilder statusBar: () -> StatusBar
    ) {
        self.statusBarSpan = statusBarSpan
        self.stage = stage
        self.stageInsets = stageInsets
        self.leading = leading()
        self.trailing = trailing()
        self.topDrawer = topDrawer()
        self.bottomDrawer = bottomDrawer()
        self.content = content()
        self.statusBar = statusBar()
    }

    public var body: some View {
        ZStack {
            if stage == .flush {
                theme.palette.bg.ignoresSafeArea()
            }
            shellContent
        }
    }

    @ViewBuilder
    private var shellContent: some View {
        switch statusBarSpan {
        case .fullWidth:
            VStack(spacing: 0) {
                topDrawer
                HStack(spacing: 0) {
                    leading
                    mainContentRow
                        .modifier(HudAppShellStageSurface(stage: stage))
                        .padding(stageInsets)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                bottomDrawer
                statusBarRegion
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .besideLeading:
            HStack(spacing: 0) {
                leading
                    .frame(maxHeight: .infinity)
                VStack(spacing: 0) {
                    topDrawer
                    mainContentRow
                    bottomDrawer
                    statusBarRegion
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .modifier(HudAppShellStageSurface(stage: stage))
                .padding(stageInsets)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

        case .betweenSidebars:
            HStack(spacing: 0) {
                leading
                    .frame(maxHeight: .infinity, alignment: .top)
                VStack(spacing: 0) {
                    topDrawer
                    content
                        .frame(
                            maxWidth: .infinity,
                            maxHeight: .infinity,
                            alignment: .topLeading
                        )
                    bottomDrawer
                    statusBarRegion
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .modifier(HudAppShellStageSurface(stage: stage))
                .padding(stageInsets)
                if !isCompact {
                    trailing
                        .frame(maxHeight: .infinity, alignment: .top)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private var mainContentRow: some View {
        HStack(spacing: 0) {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            if !isCompact {
                trailing
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var statusBarRegion: some View {
        VStack(spacing: 0) {
            HudDivider(color: theme.hairline.subtle)
            statusBar
        }
    }

    private var isCompact: Bool {
        #if os(iOS)
        return sizeClass == .compact
        #else
        return false
        #endif
    }
}

// MARK: - Convenience inits

extension HudAppShell where TopDrawer == EmptyView, BottomDrawer == EmptyView {
    /// Shell without top/bottom drawer slots — the common case for M3a.
    public init(
        statusBarSpan: HudAppShellStatusBarSpan = .fullWidth,
        stage: HudAppShellStage = .flush,
        stageInsets: EdgeInsets = EdgeInsets(),
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content,
        @ViewBuilder statusBar: () -> StatusBar
    ) {
        self.init(
            statusBarSpan: statusBarSpan,
            stage: stage,
            stageInsets: stageInsets,
            leading: leading,
            trailing: trailing,
            topDrawer: { EmptyView() },
            bottomDrawer: { EmptyView() },
            content: content,
            statusBar: statusBar
        )
    }
}

extension HudAppShell where Leading == EmptyView, Trailing == EmptyView, TopDrawer == EmptyView, BottomDrawer == EmptyView, StatusBar == EmptyView {
    /// Bare shell — content only. Useful for previews and apps that have no
    /// chrome (takeover flows, single-purpose surfaces).
    public init(@ViewBuilder content: () -> Content) {
        self.init(
            leading: { EmptyView() },
            trailing: { EmptyView() },
            topDrawer: { EmptyView() },
            bottomDrawer: { EmptyView() },
            content: content,
            statusBar: { EmptyView() }
        )
    }
}

// MARK: - Stage surface

/// Paints and clips the center column for the card styles; a no-op
/// for `.flush`, where the shell's full-window background already sits behind.
private struct HudAppShellStageSurface: ViewModifier {
    let stage: HudAppShellStage
    @Environment(\.hudTheme) private var theme

    func body(content: Content) -> some View {
        switch stage {
        case .flush:
            content
        case .card(let radius):
            content
                .background(theme.palette.bg)
                .clipShape(UnevenRoundedRectangle(topLeadingRadius: radius, style: .circular))
                .overlay {
                    HudStageCardEdge(radius: radius)
                        .stroke(theme.hairline.subtle, lineWidth: HudStrokeWidth.standard)
                        .allowsHitTesting(false)
                }
        case .roundedCard(let radius):
            let shape = RoundedRectangle(cornerRadius: radius, style: .circular)
            content
                .background(theme.palette.bg)
                .clipShape(shape)
                .overlay {
                    shape
                        .strokeBorder(theme.hairline.subtle, lineWidth: HudStrokeWidth.thin)
                        .allowsHitTesting(false)
                }
        case .floating(let radius, let inset):
            content
                .background(theme.palette.bg)
                .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(theme.hairline.subtle, lineWidth: HudStrokeWidth.standard)
                        .allowsHitTesting(false)
                }
                .padding(.trailing, inset)
                .padding(.bottom, inset)
        case .floatingEdges(let corners, let gaps, let openEdges):
            let shape = UnevenRoundedRectangle(
                topLeadingRadius: corners.topLeading,
                bottomLeadingRadius: corners.bottomLeading,
                bottomTrailingRadius: corners.bottomTrailing,
                topTrailingRadius: corners.topTrailing,
                style: .continuous
            )
            // An open edge's stroke is pushed one line width outside the stage
            // and clipped away; the strokes along the other edges still run to it.
            let line = HudStrokeWidth.standard
            let outset = EdgeInsets(
                top: openEdges.contains(.top) ? -line : 0,
                leading: openEdges.contains(.leading) ? -line : 0,
                bottom: openEdges.contains(.bottom) ? -line : 0,
                trailing: openEdges.contains(.trailing) ? -line : 0
            )
            content
                .background(theme.palette.bg)
                .clipShape(shape)
                .overlay {
                    shape
                        .strokeBorder(theme.hairline.subtle, lineWidth: line)
                        .padding(outset)
                        .allowsHitTesting(false)
                }
                .clipped()
                .padding(gaps)
        }
    }
}

/// The card's top and leading edges with the rounded corner between them.
/// The trailing and bottom edges meet other chrome (the inspector, the window
/// edge) and carry no line of their own. Inset half a stroke so the 1pt line
/// lands inside the clip.
private struct HudStageCardEdge: Shape {
    let radius: CGFloat

    func path(in rect: CGRect) -> Path {
        let r = rect.insetBy(dx: HudStrokeWidth.standard / 2, dy: HudStrokeWidth.standard / 2)
        let radius = min(radius, r.width / 2, r.height / 2)
        var path = Path()
        path.move(to: CGPoint(x: r.minX, y: r.maxY))
        path.addLine(to: CGPoint(x: r.minX, y: r.minY + radius))
        path.addArc(
            tangent1End: CGPoint(x: r.minX, y: r.minY),
            tangent2End: CGPoint(x: r.minX + radius, y: r.minY),
            radius: radius
        )
        path.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        return path
    }
}

// MARK: - Internal divider

/// Vertical hairline used between shell columns. Kept private to the shell so
/// the rule treatment stays consistent across leading/trailing transitions.
private struct HudShellVRule: View {
    @Environment(\.hudTheme) private var theme

    var body: some View {
        Rectangle()
            .fill(theme.hairline.subtle)
            .frame(width: HudStrokeWidth.thin)
            .frame(maxHeight: .infinity)
    }
}
