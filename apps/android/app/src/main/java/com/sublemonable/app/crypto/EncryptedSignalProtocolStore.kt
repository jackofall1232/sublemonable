// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.crypto

import org.signal.libsignal.protocol.IdentityKey
import org.signal.libsignal.protocol.IdentityKeyPair
import org.signal.libsignal.protocol.InvalidKeyIdException
import org.signal.libsignal.protocol.NoSessionException
import org.signal.libsignal.protocol.SignalProtocolAddress
import org.signal.libsignal.protocol.groups.state.SenderKeyRecord
import org.signal.libsignal.protocol.state.IdentityKeyStore
import org.signal.libsignal.protocol.state.KyberPreKeyRecord
import org.signal.libsignal.protocol.state.PreKeyRecord
import org.signal.libsignal.protocol.state.SessionRecord
import org.signal.libsignal.protocol.state.SignalProtocolStore
import org.signal.libsignal.protocol.state.SignedPreKeyRecord
import java.util.UUID

/**
 * [SignalProtocolStore] persisted exclusively through EncryptedSharedPreferences
 * (Android-Keystore-wrapped AES-256). Every record — identity key pair,
 * prekeys, signed prekeys, ratchet session state — is encrypted at rest;
 * nothing key-shaped ever touches disk in plaintext.
 */
