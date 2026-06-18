// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

//! Secure key-vault storage for the Linux desktop app.
//!
//! On the web the encrypted keystore lives in IndexedDB; on desktop it lives in
//! the Secret Service (GNOME Keyring / KWallet) with a file fallback for
//! minimal desktops (i3, sway, headless-with-forwarding).
//!
//! IMPORTANT: this module performs **no encryption**. It is a storage adapter
//! only. The blob it receives is already Argon2id-derived-key + AES-256-GCM
//! encrypted by `packages/crypto` (libsodium.js) before it crosses the Tauri
//! `invoke()` boundary. Rust stores and retrieves opaque bytes — defence in
//! depth, never the primary encryption layer.
//!
//! TODO(multi-vault): the web client currently uses a single-blob keystore
//! (one Argon2id salt + one AES-256-GCM blob). When the plausible-deniability
//! multi-vault wiring in `packages/crypto/vault.ts` is eventually wired into
//! `apps/web/src/lib/storage.ts` (see docs/V1_5_STATUS.md), it will use a
//! fixed-size, padded per-slot blob store. At that point these commands must be
//! updated to store the per-slot blobs at a constant, slot-count-hiding size so
//! the desktop backend cannot leak the number of vaults either.

use secret_service::blocking::SecretService;
use secret_service::EncryptionType;
use std::collections::HashMap;
use std::io::ErrorKind;
use std::path::PathBuf;
use zeroize::Zeroize;

/// Collection / label / attribute constants for the Secret Service item.
const COLLECTION_LABEL: &str = "Sublemonable";
const ITEM_LABEL: &str = "sublemonable-vault";
const ATTR_APPLICATION: &str = "application";
const ATTR_APPLICATION_VALUE: &str = "sublemonable";
const CONTENT_TYPE: &str = "application/octet-stream";

/// Owned secret bytes that zero themselves on drop. Used so the encrypted blob
/// does not linger in freed heap memory longer than necessary.
struct SecretBytes(Vec<u8>);

impl Drop for SecretBytes {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

/// Path to the file-fallback vault: `$XDG_DATA_HOME/sublemonable/vault.bin`
/// (falling back to `~/.local/share/...` via the `dirs` crate).
fn fallback_path() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or_else(|| "no XDG data dir available".to_string())?;
    Ok(base.join("sublemonable").join("vault.bin"))
}

fn attributes() -> HashMap<&'static str, &'static str> {
    let mut attrs = HashMap::new();
    attrs.insert(ATTR_APPLICATION, ATTR_APPLICATION_VALUE);
    attrs
}

// ── File fallback (only used when Secret Service is unavailable) ──────────────

fn file_store(blob: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let path = fallback_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Write to a sibling temp file, then atomically rename over the target.
    // This avoids two failure modes at once:
    //   • permissions race — the temp file is created with mode 0600, so the
    //     vault is never briefly world/group-readable;
    //   • torn write — a crash or power loss mid-write cannot corrupt the live
    //     vault, since rename is atomic and the old file stays intact until then.
    let tmp = path.with_extension("bin.tmp");

    #[cfg(unix)]
    let mut file = {
        use std::os::unix::fs::OpenOptionsExt;
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&tmp)
            .map_err(|e| e.to_string())?
    };
    #[cfg(not(unix))]
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&tmp)
        .map_err(|e| e.to_string())?;

    let write_result = file
        .write_all(blob)
        .and_then(|()| file.sync_all())
        .map_err(|e| e.to_string());
    if let Err(e) = write_result {
        let _ = std::fs::remove_file(&tmp);
        return Err(e);
    }
    drop(file);

    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        e.to_string()
    })?;
    tracing::debug!("vault stored via file fallback");
    Ok(())
}

