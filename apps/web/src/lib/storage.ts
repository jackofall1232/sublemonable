// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Vault persistence. The ONLY things stored are the Argon2id salt and the
// AES-256-GCM-encrypted keystore blob — never plaintext keys, never messages.
//
// Two backends, selected at runtime:
//   • Browser (default): IndexedDB.
//   • Desktop (Tauri):   the Rust keystore commands (libsecret with a file
//     fallback). The desktop backend is a storage adapter only — the bytes it
//     receives are already Argon2id+AES-256-GCM encrypted here, exactly the
//     same bytes that would otherwise go to IndexedDB. Rust never decrypts.

import { openDB, type IDBPDatabase } from "idb";
import { isTauri } from "@sublemonable/crypto";

const DB_NAME = "sublemonable";
const STORE = "vault";

interface VaultRecord {
  salt: Uint8Array;
  blob: Uint8Array;
}

// ── Tauri desktop backend ────────────────────────────────────────────────────
//
// The Tauri keystore commands store a single opaque blob, so the salt and the
// encrypted keystore are framed together as [u32 BE saltLen][salt][blob] and
// unframed on load. This keeps the Rust side a pure byte store with no
// knowledge of the structure (and nothing to weaken the encryption).

interface TauriGlobal {
  core: { invoke: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T> };
}

function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  if (!tauri) throw new Error("Tauri runtime unavailable");
  return tauri.core.invoke<T>(cmd, args);
}

function frameVault(salt: Uint8Array, blob: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + salt.length + blob.length);
  new DataView(out.buffer).setUint32(0, salt.length, false);
  out.set(salt, 4);
  out.set(blob, 4 + salt.length);
  return out;
}

function unframeVault(framed: Uint8Array): VaultRecord {
  const saltLen = new DataView(framed.buffer, framed.byteOffset, framed.byteLength).getUint32(
    0,
    false,
  );
  const salt = framed.slice(4, 4 + saltLen);
  const blob = framed.slice(4 + saltLen);
  return { salt, blob };
}

// ── IndexedDB browser backend ────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore(STORE);
    },
  });
  return dbPromise;
}

export async function loadVault(): Promise<VaultRecord | undefined> {
  if (isTauri()) {
    const framed = await tauriInvoke<number[] | null>("load_vault");
    return framed ? unframeVault(new Uint8Array(framed)) : undefined;
  }
  return (await db()).get(STORE, "keystore");
}

export async function saveVault(salt: Uint8Array, blob: Uint8Array): Promise<void> {
  if (isTauri()) {
    await tauriInvoke("store_vault", { blob: Array.from(frameVault(salt, blob)) });
    return;
  }
  await (await db()).put(STORE, { salt, blob } satisfies VaultRecord, "keystore");
}

export async function destroyVault(): Promise<void> {
  if (isTauri()) {
    await tauriInvoke("delete_vault");
    return;
  }
  await (await db()).delete(STORE, "keystore");
}
