# Sublemonable — Linux Desktop

A native Linux desktop build of Sublemonable, packaged with [Tauri v2](https://tauri.app).
Tauri was chosen over Electron deliberately: **no bundled Chromium**, a small Rust backend, and a
much smaller attack surface. The UI is the exact same React app as the browser client
([`apps/web`](../web)) — it is **not** duplicated here. This crate adds only the three things a
browser cannot do as well, or that benefit from a native host:

1. **libsecret keystore** (GNOME Keyring / KWallet) with an encrypted file fallback
2. **Tor-first SOCKS5 detection**
3. **Native window focus signal** driving the best-effort screenshot blur overlay

## Packages

| Format | Distros | Status |
| --- | --- | --- |
| `.deb` (primary) | Debian, Ubuntu, Kali Linux, Parrot OS, Pop!_OS | Formally supported |
| `.AppImage` | Any Linux distro — runs without installation | Formally supported |
| `.rpm` | Fedora, RHEL, CentOS | Produced, community-supported |

All three are produced from a single Tauri bundler run.

## Installation — `.deb` (Debian, Ubuntu, Kali, Parrot, Pop!_OS)

```bash
sudo dpkg -i sublemonable_1.0.0_amd64.deb
sudo apt-get install -f   # pull in any missing dependencies
```

## Installation — `.AppImage` (any Linux distro)

```bash
chmod +x Sublemonable_1.0.0_amd64.AppImage
./Sublemonable_1.0.0_amd64.AppImage
```

## Installation — `.rpm` (Fedora, RHEL, CentOS — community-supported)

```bash
sudo rpm -i sublemonable-1.0.0-1.x86_64.rpm
```

## Screenshot protection

Screenshot protection on Linux uses a **focus-loss blur overlay**, the same mechanism as the browser
app: when the window loses focus the message content is blurred. This is **best-effort** — Linux does
not expose a universal API to hard-block screen capture, on either Wayland or X11:

- On **X11**, any client can read the root window, so capture cannot be prevented.
- On **Wayland**, capture is mediated by the compositor and there is no standard
  `xdg-desktop-portal` (or other portable) interface an app can call to forbid screenshots of its
  window. (The portal `Inhibit` API only blocks idle/suspend/logout — not screen capture — so we do
  not use it; doing so would imply a protection it does not provide.)

If you need an OS-level hard block on message content, the Android client (`FLAG_SECURE`) is the
platform that can provide it.

## Key storage

Keys are stored via the **Secret Service API** — GNOME Keyring on GNOME desktops, KWallet on KDE.
If no Secret Service daemon is running (minimal desktops such as i3 or sway, or headless
forwarding), an Argon2id+AES-256-GCM-encrypted file is used at
`$XDG_DATA_HOME/sublemonable/vault.bin` (default `~/.local/share/sublemonable/vault.bin`).

In both cases the vault blob is **already encrypted** by `packages/crypto` (libsodium.js) before it
reaches the Rust storage layer — Rust is a storage adapter only and never performs encryption or
sees plaintext keys.

## Tor routing

v1.5 is **Tor-first**, not an opt-in toggle. On startup the app probes for a local Tor SOCKS proxy —
the tor daemon on `127.0.0.1:9050`, then Tor Browser on `127.0.0.1:9150` — and the connection-mode
badge reflects the result (a yellow dot indicates clearnet fallback is active).

Because Tauri's webview uses the system WebKit, which does not honour a process-set SOCKS5 proxy,
**actual traffic routing must be set up at the OS/process level**:

```bash
# Recommended: launch through torsocks
torsocks sublemonable

# Or export ALL_PROXY before launching
ALL_PROXY=socks5h://127.0.0.1:9050 sublemonable
```

The in-app connection-mode selector (Standard / Stealth / Ghost — already part of the web UI)
configures and verifies proxy connectivity; it does not rewrite the webview's sockets itself.

## Building from source

Prerequisites: Rust stable, Node.js 20+, pnpm 9+, plus the GTK/WebKit/libsecret dev headers:

```bash
# Debian / Ubuntu / Kali
sudo apt-get install -y libwebkit2gtk-4.1-dev libsecret-1-dev libgtk-3-dev librsvg2-dev patchelf
```

Then, from the repository root:

```bash
pnpm install
pnpm build:packages
cd apps/desktop
cargo tauri dev                              # dev window backed by the apps/web dev server
cargo tauri build --bundles deb,appimage,rpm # release packages
# Output: src-tauri/target/release/bundle/{deb,appimage,rpm}/
```

## License

[AGPL-3.0-only](../../LICENSE).