fn file_load() -> Result<Option<Vec<u8>>, String> {
    let path = fallback_path()?;
    match std::fs::read(&path) {
        Ok(bytes) => {
            tracing::debug!("vault loaded via file fallback");
            Ok(Some(bytes))
        }
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn file_delete() -> Result<(), String> {
    let path = fallback_path()?;
    match std::fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// ── Secret Service (primary) ──────────────────────────────────────────────────
//
// Each call opens a short-lived blocking session on a background thread (the
// secret-service blocking API is synchronous). The default collection is used
// and unlocked on demand.

fn ss_store(blob: &[u8]) -> Result<(), String> {
    let ss = SecretService::connect(EncryptionType::Dh).map_err(|e| e.to_string())?;
    let collection = ss.get_default_collection().map_err(|e| e.to_string())?;
    if collection.is_locked().map_err(|e| e.to_string())? {
        collection.unlock().map_err(|e| e.to_string())?;
    }
    collection
        .create_item(
            ITEM_LABEL,
            attributes(),
            blob,
            true, // replace existing
            CONTENT_TYPE,
        )
        .map_err(|e| e.to_string())?;
    tracing::debug!(collection = COLLECTION_LABEL, "vault stored via Secret Service");
    Ok(())
}

fn ss_load() -> Result<Option<Vec<u8>>, String> {
    let ss = SecretService::connect(EncryptionType::Dh).map_err(|e| e.to_string())?;
    let items = ss.search_items(attributes()).map_err(|e| e.to_string())?;
    let found = items.unlocked.into_iter().next().or_else(|| items.locked.into_iter().next());
    match found {
        Some(item) => {
            item.unlock().map_err(|e| e.to_string())?;
            let secret = item.get_secret().map_err(|e| e.to_string())?;
            tracing::debug!("vault loaded via Secret Service");
            Ok(Some(secret))
        }
        None => Ok(None),
    }
}

fn ss_delete() -> Result<(), String> {
    let ss = SecretService::connect(EncryptionType::Dh).map_err(|e| e.to_string())?;
    let items = ss.search_items(attributes()).map_err(|e| e.to_string())?;
    for item in items.unlocked.into_iter().chain(items.locked.into_iter()) {
        item.unlock().map_err(|e| e.to_string())?;
        item.delete().map_err(|e| e.to_string())?;
    }
    tracing::debug!("vault deleted via Secret Service");
    Ok(())
}

// ── Tauri commands ────────────────────────────────────────────────────────────
//
// The blocking Secret Service work is moved off the async runtime with
// spawn_blocking. Errors never include the blob — only the error string.

/// Store the encrypted vault blob. Tries Secret Service first, then falls back
/// to an encrypted-at-rest file if no Secret Service daemon is reachable.
#[tauri::command]
pub async fn store_vault(blob: Vec<u8>) -> Result<(), String> {
    let secret = SecretBytes(blob);
    tokio::task::spawn_blocking(move || match ss_store(&secret.0) {
        Ok(()) => Ok(()),
        Err(e) => {
            tracing::debug!(error = %e, "Secret Service store failed; using file fallback");
            file_store(&secret.0)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Load the encrypted vault blob, or `None` if none has been stored yet.
#[tauri::command]
pub async fn load_vault() -> Result<Option<Vec<u8>>, String> {
    tokio::task::spawn_blocking(|| match ss_load() {
        Ok(Some(blob)) => Ok(Some(blob)),
        // Secret Service reachable but empty: the vault may have been written to
        // the file fallback in an earlier session where no daemon was running
        // (e.g. the keyring only started later). Consult the file before
        // concluding there is no account, so the user can still unlock.
        Ok(None) => file_load(),
        Err(e) => {
            tracing::debug!(error = %e, "Secret Service load failed; using file fallback");
            file_load()
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Delete the vault from both backends (account-deletion / panic-wipe flow).
#[tauri::command]
pub async fn delete_vault() -> Result<(), String> {
    tokio::task::spawn_blocking(|| {
        // Attempt both so a daemon that appeared/disappeared between writes
        // never leaves a stray copy behind.
        let ss = ss_delete();
        let file = file_delete();
        match (ss, file) {
            (Ok(()), Ok(())) => Ok(()),
            // If Secret Service is simply unavailable, the file result governs.
            (Err(e), Ok(())) => {
                tracing::debug!(error = %e, "Secret Service delete failed; file fallback cleared");
                Ok(())
            }
            (_, Err(e)) => Err(e),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
