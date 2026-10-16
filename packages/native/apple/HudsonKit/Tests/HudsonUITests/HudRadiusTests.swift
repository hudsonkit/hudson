import XCTest
import Observation
@testable import HudsonUI

final class HudRadiusTests: XCTestCase {
    @MainActor
    func testTemplatesAndTrackedUpdates() {
        let previous = HudRadius.template
        defer { HudRadius.template = previous }
        HudRadius.template = .rounded
        XCTAssertEqual([HudRadius.tight, HudRadius.standard, HudRadius.card], [3, 6, 8])
        let invalidated = expectation(description: "An open view's token read is invalidated")
        withObservationTracking {
            _ = HudRadius.card
        } onChange: {
            invalidated.fulfill()
        }
        HudRadius.template = .square
        wait(for: [invalidated], timeout: 1)
        XCTAssertEqual([HudRadius.tight, HudRadius.standard, HudRadius.card], [0, 0, 0])
        HudRadius.template = .nearSquare
        XCTAssertEqual([HudRadius.tight, HudRadius.standard, HudRadius.card], [2, 2, 2])
    }
}
