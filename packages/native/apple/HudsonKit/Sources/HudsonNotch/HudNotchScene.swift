#if os(macOS)
import AppKit
import HudsonNotchCore
import SwiftUI

/// Host content for the notch, in place of the activity stage: views on the
/// two wings, and below them a body of whatever height the host asks for.
///
/// A height of 0 is the wings alone. A short body (one line under the
/// notch) is a chin. A taller one opens the notch as far as the content
/// needs. Every size is the same silhouette, so moving between scenes is one
/// continuous morph. Changing `id` cross-fades the body while the shape
/// resizes; the wings stay put, so a mark on them carries across.
///
/// Present one with `HudNotchController.present(_:)`. An activity that asks
/// for attention still opens over the scene, and the scene comes back when
/// that card folds.
///
/// Every scene can be put away by the person, the same way everywhere: a
/// small × on the trailing wing while the pointer is over the notch, a swipe
/// up over it, Escape while it has the keyboard (or anywhere, with
/// `escapeWhileVisible`), or right-click, Dismiss. The shape tucks back into the housing and `onDismiss` hears how. Keep the scene
/// away after that until something new happens: presenting it again on the
/// next state tick brings it straight back. A scene that must stay (a step the
/// person has to finish) sets `dismissible` to false.
///
/// A scene the person should be able to wave off without clicking it first,
/// such as a receipt or a card that asks for a moment, sets
/// `escapeWhileVisible`: Escape in any app puts it away while it shows.
public struct HudNotchScene {
    public struct Size: Hashable, Sendable {
        /// The silhouette's full width, wings included.
        public var width: CGFloat
        /// The body's height below the shell. 0 shows the wings only.
        public var contentHeight: CGFloat
        /// The bottom corners, once there is a body.
        public var bottomRadius: CGFloat

        public init(width: CGFloat, contentHeight: CGFloat = 0, bottomRadius: CGFloat = 14) {
            self.width = width
            self.contentHeight = max(0, contentHeight)
            self.bottomRadius = bottomRadius
        }
    }

    /// An optional full-width row for floating displays. Physical notches keep their wings and body.
    private(set) var islandRow: AnyView?
    private var islandRadius: CGFloat = 0

    public func singleLineIsland<Row: View>(cornerRadius: CGFloat, @ViewBuilder row: () -> Row) -> Self {
        var copy = self
        copy.islandRow = AnyView(row())
        copy.islandRadius = max(0, cornerRadius)
        return copy
    }

    public func size(for style: HudNotchRenderStyle) -> Size {
        guard style == .island, islandRow != nil else { return size }
        return Size(width: size.width, bottomRadius: islandRadius)
    }

    /// Identifies the body. A new id cross-fades it.
    public var id: String
    public var size: Size
    /// How far the wing content sits in from the silhouette's sides.
    public var wingInset: CGFloat
    public var leading: AnyView
    public var trailing: AnyView
    public var content: AnyView
    public var accessibilityLabel: String

    /// A click on the silhouette that no view inside took.
    public var onTap: (@MainActor () -> Void)?
    /// The pointer entering or leaving the notch.
    public var onHover: (@MainActor (Bool) -> Void)?
    /// Key presses while the notch is key (after `focusScene()` or a click
    /// into it). Return true to consume the event.
    public var onKeyDown: (@MainActor (NSEvent) -> Bool)?
    /// Modifier changes while the notch is key. Return true to consume.
    public var onFlagsChanged: (@MainActor (NSEvent) -> Bool)?
    /// The person can put it away. True unless the host says otherwise.
    public var dismissible: Bool
    /// Escape puts the scene away while it is on screen, even when the notch
    /// doesn't have the keyboard. Off by default.
    ///
    /// The notch still never takes key. While such a scene shows, the
    /// controller watches key presses with an `NSEvent` monitor and puts the
    /// scene away (`onDismiss` hears `.escape`) on a bare Escape. The press is
    /// observed, not taken: it also reaches the app in front, which may close
    /// its own dialog or leave full screen with it. Only presses into the
    /// notch itself are consumed, as before.
    ///
    /// Presses in other apps reach the monitor only when the host is trusted
    /// for Accessibility (`AXIsProcessTrusted()`). Without it, Escape still
    /// works in the host's own windows and once the notch has the keyboard.
    /// Ignored when `dismissible` is false.
    public var escapeWhileVisible: Bool
    /// The scene left the notch through `dismissScene(_:)`: by the person
    /// (`byPerson`), or by the host. Not called for `present(nil)` or for a
    /// new scene taking its place.
    public var onDismiss: (@MainActor (HudNotchDismissal) -> Void)?

