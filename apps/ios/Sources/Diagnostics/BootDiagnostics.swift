// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import Foundation

/// On-device, privacy-safe boot/connection diagnostics — the iOS port of
/// Android's BootDiagnostics (Settings → Diagnostics), which is how the
/// registration and message-send failures were finally root-caused this week
/// without needing a debugger or a second machine.
///
/// Each entry is a single fixed stage marker or a transport error
/// (type + numeric code), prefixed with a UTC timestamp. NEVER message
/// content, keys, tokens, account ids, or envelope fields — the log is safe
/// for a user to copy and share verbatim in a bug report.
///
/// Storage: a plain text file in the app-private Application Support
/// directory (excluded from backups below), capped at the most recent
/// `maxEntries` lines so it can never grow unbounded. All disk writes are
/// best-effort: a diagnostics IO failure must never break the boot path.
public final class BootDiagnostics: ObservableObject {

    public static let maxEntries = 50
    private static let fileName = "boot-diagnostics.log"

    /// Recorded lines, oldest-first / most-recent-last. The Diagnostics
    /// screen observes this so a connection attempt made while the screen is
    /// open shows up live. Main-thread-published SNAPSHOT of `localEntries` —
    /// never read or written off-main.
    @Published public private(set) var entries: [String] = []

    /// The authoritative entry list, confined to `queue`. Kept separate from
    /// the `@Published` mirror so successive `record()` calls compose on the
    /// serial queue instead of racing the main-thread publication (two rapid
    /// records reading the same stale published value would silently drop
    /// the earlier line — e.g. the handshake stage right before a failure).
    private var localEntries: [String] = []

    private let fileURL: URL?
    // Serializes file IO + entry mutation; record() is called from arbitrary
    // threads (socket delegate, async boot task) while SwiftUI observes.
    private let queue = DispatchQueue(label: "org.sublemonable.diagnostics")

    private static let timestampFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        formatter.timeZone = TimeZone(identifier: "UTC")
        return formatter
    }()

    public init() {
        let support = try? FileManager.default.url(for: .applicationSupportDirectory,
                                                   in: .userDomainMask,
                                                   appropriateFor: nil,
                                                   create: true)
        var url = support?.appendingPathComponent(Self.fileName)
        // Never in iCloud/local backups — same policy as Android's
        // allowBackup=false for its diagnostics file.
        if var target = url {
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? target.setResourceValues(values)
            url = target
        }
        self.fileURL = url
        queue.async { [weak self] in self?.loadFromDisk() }
    }

    /// Append one privacy-safe line (timestamped, UTC) and rotate to the last
    /// `maxEntries`. Never throws; safe from any thread.
    public func record(_ line: String) {
        let stamped = "\(Self.timestampFormatter.string(from: Date()))  \(line)"
        queue.async { [weak self] in
            guard let self else { return }
            self.localEntries = Array((self.localEntries + [stamped]).suffix(Self.maxEntries))
            self.persist(self.localEntries)
            let snapshot = self.localEntries
            DispatchQueue.main.async { self.entries = snapshot }
        }
    }

    /// Wipe the log — a user action from the Diagnostics screen.
    public func clear() {
        queue.async { [weak self] in
            guard let self else { return }
            self.localEntries = []
            if let fileURL = self.fileURL {
                // Truncate first so a failed delete can't resurrect entries.
                try? Data().write(to: fileURL)
                try? FileManager.default.removeItem(at: fileURL)
            }
            DispatchQueue.main.async { self.entries = [] }
        }
    }

    // MARK: - Disk (best-effort, on `queue` only)

    private func loadFromDisk() {
        guard let fileURL,
              let text = try? String(contentsOf: fileURL, encoding: .utf8) else { return }
        let lines = text.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
        let capped = Array(lines.suffix(Self.maxEntries))
        // Persisted lines predate anything recorded this launch. init()
        // enqueues this before any record() can land, but merge defensively
        // anyway rather than assume ordering.
        localEntries = Array((capped + localEntries).suffix(Self.maxEntries))
        let snapshot = localEntries
        DispatchQueue.main.async { [weak self] in self?.entries = snapshot }
    }

    private func persist(_ lines: [String]) {
        guard let fileURL else { return }
        try? (lines.joined(separator: "\n") + "\n")
            .write(to: fileURL, atomically: true, encoding: .utf8)
    }

    // MARK: - Privacy-safe error rendering

    /// Type + numeric code for the well-known error kinds; never interpolated
    /// descriptions (they can embed URLs, hosts, or identifiers). The API
    /// error carries the server's fixed-vocabulary schema code, which is what
    /// makes a contract-mismatch 4xx self-diagnosing from this screen alone.
    public static func describe(_ error: Error) -> String {
        if let apiError = error as? APIClient.APIError {
            switch apiError {
            case let .http(status, serverCode):
                let code = serverCode.map { " server_error=\($0)" } ?? ""
                return "APIError.http status=\(status)\(code)"
            case .invalidResponse: return "APIError.invalidResponse"
            case .notAuthenticated: return "APIError.notAuthenticated"
            case .registrationFailed: return "APIError.registrationFailed"
            }
        }
        let nsError = error as NSError
        return "\(type(of: error)) domain=\(nsError.domain) code=\(nsError.code)"
    }
}
