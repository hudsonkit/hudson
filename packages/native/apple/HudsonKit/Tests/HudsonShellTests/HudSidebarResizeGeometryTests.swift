import CoreGraphics
import Testing
@testable import HudsonShell

/// Covers the behavior contract in
/// `docs/proposals/unified-resizable-navigation-sidebar.md`. The gesture layer
/// is deliberately thin; everything worth asserting lives in the geometry.
@Suite("HudSidebarResizeGeometry")
struct HudSidebarResizeGeometryTests {

    private let geometry = HudSidebarResizeGeometry(
        minLabelWidth: 120,
        maxLabelWidth: 280,
        collapseLabelWidth: 44,
        activationDistance: 6
    )

    // MARK: Clamping

    @Test("Committed widths clamp to min/max")
    func committedWidthsClamp() {
        #expect(geometry.committedWidth(10) == 120)
        #expect(geometry.committedWidth(156) == 156)
        #expect(geometry.committedWidth(9_000) == 280)
        #expect(geometry.committedWidth(-40) == 120)
    }

    @Test("Preview widths allow values below the committed minimum down to zero")
    func previewWidthsAllowNarrowValues() {
        #expect(geometry.previewWidth(30) == 30)
        #expect(geometry.previewWidth(0) == 0)
        #expect(geometry.previewWidth(-80) == 0)
        // Still bounded above — the preview edge never runs past the maximum.
        #expect(geometry.previewWidth(9_000) == 280)
    }

    @Test("An inverted width range normalizes instead of stranding the sidebar")
    func invertedRangeNormalizes() {
        let inverted = HudSidebarResizeGeometry(
            minLabelWidth: 200,
            maxLabelWidth: 100,
            collapseLabelWidth: 44,
            activationDistance: 6
        )
        #expect(inverted.minLabelWidth == 200)
        #expect(inverted.maxLabelWidth == 200)
        #expect(inverted.committedWidth(150) == 200)
    }

    // MARK: Outcomes

    @Test("Expanded drag below the collapse threshold produces compact state")
    func dragBelowCollapseThresholdCollapses() {
        let outcome = geometry.outcome(
            isCompact: false,
            startWidth: 156,
            finalWidth: 20,
            horizontalDelta: -136
        )
        // The pre-drag width is what gets kept, so re-expanding returns to a
        // usable size rather than the collapse threshold.
        #expect(outcome == .collapse(restoreWidth: 156))
    }

    @Test("Reaching the collapse threshold while dragging right does not collapse")
    func rightwardDragNeverCollapses() {
        let outcome = geometry.outcome(
            isCompact: false,
            startWidth: 20,
            finalWidth: 44,
            horizontalDelta: 24
        )
        #expect(outcome == .resize(labelWidth: 120))
    }

    @Test("Compact drag right produces expanded state and a valid minimum width")
    func compactDragRightExpands() {
        let tiny = geometry.outcome(
            isCompact: true,
            startWidth: 0,
            finalWidth: 12,
            horizontalDelta: 12
        )
        #expect(tiny == .expand(labelWidth: 120))

        let generous = geometry.outcome(
            isCompact: true,
            startWidth: 0,
            finalWidth: 200,
            horizontalDelta: 200
        )
        #expect(generous == .expand(labelWidth: 200))
    }

    @Test("Committed resize outcomes stay inside the width bounds")
    func resizeOutcomesClamp() {
        let wide = geometry.outcome(
            isCompact: false,
            startWidth: 156,
            finalWidth: 400,
            horizontalDelta: 244
        )
        #expect(wide == .resize(labelWidth: 280))
    }

    // MARK: Activation

    @Test("Short or vertical drags do not activate a resize")
    func activationRejectsNonResizeGestures() {
        // Below the activation distance.
        #expect(!geometry.isResizeActivated(isCompact: false, horizontalDelta: 4, verticalDelta: 0))
        // Predominantly vertical — a scroll, not a resize.
        #expect(!geometry.isResizeActivated(isCompact: false, horizontalDelta: 10, verticalDelta: 40))
        // Compact only responds to a rightward pull.
        #expect(!geometry.isResizeActivated(isCompact: true, horizontalDelta: -30, verticalDelta: 0))
    }

    @Test("Deliberate horizontal drags activate in both modes")
    func activationAcceptsHorizontalDrags() {
        #expect(geometry.isResizeActivated(isCompact: false, horizontalDelta: -30, verticalDelta: 2))
        #expect(geometry.isResizeActivated(isCompact: true, horizontalDelta: 12, verticalDelta: 2))
    }

