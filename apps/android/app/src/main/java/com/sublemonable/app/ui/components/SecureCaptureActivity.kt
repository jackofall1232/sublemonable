// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import android.os.Bundle
import android.view.WindowManager
import com.journeyapps.barcodescanner.CaptureActivity

/**
 * The QR scanner runs in ZXing's own Activity, outside [MainActivity], so it
 * would not inherit MainActivity's FLAG_SECURE. This subclass restores the
 * app-wide critical rule that EVERY Activity sets FLAG_SECURE before content —
 * screenshots and screen recordings render black. The preview only ever shows a
 * peer's public contact code, but the invariant is kept absolute rather than
 * argued as an exception.
 */
class SecureCaptureActivity : CaptureActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE,
        )
        super.onCreate(savedInstanceState)
    }
}
