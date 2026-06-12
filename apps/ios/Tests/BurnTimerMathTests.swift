// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import XCTest
@testable import Sublemonable

final class BurnTimerMathTests: XCTestCase {
    // MARK: segmentsRemaining

    func testFullTimeShowsAllEightSegments() {
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 60, total: 60), 8)
    }

    func testZeroRemainingShowsNoSegments() {
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 0, total: 60), 0)
    }

    func testNegativeRemainingShowsNoSegments() {
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: -5, total: 60), 0)
    }

    func testZeroTotalShowsNoSegments() {
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 10, total: 0), 0)
    }

    func testHalfTimeShowsFourSegments() {
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 30, total: 60), 4)
    }

    func testSegmentsRoundUpSoTimeNeverLooksMoreSpentThanItIs() {
        // 31/60 → 4.13 eighths → ceil → 5 segments
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 31, total: 60), 5)
        // 1/60 → 0.13 eighths → still shows the final segment
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 1, total: 60), 1)
    }

    func testTinyRemainderStillShowsOneSegmentWhileAlive() {
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 0.001, total: 604800), 1)
    }

    func testRemainingAboveTotalIsClampedToEight() {
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 120, total: 60), 8)
    }

    func testExactSegmentBoundaries() {
        let total: TimeInterval = 80 // 10s per segment
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 80, total: total), 8)
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 70, total: total), 7)
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 20, total: total), 2)
        XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 10, total: total), 1)
    }

    // MARK: phase (lemon → orange at <=2 → red at 1)

    func testPhaseIsNormalAboveTwoSegments() {
        for segments in 3...8 {
            XCTAssertEqual(BurnTimerMath.phase(forSegments: segments), .normal,
                           "segments=\(segments)")
        }
    }

    func testPhaseIsCriticalOrangeAtTwoSegments() {
        XCTAssertEqual(BurnTimerMath.phase(forSegments: 2), .critical)
    }

    func testPhaseIsFinalRedAtOneSegment() {
        XCTAssertEqual(BurnTimerMath.phase(forSegments: 1), .final)
    }

    func testPhaseIsFinalAtZeroSegments() {
        XCTAssertEqual(BurnTimerMath.phase(forSegments: 0), .final)
    }

    // MARK: warning pulse (<10% remaining)

    func testWarningTriggersBelowTenPercent() {
        XCTAssertTrue(BurnTimerMath.isWarning(remaining: 5, total: 60))
        XCTAssertFalse(BurnTimerMath.isWarning(remaining: 6, total: 60))
        XCTAssertFalse(BurnTimerMath.isWarning(remaining: 0, total: 60))
        XCTAssertFalse(BurnTimerMath.isWarning(remaining: 60, total: 60))
        XCTAssertFalse(BurnTimerMath.isWarning(remaining: 5, total: 0))
    }

    // MARK: all spec TTL options behave sanely

    func testAllSpecTTLOptionsStartFullAndEndEmpty() {
        for ttl in [30, 60, 300, 3600, 86400, 604800] {
            let total = TimeInterval(ttl)
            XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: total, total: total), 8)
            XCTAssertEqual(BurnTimerMath.segmentsRemaining(remaining: 0, total: total), 0)
        }
    }
}