    @Test("Compact mode activates sooner than expanded mode")
    func compactActivatesSooner() {
        #expect(geometry.activationThreshold(isCompact: false) == 6)
        #expect(geometry.activationThreshold(isCompact: true) == 3)

        // A 4pt pull is a resize from compact but not from expanded.
        #expect(geometry.isResizeActivated(isCompact: true, horizontalDelta: 4, verticalDelta: 0))
        #expect(!geometry.isResizeActivated(isCompact: false, horizontalDelta: 4, verticalDelta: 0))
    }

    @Test("Compact activation never drops below its floor")
    func compactActivationFloor() {
        let zeroDistance = HudSidebarResizeGeometry(
            minLabelWidth: 120,
            maxLabelWidth: 280,
            collapseLabelWidth: 44,
            activationDistance: 0
        )
        #expect(zeroDistance.activationThreshold(isCompact: true) == 2)
    }

    @Test("A gesture that stays inside the activation box reads as a click")
    func stationaryGestureIsAClick() {
        #expect(geometry.isClick(isCompact: false, horizontalDelta: 1, verticalDelta: -2))
        #expect(!geometry.isClick(isCompact: false, horizontalDelta: 20, verticalDelta: 0))
    }

    // MARK: Drag geometry

    @Test("Compact drags grow the label column out of the rail")
    func compactDragStartsFromZero() {
        #expect(geometry.dragStartWidth(isCompact: true, currentWidth: 156) == 0)
        #expect(geometry.dragStartWidth(isCompact: false, currentWidth: 156) == 156)
        // A stored width outside the bounds is normalized before the drag math.
        #expect(geometry.dragStartWidth(isCompact: false, currentWidth: 9_000) == 280)
    }

    @Test("Preview width tracks the drag offset from the start width")
    func previewTracksDragOffset() {
        #expect(geometry.proposedPreviewWidth(startWidth: 156, horizontalDelta: -40) == 116)
        // Below the committed minimum is legal for a preview.
        #expect(geometry.proposedPreviewWidth(startWidth: 156, horizontalDelta: -140) == 16)
        #expect(geometry.proposedPreviewWidth(startWidth: 156, horizontalDelta: -400) == 0)
    }

    // MARK: SpeakEasy adoption bounds

    @Test("SpeakEasy's recommended bounds accept its initial width")
    func speakEasyBoundsAcceptInitialWidth() {
        let speakEasy = HudSidebarResizeGeometry(
            minLabelWidth: 120,
            maxLabelWidth: 280,
            collapseLabelWidth: 44,
            activationDistance: 6
        )
        #expect(speakEasy.committedWidth(156) == 156)
        #expect(speakEasy.outcome(
            isCompact: false,
            startWidth: 156,
            finalWidth: 30,
            horizontalDelta: -126
        ) == .collapse(restoreWidth: 156))
    }
}

// MARK: - Fixed/progress geometry

/// Guards goal 3 of the proposal: adding resizing must not disturb the fixed
/// and progress-scrubbing initializers' geometry.
@Suite("HudSidebarLayout intrinsic width")
struct HudSidebarIntrinsicWidthTests {

    @Test("Expanded intrinsic width is rail plus the full label column")
    func expandedWidth() {
        #expect(
            HudSidebarLayout.intrinsicWidth(progress: 0, labelWidth: 156)
            == HudSidebarLayout.railContentInset + HudSidebarLayout.railWidth + 156
        )
    }

    @Test("Compact intrinsic width is the rail alone")
    func compactWidth() {
        #expect(
            HudSidebarLayout.intrinsicWidth(progress: 1, labelWidth: 156)
            == HudSidebarLayout.railContentInset + HudSidebarLayout.railWidth
        )
    }

    @Test("Progress scrubbing interpolates the label column linearly")
    func scrubbedWidth() {
        #expect(
            HudSidebarLayout.intrinsicWidth(progress: 0.5, labelWidth: 200)
            == HudSidebarLayout.railContentInset + HudSidebarLayout.railWidth + 100
        )
    }

    @Test("Overshooting progress never yields a negative label column")
    func overshootClampsToRail() {
        #expect(
            HudSidebarLayout.intrinsicWidth(progress: 1.4, labelWidth: 200)
            == HudSidebarLayout.railContentInset + HudSidebarLayout.railWidth
        )
    }
}
