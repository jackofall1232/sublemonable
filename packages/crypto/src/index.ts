// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// ⚠️ This implementation has not undergone third-party security audit.
// See AUDIT.md in the repository root.

export { ready } from "./sodium.js";
export { toBase64, fromBase64, utf8Encode, utf8Decode } from "./encoding.js";
export {
  generateIdentityKeyPair,
  generateSignedPrekey,
  generateOneTimePrekeys,
  verifySignedPrekey,
  identityKeyToX25519,
  signWithIdentity,
  safetyNumber,
  type IdentityKeyPair,
  type SignedPrekey,
  type OneTimePrekey,
} from "./keys.js";
export {
  deriveKeyFromPassword,
  generateSalt,
  hkdf,
  ARGON2ID_PARAMS,
  SALT_BYTES,
  MASTER_KEY_BYTES,
} from "./kdf.js";
export { aeadEncrypt, aeadDecrypt, NONCE_BYTES } from "./aead.js";
export {
  x3dhInitiate,
  x3dhRespond,
  type DecodedPreKeyBundle,
  type X3DHInitiationResult,
} from "./x3dh.js";
export {
  ratchetEncrypt,
  ratchetDecrypt,
  initRatchetAsInitiator,
  initRatchetAsResponder,
  type RatchetSession,
  type EncryptedMessage,
} from "./ratchet.js";
export { encryptKeyStore, decryptKeyStore, type KeyStore } from "./keystore.js";
export {
  generateInvisibleWatermark,
  embedWatermarkBits,
  extractWatermarkBits,
  decodeWatermarkPayload,
  type WatermarkPayload,
} from "./watermark.js";

// ── v1.5: the security onion ─────────────────────────────────────────────────
export {
  createVaultSlots,
  addVaultSlot,
  tryPassphrase,
  sealSlot,
  randomSlot,
  randomBytes,
  wipe,
  SLOT_COUNT,
  WRAPPED_KEY_BYTES,
  VAULT_KEY_BYTES,
  type KeySlot,
  type VaultUnlock,
  type KeyDeriver,
} from "./vault.js";
export { pad, unpad, paddedBlockCount, BLOCK_BYTES } from "./padding.js";
export {
  generateDropToken,
  dropIdFromToken,
  solveProofOfWork,
  verifyProofOfWork,
  hasLeadingZeroBits,
  DROP_TOKEN_BYTES,
  DEFAULT_POW_DIFFICULTY,
  type DropCredentials,
} from "./deaddrop.js";
export {
  generateRelayKeyPair,
  buildOnion,
  peelOnion,
  type RelayKeyPair,
  type OnionHop,
  type PeeledLayer,
} from "./onion.js";
export { sealTo, openSealed } from "./sealedbox.js";
