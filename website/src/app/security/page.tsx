// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next";
import { LemonSlice } from "@/components/LemonSlice";
import { AUDIT_LOG, GITHUB_URL, SECURITY_MODEL_DOC, SECURITY_POLICY } from "@/lib/links";

export const metadata: Metadata = {
  title: "Security — Sublemonable",
  description:
    "How Sublemonable works under the hood: Signal Protocol, on-device keys, a server that stores almost nothing, screenshot protection, and optional Tor routing.",
};

export default function SecurityPage() {
  return (
    <main className="bg-bg-primary px-6 pb-28 pt-32">
      <article className="prose-security mx-auto max-w-3xl">
        <header className="mb-4">
          <LemonSlice size={56} label="" />
          <h1 className="mt-8 font-display text-4xl font-bold tracking-display text-ink-primary sm:text-5xl">
            How Sublemonable works
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-secondary">
            Zero-knowledge architecture means the server never sees, stores, or logs plaintext
            message content under any circumstances. Not as a policy. As a property of the design.
            Here&apos;s the whole thing, in plain language.
          </p>
        </header>

        <h2 id="signal-protocol">Signal Protocol</h2>
        <p>
          Sublemonable uses the Signal Protocol — the X3DH key agreement for establishing a shared
          secret with someone you&apos;ve never messaged before, and the Double Ratchet for
          everything after. It&apos;s the most scrutinized messaging cryptography in existence. We
          didn&apos;t invent our own. You should be suspicious of anyone who does.
        </p>
        <p>
          Every single message is encrypted with its own AES-256-GCM message key, derived by the
          ratchet and discarded after use. Keys rotate with every message, which gives you forward
          secrecy: if a key were ever compromised, it unlocks one message, not your history — and
          your history is probably already gone anyway.
        </p>
        <p>
          The implementations are established libraries, not homemade: <code>libsodium.js</code> in
          the browser, and <code>libsignal-client</code> on iOS and Android.
        </p>

        <h2 id="keys">Key generation and storage</h2>
        <p>
          Your identity is a Curve25519 keypair generated on your device. The private half never
          leaves it. There is no account recovery, because there is nothing on our side to recover.
        </p>
        <ul>
          <li>
            <strong>Identity key</strong> — long-term Curve25519 keypair, generated on device, never
            leaves the device.
          </li>
          <li>
            <strong>Signed prekey</strong> — Curve25519, rotated every 7 days, signed by your
            identity key.
          </li>
          <li>
            <strong>One-time prekeys</strong> — uploaded in batches of 100 (public keys only), each
            consumed exactly once.
          </li>
          <li>
            <strong>Session keys</strong> — derived via X3DH on first contact, then advanced by the
            Double Ratchet.
          </li>
          <li>
            <strong>Message keys</strong> — AES-256-GCM, one per message, discarded after use.
          </li>
        </ul>
        <p>Where your keys live depends on your platform:</p>
        <ul>
          <li>
            <strong>Browser</strong> — IndexedDB, encrypted with AES-256-GCM under a master key
            derived from your passphrase via Argon2id (64 MB memory, 3 iterations, 4 lanes —
            parameters chosen to make brute force expensive).
          </li>
          <li>
            <strong>iOS</strong> — Secure Enclave and Keychain, biometric-protected.
          </li>
          <li>
            <strong>Android</strong> — Android Keystore System, hardware-backed where the device
            supports it.
          </li>
          <li>
            <strong>Linux</strong> — the Secret Service API (GNOME Keyring on GNOME, KWallet on
            KDE). On minimal desktops with no Secret Service daemon, an Argon2id+AES-256-GCM
            encrypted file fallback is used. Either way the vault is encrypted before it reaches the
            storage layer.
          </li>
        </ul>

        <h2 id="server">What the server stores (and doesn&apos;t)</h2>
        <p>
          The server is a relay, not an archive. Store-and-forward only: a message sits on the
          server as an opaque encrypted blob until your recipient&apos;s device confirms delivery,
          at which point it is deleted immediately. Undelivered messages are purged after 72 hours
          and the sender is told so.
        </p>
        <p>The complete list of what the server stores:</p>
        <ul>
          <li>Your account ID — a random UUID, not a username</li>
          <li>Your public identity key (Curve25519)</li>
          <li>Your public prekeys (one-time and signed)</li>
          <li>Encrypted message envelopes in transit — blob only</li>
          <li>Delivery receipts — a hash of the message ID, nothing else</li>
          <li>Account creation timestamp</li>
        </ul>
        <p>And what it never stores:</p>
        <ul>
          <li>Plaintext messages, or message content of any kind</li>
          <li>IP addresses</li>
          <li>Device identifiers</li>
          <li>Contact lists</li>
          <li>Read receipts linked to identity</li>
          <li>Any logs that identify users — access logs are disabled outright</li>
        </ul>
        <p>
          Transport is WebSocket over TLS 1.3 with certificate pinning on every platform. Typing
          indicators and read receipts travel as encrypted signals too — the server can&apos;t even
          tell whether you&apos;ve read something. Deleting your account purges everything: prekeys,
          pending envelopes, the account record. Irreversibly.
        </p>

        <h2 id="screenshots">Screenshot protection, by platform</h2>
        <p>
          Each platform allows a different level of protection, so we&apos;re specific about it:
        </p>
        <ul>
          <li>
            <strong>Android</strong> — <code>FLAG_SECURE</code> on every screen with message
            content. This is an OS-level hard block: screenshots and screen recordings come out
            black. The strongest protection of the three.
          </li>
          <li>
            <strong>iOS</strong> — screen recording is detected in real time and the message list is
            blurred immediately. Screenshots can&apos;t be prevented on iOS — the API only fires
            after the fact — so we detect them, warn you, and log the event locally on your device.
          </li>
          <li>
            <strong>Browser</strong> — the moment the window loses focus or visibility, the message
            list is blurred and desaturated within 120 milliseconds. On top of that, every
            conversation carries an invisible watermark encoding the recipient and timestamp — if a
            screenshot leaks, it identifies who leaked it.
          </li>
          <li>
            <strong>Linux (Wayland)</strong> — an OS-level hard block via xdg-desktop-portal on
            compositors that support it (GNOME Shell, KDE Plasma). This is the desktop equivalent of
            Android&apos;s FLAG_SECURE.
          </li>
          <li>
            <strong>Linux (X11)</strong> — best-effort only. X11 cannot prevent screen capture, so
            we&apos;re honest about it: the focus-loss blur overlay is the protection you get.
            Prefer Wayland for confidential use.
          </li>
        </ul>
        <p>
          Honesty clause: a compromised device with an OS-level keylogger, or someone pointing a
          second camera at the screen, is outside any app&apos;s power. We don&apos;t pretend
          otherwise.
        </p>

        <h2 id="tor">Tor routing</h2>
        <p>
          Network-level metadata — who connected, from where — is the hardest thing for any
          messenger to hide. Sublemonable keeps stored metadata minimal, and for the network layer
          it offers optional Tor routing: Orbot integration on iOS and Android, and a{" "}
          <code>.onion</code> address for the browser app via Tor Browser. It&apos;s opt-in, not on
          by default, because it trades latency for anonymity and that should be your call.
        </p>

        <h2 id="open-source">Open source and audit history</h2>
        <p>
          Everything — the encryption, the server, all three apps — is open source under AGPL-3.0 at{" "}
          <a href={GITHUB_URL}>github.com/jackofall1232/sublemonable</a>. The AGPL means anyone
          running a modified Sublemonable as a service must publish their changes. No silent forks
          with weakened crypto.
        </p>
        <p>
          Audit history: no third-party audits have been conducted yet. We&apos;d rather tell you
          that plainly than imply otherwise. The <a href={AUDIT_LOG}>audit log</a> updates as audits
          complete, and researchers who want to conduct one — or who find a vulnerability — should
          follow the <a href={SECURITY_POLICY}>responsible disclosure policy</a>: acknowledgement
          within 48 hours, fix target within 90 days, good-faith research explicitly authorized.
        </p>
        <p>
          For the full technical treatment — threat model, transport details, the works — read the{" "}
          <a href={SECURITY_MODEL_DOC}>security model documentation</a>.
        </p>
      </article>
    </main>
  );
}
