// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// IndexedDB persistence. The ONLY things stored are the Argon2id salt and the
// AES-256-GCM-encrypted keystore blob — never plaintext keys, never messages.

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "sublemonable";
const STORE = "vault";

interface VaultRecord {
  salt: Uint8Array;
  blob: Uint8Array;
}

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
  return (await db()).get(STORE, "keystore");
}

export async function saveVault(salt: Uint8Array, blob: Uint8Array): Promise<void> {
  await (await db()).put(STORE, { salt, blob } satisfies VaultRecord, "keystore");
}

export async function destroyVault(): Promise<void> {
  await (await db()).delete(STORE, "keystore");
}
