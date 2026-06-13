# Sublemonable — Linux Desktop

A native Linux desktop build of Sublemonable, packaged with [Tauri v2](https://tauri.app).
Tauri was chosen over Electron deliberately: **no bundled Chromium**, a small Rust backend, and a
much smaller attack surface. The UI is the exact same React app as the browser client
([`apps/web`](../web)) — it is **not** duplicated here. This crate adds only the three things a
browser cannot do:

1. **OS-level screenshot inhibit** (Wayland hard block / X11 best-effort)
2. **libsecret keystore** (GNOME Keyring / KWallet) with an encrypted file fallback
3. **Tor-first SOCKS5 detection**

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

- **Wayland (GNOME Shell, KDE Plasma):** a **hard block** via `xdg-desktop-portal` — equivalent to
  Android `FLAG_SECURE`. This is the recommended environment for the strongest protection.
- **X11:** **best-effort only.** X11 has no mechanism that can prevent screen capture — any client
  can read the root window — so we are honest about it: the focus-loss blur overlay (the same one the
  web client uses) is the protection you get on X11. Prefer a Wayland session for confidential use.

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
