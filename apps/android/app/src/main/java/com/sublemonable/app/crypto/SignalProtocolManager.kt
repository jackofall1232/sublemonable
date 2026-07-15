// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.crypto

import android.util.Base64
import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.SessionBuilder
import org.signal.libsignal.protocol.SessionCipher
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.ecc.Curve
import org.signal.libsignal.protocol.ecc.ECPublicKey
import org.signal.libsignal.protocol.message.CiphertextMessage
import org.signal.libsignal.protocol.message.PreKeySignalMessage
import org.signal.libsignal.protocol.message.SignalMessage
import org.signal.libsignal.protocol.state.PreKeyBundle
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SignedPreKeyRecord
import java.security.SecureRandom

/**
 * Wraps libsignal-client: identity generation, prekey generation/rotation,
 * X3DH session establishment from a fetched prekey bundle, and per-message
 * Double Ratchet encrypt/decrypt.
 *
 * All key material is held by [EncryptedSignalProtocolStore] — encrypted at
 * rest behind the Android Keystore. Nothing here logs, and nothing here ever
 * returns private key bytes to callers.
 */
class SignalProtocolManager(
    private val store: EncryptedSignalProtocolStore,
    keyStoreManager: KeyStoreManager,
) {

    /** Counter bookkeeping shares the encrypted signal store file. */
    private val prefs = keyStoreManager.prefs(KeyStoreManager.PREFS_SIGNAL_STORE)

    // -- DTOs (what crosses the network — PUBLIC keys only) ------------------

    data class SignedPreKeyDto(
        val id: Int,
        val publicKeyBase64: String,
        val signatureBase64: String,
        val timestampMs: Long,
    )

    data class OneTimePreKeyDto(
        val id: Int,
        val publicKeyBase64: String,
    )

    data class PreKeyBundleDto(
        val registrationId: Int,
        val deviceId: Int,
        val identityKeyBase64: String,
        val signedPreKeyId: Int,
        val signedPreKeyBase64: String,
        val signedPreKeySignatureBase64: String,
        /** One-time prekey — may be null when the contact's stock ran out. */
        val preKeyId: Int?,
        val preKeyBase64: String?,
    )

    data class EncryptResult(
        val ciphertextBase64: String,
        /** Base64 X3DH base key — present only on prekey (first) messages. */
        val ephemeralKeyBase64: String?,
        /** One-time prekey consumed — present only on prekey messages. */
        val preKeyId: Int?,
        /** Double Ratchet counter for the envelope. */
        val messageNumber: Int,
    )

    // -- identity -------------------------------------------------------------

    /** Generates the long-term identity on first launch. Idempotent. */
    fun ensureIdentity() {
        if (store.hasLocalIdentity()) return
        val identityKeyPair = IdentityKeyPair.generate()
        // 14-bit registration id per the Signal spec (1..16380).
        val registrationId = SecureRandom().nextInt(16380) + 1
        store.setLocalIdentity(identityKeyPair, registrationId)
    }

    fun localRegistrationId(): Int = store.getLocalRegistrationId()

    // Registration wire format is the raw 32-byte Curve25519 key (no libsignal
    // DJB type-prefix byte) — see server internal/api/handlers.go registerRequest,
    // which validates len(identity_key) == ed25519.PublicKeySize (32). serialize()
    // would produce a 33-byte, 0x05-prefixed value and get rejected as bad_identity_key.
    fun localIdentityPublicKeyBase64(): String {
        val identityKey = store.getIdentityKeyPair().publicKey
        return encode(identityKey.publicKey.getPublicKeyBytes())
    }

    // Raw 32-byte form — matches localIdentityPublicKeyBase64() above, and the
    // wire representation contacts receive via ContactExchangePayload / the
    // server, so safetyNumberWith()/localFingerprint() compare the same byte
    // representation on both sides (review: Gemini/Copilot/Codex on PR #21).
    fun localIdentityPublicKeyBytes(): ByteArray =
        store.getIdentityKeyPair().publicKey.publicKey.getPublicKeyBytes()

    /**
     * Signs the timestamped login challenge with the identity key (XEdDSA
     * over the Curve25519 identity key). Challenge format is defined by the
     * server contract: "sublemonable-login:<account_id>:<unix_ts>".
     */
    fun signLoginChallenge(challenge: String): String {
        val signature = store.getIdentityKeyPair().privateKey
            .calculateSignature(challenge.toByteArray(Charsets.UTF_8))
        return encode(signature)
    }

    // -- prekeys ----------------------------------------------------------------

    /**
     * Generates (or rotates) the signed prekey. Rotation cadence is 7 days
     * (security.encryption.key_types.signed_prekey).
     */
    fun generateSignedPreKey(): SignedPreKeyDto {
        val id = nextId(KEY_NEXT_SIGNED_PREKEY_ID)
        val keyPair = Curve.generateKeyPair()
        // Sign the standard libsignal serialize() form (33 bytes, DJB
        // type-prefixed), NOT the raw 32-byte wire form uploaded below.
        // SessionBuilder.process() on a receiving peer reconstructs an
        // ECPublicKey from the bundle and verifies the signature against
        // ITS serialize() output, so the signed message must stay in that
        // representation for peer-to-peer X3DH to work (review: Codex on
        // PR #21). The wire `public_key` can still be the raw 32-byte form
        // the server requires — establishSession() below re-derives the
        // same 33-byte point from it before verification, and a future
        // server-side signature check must do the same reconstruction
        // rather than verifying against the raw bytes directly.
        val signature = Curve.calculateSignature(
            store.getIdentityKeyPair().privateKey,
            keyPair.publicKey.serialize(),
        )
        val timestamp = System.currentTimeMillis()
        store.storeSignedPreKey(id, SignedPreKeyRecord(id, timestamp, keyPair, signature))
        prefs.edit().putLong(KEY_SIGNED_PREKEY_CREATED_AT, timestamp).apply()
        return SignedPreKeyDto(
            id = id,
            publicKeyBase64 = encode(keyPair.publicKey.getPublicKeyBytes()),
            signatureBase64 = encode(signature),
            timestampMs = timestamp,
        )
    }

    /** Returns a fresh signed prekey when the current one is older than 7 days. */
    fun rotateSignedPreKeyIfNeeded(): SignedPreKeyDto? {
        val createdAt = prefs.getLong(KEY_SIGNED_PREKEY_CREATED_AT, 0L)
        val age = System.currentTimeMillis() - createdAt
        return if (createdAt == 0L || age >= SIGNED_PREKEY_MAX_AGE_MS) generateSignedPreKey() else null
    }

    /**
     * Generates a batch of one-time prekeys (default 100 — the upload batch
     * size from security.encryption.key_types.one_time_prekeys). Private
     * halves stay in the encrypted store; only public halves are returned.
     */
    fun generateOneTimePreKeys(count: Int = ONE_TIME_PREKEY_BATCH): List<OneTimePreKeyDto> =
        (0 until count).map {
            val id = nextId(KEY_NEXT_PREKEY_ID)
            val keyPair = Curve.generateKeyPair()
            store.storePreKey(id, PreKeyRecord(id, keyPair))
            OneTimePreKeyDto(id = id, publicKeyBase64 = encode(keyPair.publicKey.getPublicKeyBytes()))
        }

    fun localOneTimePreKeyCount(): Int = store.countOneTimePreKeys()

    // -- sessions (X3DH + Double Ratchet) ----------------------------------------

    fun hasSession(remoteAccountId: String): Boolean =
        store.containsSession(address(remoteAccountId))

    /**
     * X3DH: establishes an outbound session from a prekey bundle fetched via
     * GET /api/v1/users/:id/prekey. After this, [encrypt] produces a
     * PreKeySignalMessage until the first round trip completes the ratchet.
     *
     * The bundle's keys are the server's raw 32-byte wire form (no DJB
     * type-prefix byte — see localIdentityPublicKeyBase64()), so they're
     * decoded via [ECPublicKey.fromPublicKeyBytes], NOT [Curve.decodePoint]/
     * [IdentityKey]'s byte-array constructor, both of which expect libsignal's
     * type-prefixed serialize() form. Getting this wrong would silently break
     * every first message to a newly registered peer (review: Codex on PR #21).
     */
    fun establishSession(remoteAccountId: String, bundle: PreKeyBundleDto) {
        val preKeyBundle = PreKeyBundle(
            bundle.registrationId,
            bundle.deviceId,
            bundle.preKeyId ?: -1,
            bundle.preKeyBase64?.let { ECPublicKey.fromPublicKeyBytes(decode(it)) },
            bundle.signedPreKeyId,
            ECPublicKey.fromPublicKeyBytes(decode(bundle.signedPreKeyBase64)),
            decode(bundle.signedPreKeySignatureBase64),
            IdentityKey(ECPublicKey.fromPublicKeyBytes(decode(bundle.identityKeyBase64))),
        )
        SessionBuilder(store, address(remoteAccountId)).process(preKeyBundle)
    }

    /** Encrypts plaintext for [remoteAccountId] via the session cipher. */
    fun encrypt(remoteAccountId: String, plaintext: ByteArray): EncryptResult {
        val cipher = SessionCipher(store, address(remoteAccountId))
        val message = cipher.encrypt(plaintext)
        return when (message.type) {
            CiphertextMessage.PREKEY_TYPE -> {
                val preKeyMessage = PreKeySignalMessage(message.serialize())
                EncryptResult(
                    ciphertextBase64 = encode(message.serialize()),
                    ephemeralKeyBase64 = encode(preKeyMessage.baseKey.serialize()),
                    preKeyId = if (preKeyMessage.preKeyId.isPresent) {
                        preKeyMessage.preKeyId.get()
                    } else {
                        null
                    },
                    messageNumber = preKeyMessage.whisperMessage.counter,
                )
            }
            else -> {
                val signalMessage = SignalMessage(message.serialize())
                EncryptResult(
                    ciphertextBase64 = encode(message.serialize()),
                    ephemeralKeyBase64 = null,
                    preKeyId = null,
                    messageNumber = signalMessage.counter,
                )
            }
        }
    }

    /**
     * Decrypts an inbound envelope. Prekey (first) messages — identified by a
     * non-null ephemeral_key on the envelope — implicitly perform the X3DH
     * response and consume the one-time prekey, which is then deleted
     * (one-time prekeys are single-use by design).
     */
    fun decrypt(
        remoteAccountId: String,
        ciphertextBase64: String,
        isPreKeyMessage: Boolean,
    ): ByteArray {
        val cipher = SessionCipher(store, address(remoteAccountId))
        val bytes = decode(ciphertextBase64)
        return if (isPreKeyMessage) {
            cipher.decrypt(PreKeySignalMessage(bytes))
        } else {
            cipher.decrypt(SignalMessage(bytes))
        }
    }

    fun endSession(remoteAccountId: String) {
        store.deleteAllSessions(remoteAccountId)
    }

    // -- verification --------------------------------------------------------------

    /** Shared safety number with a contact — render in JetBrains Mono. */
    fun safetyNumberWith(contactIdentityKeyBase64: String): String =
        SafetyNumber.compute(localIdentityPublicKeyBytes(), decode(contactIdentityKeyBase64))

    /** Fingerprint of our own identity key (settings screen). */
    fun localFingerprint(): String =
        SafetyNumber.fingerprintOf(localIdentityPublicKeyBytes())

    // -- internals -------------------------------------------------------------------

    private fun address(accountId: String) =
        SignalProtocolAddress(accountId, EncryptedSignalProtocolStore.DEFAULT_DEVICE_ID)

    @Synchronized
    private fun nextId(counterKey: String): Int {
        val next = prefs.getInt(counterKey, 1)
        // Wrap long before Integer.MAX_VALUE; ids only need short-term uniqueness.
        val following = if (next >= 0xFFFFFF) 1 else next + 1
        prefs.edit().putInt(counterKey, following).apply()
        return next
    }

    private fun encode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.NO_WRAP)

    private fun decode(value: String): ByteArray =
        Base64.decode(value, Base64.NO_WRAP)

    companion object {
        const val ONE_TIME_PREKEY_BATCH = 100

        /** Prekey stock threshold below which the client uploads a new batch. */
        const val PREKEY_LOW_WATER_MARK = 20

        /** Signed prekey rotates every 7 days. */
        const val SIGNED_PREKEY_MAX_AGE_MS = 7L * 24 * 60 * 60 * 1000

        private const val KEY_NEXT_PREKEY_ID = "next_prekey_id"
        private const val KEY_NEXT_SIGNED_PREKEY_ID = "next_signed_prekey_id"
        private const val KEY_SIGNED_PREKEY_CREATED_AT = "signed_prekey_created_at"
    }
}
