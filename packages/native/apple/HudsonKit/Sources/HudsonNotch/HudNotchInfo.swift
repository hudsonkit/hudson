#if os(macOS)
import AppKit
import HudsonNotchCore

public struct HudNotchInfo: Equatable, Sendable {
    public static let defaultMenuBarHeight = HudNotchMetrics.menuBarHeight
    public static let defaultVirtualNotchWidth = HudNotchMetrics.virtualNotchWidth
    public static let defaultVirtualNotchHeight = HudNotchMetrics.virtualNotchHeight

    public let hasNotch: Bool
    public let isVirtual: Bool
    public let notchWidth: CGFloat
    public let notchHeight: CGFloat
    public let screenFrame: CGRect
    public let screenCenter: CGFloat
    public let displayID: CGDirectDisplayID

    public init(
        hasNotch: Bool,
        isVirtual: Bool,
        notchWidth: CGFloat,
        notchHeight: CGFloat,
        screenFrame: CGRect,
        screenCenter: CGFloat,
        displayID: CGDirectDisplayID
    ) {
        self.hasNotch = hasNotch
        self.isVirtual = isVirtual
        self.notchWidth = notchWidth
        self.notchHeight = notchHeight
        self.screenFrame = screenFrame
        self.screenCenter = screenCenter
        self.displayID = displayID
    }

    @MainActor
    public static func detect(for screen: NSScreen? = NSScreen.main) -> HudNotchInfo {
        guard let screen else {
            return HudNotchInfo(
                hasNotch: false,
                isVirtual: false,
                notchWidth: 0,
                notchHeight: defaultMenuBarHeight,
                screenFrame: .zero,
                screenCenter: 0,
                displayID: 0
            )
        }

        let screenFrame = screen.frame
        let visibleFrame = screen.visibleFrame
        let resolvedDisplayID = displayID(for: screen) ?? 0
        let menuBarHeight = screenFrame.maxY - visibleFrame.maxY
        var hasNotch = false
        var notchWidth: CGFloat = 0
        var notchCenter = screenFrame.midX

        if #available(macOS 12.0, *) {
            if let left = screen.auxiliaryTopLeftArea,
               let right = screen.auxiliaryTopRightArea,
               left.width > 0,
               right.width > 0 {
                var leftMaxX = left.maxX
                var rightMinX = right.minX
                let rawCenter = (leftMaxX + rightMinX) / 2

                if abs(rawCenter - screenFrame.midX) > (screenFrame.width / 2) {
                    leftMaxX += screenFrame.minX
                    rightMinX += screenFrame.minX
                }

                let measuredWidth = rightMinX - leftMaxX
                if measuredWidth > 80, measuredWidth < (screenFrame.width * 0.55) {
                    hasNotch = true
                    notchWidth = measuredWidth
                    notchCenter = (leftMaxX + rightMinX) / 2
                }
            }
        }

        if !hasNotch, CGDisplayIsBuiltin(resolvedDisplayID) != 0, menuBarHeight > 30 {
            hasNotch = true
            notchWidth = defaultVirtualNotchWidth
            notchCenter = screenFrame.midX
        }

        return HudNotchInfo(
            hasNotch: hasNotch,
            isVirtual: false,
            notchWidth: notchWidth,
            notchHeight: max(menuBarHeight, defaultMenuBarHeight),
            screenFrame: screenFrame,
            screenCenter: notchCenter,
            displayID: resolvedDisplayID
        )
    }

    @MainActor
    public static func effective(for screen: NSScreen? = NSScreen.main) -> HudNotchInfo {
        let detected = detect(for: screen)
        guard let screen else { return detected }
        guard !detected.hasNotch else { return detected }

        return HudNotchInfo(
            hasNotch: true,
            isVirtual: true,
            notchWidth: defaultVirtualNotchWidth,
            notchHeight: max(detected.notchHeight, defaultVirtualNotchHeight),
            screenFrame: screen.frame,
            screenCenter: screen.frame.midX,
            displayID: detected.displayID
        )
    }

    static func displayID(for screen: NSScreen) -> CGDirectDisplayID? {
        guard let screenNumber = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber else {
            return nil
        }
        return CGDirectDisplayID(screenNumber.uint32Value)
    }
}
#endif