    public init<Leading: View, Trailing: View, Content: View>(
        id: String,
        size: Size,
        wingInset: CGFloat = 16,
        accessibilityLabel: String = "",
        onTap: (@MainActor () -> Void)? = nil,
        onHover: (@MainActor (Bool) -> Void)? = nil,
        onKeyDown: (@MainActor (NSEvent) -> Bool)? = nil,
        onFlagsChanged: (@MainActor (NSEvent) -> Bool)? = nil,
        dismissible: Bool = true,
        escapeWhileVisible: Bool = false,
        onDismiss: (@MainActor (HudNotchDismissal) -> Void)? = nil,
        @ViewBuilder leading: () -> Leading,
        @ViewBuilder trailing: () -> Trailing,
        @ViewBuilder content: () -> Content
    ) {
        self.id = id
        self.size = size
        self.wingInset = wingInset
        self.accessibilityLabel = accessibilityLabel
        self.onTap = onTap
        self.onHover = onHover
        self.onKeyDown = onKeyDown
        self.onFlagsChanged = onFlagsChanged
        self.dismissible = dismissible
        self.escapeWhileVisible = escapeWhileVisible
        self.onDismiss = onDismiss
        self.leading = AnyView(leading())
        self.trailing = AnyView(trailing())
        self.content = AnyView(content())
    }

    /// Takes keys: the controller listens for them while the notch is key.
    public var takesKeys: Bool { onKeyDown != nil || onFlagsChanged != nil }
}

// MARK: - Keycaps

/// Colors for keycaps. `init(theme:)` derives them from a notch theme.
public struct HudNotchKeycapStyle {
    /// A key's label.
    public var text: Color
    /// The key just pressed: its label and its edge.
    public var lit: Color
    public var litEdge: Color
    /// A hairline edge, and the dashes of a slot still to fill.
    public var edge: Color
    public var slot: Color
    /// The flat fill behind the key just pressed.
    public var wash: Color

    public init(text: Color, lit: Color, litEdge: Color, edge: Color, slot: Color, wash: Color = Color.white.opacity(0.06)) {
        self.text = text
        self.lit = lit
        self.litEdge = litEdge
        self.edge = edge
        self.slot = slot
        self.wash = wash
    }

    public init(theme: HudNotchTheme) {
        self.init(text: theme.muted, lit: theme.ink, litEdge: theme.muted, edge: Color.white.opacity(0.14), slot: theme.dim)
    }
}

/// One key on the notch: a hairline cap; lit with a flat wash for the key
/// just pressed; a dashed slot for a key still to come.
public struct HudNotchKeycap: View {
    public enum Look: Sendable { case idle, lit, slot }

    public var key: String
    public var look: Look
    public var large: Bool
    public var style: HudNotchKeycapStyle

    public init(_ key: String, look: Look = .idle, large: Bool = false, style: HudNotchKeycapStyle) {
        self.key = key
        self.look = look
        self.large = large
        self.style = style
    }

    public var body: some View {
        let side: CGFloat = large ? 24 : 18
        let shape = RoundedRectangle(cornerRadius: 4, style: .continuous)
        let modifier = HudNotchKeys.isModifier(key)
        Text(look == .slot ? " " : key)
            // Modifier glyphs are tiny in a mono face: they get the UI face; letters stay mono.
            .font(modifier
                ? .system(size: large ? 13.5 : 12, weight: .light)
                : .system(size: large ? 12 : 10.5, weight: .light, design: .monospaced))
            .foregroundStyle(look == .lit ? style.lit : style.text)
            .padding(.horizontal, 5)
            .frame(minWidth: side, minHeight: side, maxHeight: side)
            .background(shape.fill(look == .lit ? style.wash : .clear))
            .overlay {
                if look == .slot {
                    shape.strokeBorder(style.slot, style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
                } else {
                    shape.strokeBorder(look == .lit ? style.litEdge : style.edge, lineWidth: 1)
                }
            }
            .animation(.easeOut(duration: 0.12), value: look)
            .accessibilityHidden(look == .slot)
    }
}

/// A chord as keycaps, with dashed slots after it for keys still to come.
/// The last key is lit while the chord is being pressed.
public struct HudNotchKeycaps: View {
    public var keys: [String]
    public var slots: Int
    public var litLast: Bool
    public var large: Bool
    public var style: HudNotchKeycapStyle

    public init(_ keys: [String], slots: Int = 0, litLast: Bool = false, large: Bool = false, style: HudNotchKeycapStyle) {
        self.keys = keys
        self.slots = slots
        self.litLast = litLast
        self.large = large
        self.style = style
    }

