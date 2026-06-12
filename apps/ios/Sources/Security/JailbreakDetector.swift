// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import UIKit
import Darwin

/// Basic jailbreak heuristics. Policy: WARN ONLY — never block. A jailbroken
/// device weakens local key protection, and the user deserves to know; but a
/// privacy app that locks out its users is worse than the disease. None of
/// these checks is conclusive on its own, and all are trivially bypassable by
/// a determined attacker — they exist to inform honest users, not to win an
/// arms race.
public enum JailbreakDetector {
    public struct Result {
        public let suspicious: Bool
        /// Human-readable reasons, shown in the warning. No device data is
        /// ever transmitted — this is purely local.
        public let reasons: [String]
    }

    public static func check() -> Result {
        var reasons: [String] = []

        #if targetEnvironment(simulator)
        return Result(suspicious: false, reasons: [])
        #else
        if hasSuspiciousPaths() { reasons.append("Jailbreak files present") }
        if canWriteOutsideSandbox() { reasons.append("Sandbox appears broken") }
        if forkSucceeds() { reasons.append("Process restrictions are off") }
        if canOpenCydia() { reasons.append("Cydia is installed") }
        return Result(suspicious: !reasons.isEmpty, reasons: reasons)
        #endif
    }

    /// Files and directories that only exist on jailbroken devices.
    private static func hasSuspiciousPaths() -> Bool {
        let paths = [
            "/Applications/Cydia.app",
            "/Applications/Sileo.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/bin/bash",
            "/usr/sbin/sshd",
            "/etc/apt",
            "/private/var/lib/apt",
            "/private/var/lib/cydia",
            "/usr/bin/ssh",
            "/var/jb"
        ]
        let fm = FileManager.default
        return paths.contains { fm.fileExists(atPath: $0) }
    }

    /// The sandbox forbids writing outside the container; success means it is broken.
    private static func canWriteOutsideSandbox() -> Bool {
        let probe = "/private/sublemonable_jb_probe_\(UUID().uuidString)"
        do {
            try "x".write(toFile: probe, atomically: true, encoding: .utf8)
            try? FileManager.default.removeItem(atPath: probe)
            return true
        } catch {
            return false
        }
    }

    /// fork(2) is denied by the sandbox on stock iOS. Resolved via dlsym so
    /// the symbol is not directly referenced. A returned child is reaped
    /// immediately.
    private static func forkSucceeds() -> Bool {
        typealias ForkType = @convention(c) () -> pid_t
        guard let handle = dlopen(nil, RTLD_NOW),
              let symbol = dlsym(handle, "fork") else { return false }
        let forkFn = unsafeBitCast(symbol, to: ForkType.self)
        let pid = forkFn()
        if pid == 0 {
            // We are the child on a jailbroken device — exit immediately.
            exit(0)
        }
        if pid > 0 {
            var status: Int32 = 0
            waitpid(pid, &status, 0)
            return true
        }
        return false
    }

    /// Requires LSApplicationQueriesSchemes to include "cydia" in Info.plist.
    private static func canOpenCydia() -> Bool {
        guard let url = URL(string: "cydia://package/com.example.package") else { return false }
        return UIApplication.shared.canOpenURL(url)
    }
}
