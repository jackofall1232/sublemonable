// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import AVFoundation
import Foundation
import UserNotifications

/// Decides which sound a Sublemonable notification plays, and lets the user
/// replace the branded default with their own audio.
///
/// iOS has no system UI to change a single app's notification sound (unlike
/// Android), so the app owns the whole flow:
///   1. Ship a bundled brand default (`new_message.wav`).
///   2. Let the user import any audio file.
///   3. Transcode it to a notification-compatible CAF (Linear PCM, mono,
///      44.1 kHz, ≤ 30 s) — Apple rejects AAC/MP3 and anything over 30 s for
///      `UNNotificationSound`.
///   4. Store it in the app container's `Library/Sounds`, which is exactly
///      where `UNNotificationSound(named:)` looks for app-created custom sounds.
///
/// PUSH CAVEAT: a notification created by the NotificationService extension
/// resolves its sound against the *extension's* container, not the app's. Push
/// isn't wired yet, so the extension keeps using the bundled default. When APNs
/// is added, move the custom file into a shared App Group container and read
/// `preferenceKey` from `UserDefaults(suiteName:)` so both processes agree.
public enum NotificationSoundStore {

    /// Bundled brand default. Must exist in the app target's bundle.
    public static let defaultSoundName = "new_message.wav"

    /// Fixed on-disk name for the user's imported sound.
    static let customSoundName = "sublemonable_custom.caf"

    /// Apple's hard cap for custom notification sounds.
    static let maxDurationSeconds: Double = 30

    /// UserDefaults key. "" / missing → brand default; "custom" → user file.
    public static let preferenceKey = "org.sublemonable.notification-sound"

    private static var defaults: UserDefaults { .standard }

    // MARK: - Public API

    /// Whether a valid user sound is currently selected AND present on disk.
    /// Falling back to the default if the file vanished keeps us from ever
    /// handing the system a dangling name (which would silence the alert).
    public static var isUsingCustomSound: Bool {
        guard defaults.string(forKey: preferenceKey) == "custom",
              let url = customSoundURL
        else { return false }
        return FileManager.default.fileExists(atPath: url.path)
    }

    /// The sound to attach to a locally-created notification.
    public static func currentSound() -> UNNotificationSound {
        let name = isUsingCustomSound ? customSoundName : defaultSoundName
        return UNNotificationSound(named: UNNotificationSoundName(name))
    }

    /// A file URL that can be previewed with AVAudioPlayer (custom file if set,
    /// otherwise the bundled default). Nil only if the default is missing.
    public static func previewURL() -> URL? {
        if isUsingCustomSound, let url = customSoundURL { return url }
        return Bundle.main.url(forResource: "new_message", withExtension: "wav")
    }

    /// Revert to the branded default and delete any imported file.
    public static func useDefault() {
        defaults.set("", forKey: preferenceKey)
        if let url = customSoundURL {
            try? FileManager.default.removeItem(at: url)
        }
    }

    /// Imports the audio at `source` (typically a document-picker URL),
    /// validates and transcodes it, and selects it as the notification sound.
    ///
    /// Runs synchronous file/audio work — call it off the main thread.
    @discardableResult
    public static func importCustomSound(from source: URL) -> Result<Void, ImportError> {
        // Document-picker URLs are security-scoped; must be opened explicitly.
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }

        let asset = AVURLAsset(url: source)
        let duration = CMTimeGetSeconds(asset.duration)
        guard duration.isFinite, duration > 0 else { return .failure(.unreadable) }
        guard asset.tracks(withMediaType: .audio).first != nil else {
            return .failure(.unreadable)
        }

        guard let destination = customSoundURL else { return .failure(.storageUnavailable) }

        do {
            try ensureSoundsDirectory()
            try transcodeToCAF(
                asset: asset,
                duration: min(duration, maxDurationSeconds),
                to: destination
            )
        } catch let error as ImportError {
            return .failure(error)
        } catch {
            return .failure(.transcodeFailed)
        }

        defaults.set("custom", forKey: preferenceKey)
        return .success(())
    }

    public enum ImportError: Error, LocalizedError {
        case unreadable
        case storageUnavailable
        case transcodeFailed

        public var errorDescription: String? {
            switch self {
            case .unreadable:
                return "That file couldn't be read as audio."
            case .storageUnavailable:
                return "Couldn't save the sound on this device."
            case .transcodeFailed:
                return "That audio couldn't be converted to a notification sound."
            }
        }
    }

    // MARK: - Storage

    private static var soundsDirectory: URL? {
        FileManager.default
            .urls(for: .libraryDirectory, in: .userDomainMask)
            .first?
            .appendingPathComponent("Sounds", isDirectory: true)
    }

    private static var customSoundURL: URL? {
        soundsDirectory?.appendingPathComponent(customSoundName)
    }

    private static func ensureSoundsDirectory() throws {
        guard let dir = soundsDirectory else { throw ImportError.storageUnavailable }
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    }

    // MARK: - Transcode

    /// Reads `asset` and writes a Linear-PCM CAF trimmed to `duration`.
    /// CAF + LPCM is one of the container/format pairs `UNNotificationSound`
    /// accepts; we also downmix to mono 16-bit/44.1 kHz to keep the file small.
    private static func transcodeToCAF(asset: AVAsset, duration: Double, to dest: URL) throws {
        try? FileManager.default.removeItem(at: dest)

        guard let track = asset.tracks(withMediaType: .audio).first else {
            throw ImportError.unreadable
        }

        let pcmSettings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ]

        let reader = try AVAssetReader(asset: asset)
        reader.timeRange = CMTimeRange(
            start: .zero,
            duration: CMTime(seconds: duration, preferredTimescale: 44_100)
        )
        let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: pcmSettings)
        readerOutput.alwaysCopiesSampleData = false
        guard reader.canAdd(readerOutput) else { throw ImportError.transcodeFailed }
        reader.add(readerOutput)

        let writer = try AVAssetWriter(outputURL: dest, fileType: .caf)
        let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: pcmSettings)
        writerInput.expectsMediaDataInRealTime = false
        guard writer.canAdd(writerInput) else { throw ImportError.transcodeFailed }
        writer.add(writerInput)

        guard reader.startReading(), writer.startWriting() else {
            throw ImportError.transcodeFailed
        }
        writer.startSession(atSourceTime: .zero)

        // Synchronous pull loop — simple and correct as long as this runs off
        // the main thread (see the doc comment on importCustomSound).
        while let sample = readerOutput.copyNextSampleBuffer() {
            while !writerInput.isReadyForMoreMediaData {
                Thread.sleep(forTimeInterval: 0.005)
            }
            if !writerInput.append(sample) { break }
        }
        writerInput.markAsFinished()

        let finished = DispatchSemaphore(value: 0)
        writer.finishWriting { finished.signal() }
        finished.wait()

        guard writer.status == .completed, reader.status != .failed else {
            try? FileManager.default.removeItem(at: dest)
            throw ImportError.transcodeFailed
        }
    }
}