    public var body: some View {
        HStack(spacing: 3) {
            ForEach(Array(keys.enumerated()), id: \.offset) { index, key in
                HudNotchKeycap(key, look: litLast && index == keys.count - 1 ? .lit : .idle, large: large, style: style)
            }
            ForEach(0..<max(0, slots), id: \.self) { _ in
                HudNotchKeycap("", look: .slot, large: large, style: style)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(keys.joined(separator: " ")))
    }
}

// MARK: - Layout

/// A scene's views in place: the wings either side of the gap the hardware
/// takes, the body below at the scene's size.
struct HudNotchSceneLayout: View {
    var scene: HudNotchScene
    var renderStyle: HudNotchRenderStyle
    var notchGap: CGFloat
    var shellHeight: CGFloat
    var reduceMotion: Bool
    /// The pointer is over a dismissible scene: the trailing wing trades its
    /// content for a small ×, always in the same place.
    var showsClose = false
    var closeColor: Color = .secondary
    var close: () -> Void = {}

    var body: some View {
        if renderStyle == .island, let row = scene.islandRow {
            HStack(spacing: 4) {
                row.frame(maxWidth: .infinity, alignment: .leading)
                if scene.dismissible {
                    HudNotchCloseButton(color: closeColor, action: close)
                        .opacity(showsClose ? 1 : 0)
                        .allowsHitTesting(showsClose)
                        .accessibilityHidden(!showsClose)
                }
            }
            .padding(.horizontal, scene.wingInset)
            .frame(width: scene.size.width, height: shellHeight)
            .clipped()
            .accessibilityElement(children: .contain)
        } else {
            wingLayout
        }
    }

    private var wingLayout: some View {
        let size = scene.size
        let wingWidth = max(0, (size.width - notchGap) / 2)
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                scene.leading
                    .padding(.leading, scene.wingInset)
                    .frame(width: wingWidth, alignment: .leading)
                Color.clear.frame(width: notchGap)
                ZStack(alignment: .trailing) {
                    scene.trailing
                        .opacity(showsClose ? 0 : 1)
                        .accessibilityHidden(showsClose)
                    HudNotchCloseButton(color: closeColor, action: close)
                        .opacity(showsClose ? 1 : 0)
                        .allowsHitTesting(showsClose)
                        .accessibilityHidden(!showsClose)
                }
                .animation(reduceMotion ? nil : .easeOut(duration: 0.16), value: showsClose)
                .padding(.trailing, scene.wingInset)
                .frame(width: wingWidth, alignment: .trailing)
            }
            .frame(height: shellHeight)
            .clipped()

            ZStack(alignment: .top) {
                scene.content
                    .id(scene.id)
                    .transition(.notchReveal(insertion: HudNotchMotion.contentIn, reduceMotion: reduceMotion))
            }
            .frame(width: size.width, height: size.contentHeight, alignment: .top)
            .clipped()
        }
        .frame(width: size.width, height: shellHeight + size.contentHeight, alignment: .top)
        .accessibilityElement(children: .contain)
    }
}

/// The small × a dismissible scene shows on hover.
struct HudNotchCloseButton: View {
    var color: Color
    var action: () -> Void
    @State private var hovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: "xmark")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(color.opacity(hovered ? 1 : 0.75))
                .frame(width: 18, height: 18)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovered = $0 }
        .help("Dismiss")
        .accessibilityLabel("Dismiss")
    }
}

// MARK: - Preview

/// A scene drawn still, on its silhouette in the theme's body, with no
/// panel or controller. For snapshots, design reviews and tests.
public struct HudNotchScenePreview: View {
    public var scene: HudNotchScene
    public var theme: HudNotchTheme
    public var configuration: HudNotchConfiguration
    public var renderStyle: HudNotchRenderStyle
    public var notchWidth: CGFloat
    public var notchHeight: CGFloat

    public init(
        scene: HudNotchScene,
        theme: HudNotchTheme = .hudson,
        configuration: HudNotchConfiguration = .default,
        notchWidth: CGFloat = 185,
        notchHeight: CGFloat = 32,
        renderStyle: HudNotchRenderStyle = .notch
    ) {
        self.scene = scene
        self.renderStyle = renderStyle
        self.theme = theme
        self.configuration = configuration
        self.notchWidth = notchWidth
        self.notchHeight = notchHeight
    }

    public var body: some View {
        let shellHeight = max(notchHeight, configuration.shellHeight)
        let size = scene.size(for: renderStyle)
        let compact = renderStyle == .island && scene.islandRow != nil
        let open = size.contentHeight > 0
        let outline = HudNotchSilhouetteShape(
            shoulder: compact ? -size.bottomRadius : configuration.topOuterRadius,
            bottomRadius: compact || open ? size.bottomRadius : configuration.bottomRadius
        )
        let look = open ? configuration.appearance.card : configuration.appearance.pill
        HudNotchSceneLayout(
            scene: scene,
            renderStyle: renderStyle,
            notchGap: HudNotchMetrics.notchGap(notchWidth: notchWidth),
            shellHeight: shellHeight,
            reduceMotion: true
        )
        .background {
            outline
                .fill(theme.body)
                .shadow(color: Color.black.opacity(look.shadowOpacity), radius: look.shadowRadius, y: look.shadowY)
        }
    }
}
#endif