class EncryptedSignalProtocolStore(
    private val keyStoreManager: KeyStoreManager,
) : SignalProtocolStore {

    private val prefs = keyStoreManager.prefs(KeyStoreManager.PREFS_SIGNAL_STORE)

    // -- local identity -----------------------------------------------------

    fun hasLocalIdentity(): Boolean = prefs.contains(KEY_IDENTITY)

    fun setLocalIdentity(identityKeyPair: IdentityKeyPair, registrationId: Int) {
        keyStoreManager.putBytes(prefs, KEY_IDENTITY, identityKeyPair.serialize())
        prefs.edit().putInt(KEY_REGISTRATION_ID, registrationId).apply()
    }

    override fun getIdentityKeyPair(): IdentityKeyPair {
        val bytes = keyStoreManager.getBytes(prefs, KEY_IDENTITY)
            ?: error("Identity key pair not yet generated")
        return IdentityKeyPair(bytes)
    }

    override fun getLocalRegistrationId(): Int =
        prefs.getInt(KEY_REGISTRATION_ID, 0)

    // -- remote identities --------------------------------------------------

    override fun saveIdentity(address: SignalProtocolAddress, identityKey: IdentityKey): Boolean {
        val key = remoteIdentityKey(address)
        val existing = keyStoreManager.getBytes(prefs, key)
        keyStoreManager.putBytes(prefs, key, identityKey.serialize())
        // true == replaced a DIFFERENT pre-existing identity (key change!)
        return existing != null && !existing.contentEquals(identityKey.serialize())
    }

    override fun isTrustedIdentity(
        address: SignalProtocolAddress,
        identityKey: IdentityKey,
        direction: IdentityKeyStore.Direction,
    ): Boolean {
        val existing = keyStoreManager.getBytes(prefs, remoteIdentityKey(address))
            ?: return true // trust-on-first-use; verification happens via safety numbers
        return existing.contentEquals(identityKey.serialize())
    }

    override fun getIdentity(address: SignalProtocolAddress): IdentityKey? =
        keyStoreManager.getBytes(prefs, remoteIdentityKey(address))?.let { IdentityKey(it) }

    // -- one-time prekeys ---------------------------------------------------

    override fun loadPreKey(preKeyId: Int): PreKeyRecord {
        val bytes = keyStoreManager.getBytes(prefs, "$KEY_PREKEY$preKeyId")
            ?: throw InvalidKeyIdException("No prekey with id $preKeyId")
        return PreKeyRecord(bytes)
    }

    override fun storePreKey(preKeyId: Int, record: PreKeyRecord) {
        keyStoreManager.putBytes(prefs, "$KEY_PREKEY$preKeyId", record.serialize())
    }

    override fun containsPreKey(preKeyId: Int): Boolean =
        prefs.contains("$KEY_PREKEY$preKeyId")

    /** One-time prekeys are single-use by design — consumed, then deleted. */
    override fun removePreKey(preKeyId: Int) {
        prefs.edit().remove("$KEY_PREKEY$preKeyId").apply()
    }

    // -- signed prekeys -----------------------------------------------------

    override fun loadSignedPreKey(signedPreKeyId: Int): SignedPreKeyRecord {
        val bytes = keyStoreManager.getBytes(prefs, "$KEY_SIGNED_PREKEY$signedPreKeyId")
            ?: throw InvalidKeyIdException("No signed prekey with id $signedPreKeyId")
        return SignedPreKeyRecord(bytes)
    }

    override fun loadSignedPreKeys(): List<SignedPreKeyRecord> =
        prefs.all.keys
            .filter { it.startsWith(KEY_SIGNED_PREKEY) }
            .mapNotNull { keyStoreManager.getBytes(prefs, it) }
            .map { SignedPreKeyRecord(it) }

    override fun storeSignedPreKey(signedPreKeyId: Int, record: SignedPreKeyRecord) {
        keyStoreManager.putBytes(prefs, "$KEY_SIGNED_PREKEY$signedPreKeyId", record.serialize())
    }

    override fun containsSignedPreKey(signedPreKeyId: Int): Boolean =
        prefs.contains("$KEY_SIGNED_PREKEY$signedPreKeyId")

    override fun removeSignedPreKey(signedPreKeyId: Int) {
        prefs.edit().remove("$KEY_SIGNED_PREKEY$signedPreKeyId").apply()
    }

    // -- sessions -------------------------------------------------------------

    override fun loadSession(address: SignalProtocolAddress): SessionRecord? =
        keyStoreManager.getBytes(prefs, sessionKey(address))?.let { SessionRecord(it) }

    override fun loadExistingSessions(
        addresses: List<SignalProtocolAddress>,
    ): List<SessionRecord> = addresses.map { address ->
        loadSession(address) ?: throw NoSessionException("No session for $address")
    }

    override fun getSubDeviceSessions(name: String): List<Int> =
        prefs.all.keys
            .filter { it.startsWith("$KEY_SESSION$name:") }
            .mapNotNull { it.substringAfterLast(':').toIntOrNull() }
            .filter { it != DEFAULT_DEVICE_ID }

    override fun storeSession(address: SignalProtocolAddress, record: SessionRecord) {
        keyStoreManager.putBytes(prefs, sessionKey(address), record.serialize())
    }

    override fun containsSession(address: SignalProtocolAddress): Boolean =
        prefs.contains(sessionKey(address))

    override fun deleteSession(address: SignalProtocolAddress) {
        prefs.edit().remove(sessionKey(address)).apply()
    }

    override fun deleteAllSessions(name: String) {
        val editor = prefs.edit()
        prefs.all.keys
            .filter { it.startsWith("$KEY_SESSION$name:") }
            .forEach(editor::remove)
        editor.apply()
    }

    // -- Kyber prekeys (post-quantum, required by the store interface) --------

    override fun loadKyberPreKey(kyberPreKeyId: Int): KyberPreKeyRecord {
        val bytes = keyStoreManager.getBytes(prefs, "$KEY_KYBER_PREKEY$kyberPreKeyId")
            ?: throw InvalidKeyIdException("No kyber prekey with id $kyberPreKeyId")
        return KyberPreKeyRecord(bytes)
    }

    override fun loadKyberPreKeys(): List<KyberPreKeyRecord> =
        prefs.all.keys
            .filter { it.startsWith(KEY_KYBER_PREKEY) }
            .mapNotNull { keyStoreManager.getBytes(prefs, it) }
            .map { KyberPreKeyRecord(it) }

    override fun storeKyberPreKey(kyberPreKeyId: Int, record: KyberPreKeyRecord) {
        keyStoreManager.putBytes(prefs, "$KEY_KYBER_PREKEY$kyberPreKeyId", record.serialize())
    }

    override fun containsKyberPreKey(kyberPreKeyId: Int): Boolean =
        prefs.contains("$KEY_KYBER_PREKEY$kyberPreKeyId")

    override fun markKyberPreKeyUsed(kyberPreKeyId: Int) {
        prefs.edit().putBoolean("$KEY_KYBER_USED$kyberPreKeyId", true).apply()
    }

    // -- sender keys (groups — phase 2; interface requires the methods) -------

    override fun storeSenderKey(
        sender: SignalProtocolAddress,
        distributionId: UUID,
        record: SenderKeyRecord,
    ) {
        keyStoreManager.putBytes(prefs, senderKeyKey(sender, distributionId), record.serialize())
    }

    override fun loadSenderKey(
        sender: SignalProtocolAddress,
        distributionId: UUID,
    ): SenderKeyRecord? =
        keyStoreManager.getBytes(prefs, senderKeyKey(sender, distributionId))
            ?.let { SenderKeyRecord(it) }

    // -- misc -----------------------------------------------------------------

    fun countOneTimePreKeys(): Int =
        prefs.all.keys.count { it.startsWith(KEY_PREKEY) }

    /** Full local wipe — account deletion. Irreversible by design. */
    fun wipe() {
        prefs.edit().clear().apply()
    }

    private fun remoteIdentityKey(address: SignalProtocolAddress) =
        "$KEY_REMOTE_IDENTITY${address.name}:${address.deviceId}"

    private fun sessionKey(address: SignalProtocolAddress) =
        "$KEY_SESSION${address.name}:${address.deviceId}"

    private fun senderKeyKey(sender: SignalProtocolAddress, distributionId: UUID) =
        "$KEY_SENDER_KEY${sender.name}:${sender.deviceId}:$distributionId"

    companion object {
        const val DEFAULT_DEVICE_ID = 1

        private const val KEY_IDENTITY = "identity_keypair"
        private const val KEY_REGISTRATION_ID = "registration_id"
        private const val KEY_REMOTE_IDENTITY = "remote_identity:"
        private const val KEY_PREKEY = "prekey:"
        private const val KEY_SIGNED_PREKEY = "signed_prekey:"
        private const val KEY_SESSION = "session:"
        private const val KEY_KYBER_PREKEY = "kyber_prekey:"
        private const val KEY_KYBER_USED = "kyber_prekey_used:"
        private const val KEY_SENDER_KEY = "sender_key:"
    }
}
