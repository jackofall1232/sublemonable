// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.net

import com.sublemonable.app.crypto.KeyStoreManager
import com.sublemonable.app.crypto.SignalProtocolManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * REST client for the Sublemonable server (server.api.endpoints).
 *
 * Auth model: JWT (15 min) + refresh token (7 days, rotated on every use).
 * Login is challenge-based — the client signs
 * "sublemonable-login:<account_id>:<unix_ts>" with its identity key, so the
 * server never holds a password and never learns anything but a public key.
 *
 * Request/response bodies are JSON. Nothing here is ever logged.
 */
class ApiClient(
    private val baseUrl: String,
    private var client: OkHttpClient,
    keyStoreManager: KeyStoreManager,
) {

    private val authPrefs = keyStoreManager.prefs(KeyStoreManager.PREFS_AUTH)

    /**
     * Observable mirror of [accountId] so the UI updates the moment
     * registration lands, without depending on some other state re-emitting.
     */
    private val _accountId = MutableStateFlow(authPrefs.getString(KEY_ACCOUNT_ID, null))
    val accountIdFlow: StateFlow<String?> = _accountId.asStateFlow()

    /**
     * [responseBody] is the server's error payload on a non-2xx response —
     * always one of the small, fixed `{"error": "<code>"}` validation codes
     * from the server's `errJSON` helper (see internal/api/handlers.go),
     * never request/response data that could contain user content. Safe to
     * surface in diagnostics.
     */
    class ApiException(val code: Int, message: String, val responseBody: String? = null) : IOException(message)

    data class SessionTokens(val accessToken: String, val refreshToken: String)

    /** Swap the transport (e.g. after toggling Tor). */
    fun updateClient(newClient: OkHttpClient) {
        client = newClient
    }

    // -- token storage (EncryptedSharedPreferences — never plaintext) ---------

    var accountId: String?
        get() = authPrefs.getString(KEY_ACCOUNT_ID, null)
        private set(value) {
            authPrefs.edit().putString(KEY_ACCOUNT_ID, value).apply()
            _accountId.value = value
        }

    val accessToken: String?
        get() = authPrefs.getString(KEY_ACCESS_TOKEN, null)

    private val refreshToken: String?
        get() = authPrefs.getString(KEY_REFRESH_TOKEN, null)

    private fun storeTokens(tokens: SessionTokens) {
        authPrefs.edit()
            .putString(KEY_ACCESS_TOKEN, tokens.accessToken)
            .putString(KEY_REFRESH_TOKEN, tokens.refreshToken)
            .apply()
    }

    fun clearTokens() {
        authPrefs.edit().remove(KEY_ACCESS_TOKEN).remove(KEY_REFRESH_TOKEN).apply()
    }

    // -- endpoints --------------------------------------------------------------

    /**
     * POST /api/v1/register — creates the account. The server receives ONLY
     * public keys; it can never learn anything else about this identity.
     */
    suspend fun register(
        identityKeyBase64: String,
        registrationId: Int,
        signedPreKey: SignalProtocolManager.SignedPreKeyDto,
        oneTimePreKeys: List<SignalProtocolManager.OneTimePreKeyDto>,
    ): String {
        val body = JSONObject().apply {
            put("identity_key", identityKeyBase64)
            put("registration_id", registrationId)
            put("signed_prekey", signedPreKey.toJson())
            put("one_time_prekeys", JSONArray().apply {
                oneTimePreKeys.forEach { put(it.toJson()) }
            })
        }
        val json = execute(post("/api/v1/register", body, authenticated = false))
        val newAccountId = json.getString("account_id")
        accountId = newAccountId
        return newAccountId
    }

    /**
     * POST /api/v1/session — authenticates via an Ed25519/XEdDSA-signed,
     * timestamped challenge: "sublemonable-login:<account_id>:<unix_ts>".
     * The timestamp bounds replay; the server validates a small clock skew.
     */
    suspend fun createSession(signChallenge: (String) -> String): SessionTokens {
        val id = accountId ?: throw ApiException(0, "Not registered")
        val unixTs = System.currentTimeMillis() / 1000L
        val challenge = loginChallenge(id, unixTs)
        val body = JSONObject().apply {
            put("account_id", id)
            put("timestamp", unixTs)
            put("signature", signChallenge(challenge))
        }
        val json = execute(post("/api/v1/session", body, authenticated = false))
        return parseTokens(json).also(::storeTokens)
    }

    /**
     * POST /api/v1/session/refresh — refresh tokens are single-use and
     * rotated on every call (critical rule: ALWAYS rotate refresh tokens).
     */
    suspend fun refreshSession(): SessionTokens {
        val current = refreshToken ?: throw ApiException(401, "No refresh token")
        val body = JSONObject().put("refresh_token", current)
        val json = execute(post("/api/v1/session/refresh", body, authenticated = false))
        return parseTokens(json).also(::storeTokens)
    }

    /** DELETE /api/v1/session — logout, invalidates both tokens. */
    suspend fun deleteSession() {
        try {
            execute(request("/api/v1/session").delete().build())
        } finally {
            clearTokens()
        }
    }

    /**
     * GET /api/v1/users/:id/prekey — fetch a one-time prekey bundle for X3DH.
     * Wire shape (server handlers.go GetPrekeyBundle): identity_key at the top
     * level, nested signed_prekey {id, public_key, signature}, and a nullable
     * nested one_time_prekey {id, public_key}.
     */
    suspend fun fetchPreKeyBundle(userId: String): SignalProtocolManager.PreKeyBundleDto {
        val json = execute(request("/api/v1/users/$userId/prekey").get().build())
        val signedPreKey = json.getJSONObject("signed_prekey")
        val oneTimePreKey = if (json.isNull("one_time_prekey")) null else json.getJSONObject("one_time_prekey")
        return SignalProtocolManager.PreKeyBundleDto(
            // The zero-knowledge server doesn't issue registration IDs (it
            // stores nothing device-identifying); a fixed value satisfies
            // libsignal's addressing in this one-device-per-account design.
            registrationId = 1,
            deviceId = 1,
            identityKeyBase64 = json.getString("identity_key"),
            signedPreKeyId = signedPreKey.getInt("id"),
            signedPreKeyBase64 = signedPreKey.getString("public_key"),
            signedPreKeySignatureBase64 = signedPreKey.getString("signature"),
            preKeyId = oneTimePreKey?.getInt("id"),
            preKeyBase64 = oneTimePreKey?.getString("public_key"),
        )
    }

    /** POST /api/v1/prekeys — upload a fresh batch of one-time prekeys. */
    suspend fun uploadPreKeys(
        oneTimePreKeys: List<SignalProtocolManager.OneTimePreKeyDto>,
        signedPreKey: SignalProtocolManager.SignedPreKeyDto? = null,
    ) {
        val body = JSONObject().apply {
            put("one_time_prekeys", JSONArray().apply {
                oneTimePreKeys.forEach { put(it.toJson()) }
            })
            signedPreKey?.let { put("signed_prekey", it.toJson()) }
        }
        execute(post("/api/v1/prekeys", body))
    }

    /** GET /api/v1/prekeys/count — server-side prekey stock. */
    suspend fun preKeyCount(): Int {
        val json = execute(request("/api/v1/prekeys/count").get().build())
        return json.getInt("count")
    }

    /** DELETE /api/v1/account — full, irreversible purge of all server data. */
    suspend fun deleteAccount() {
        try {
            execute(request("/api/v1/account").delete().build())
        } finally {
            clearTokens()
            authPrefs.edit().remove(KEY_ACCOUNT_ID).apply()
            _accountId.value = null
        }
    }

    // -- plumbing -------------------------------------------------------------------

    private fun parseTokens(json: JSONObject) = SessionTokens(
        accessToken = json.getString("access_token"),
        refreshToken = json.getString("refresh_token"),
    )

    private fun request(path: String, authenticated: Boolean = true): Request.Builder {
        val builder = Request.Builder().url(baseUrl.trimEnd('/') + path)
        if (authenticated) {
            accessToken?.let { builder.header("Authorization", "Bearer $it") }
        }
        return builder
    }

    private fun post(path: String, body: JSONObject, authenticated: Boolean = true): Request =
        request(path, authenticated)
            .post(body.toString().toRequestBody(JSON_MEDIA_TYPE))
            .build()

    private suspend fun execute(req: Request): JSONObject =
        suspendCancellableCoroutine { continuation ->
            val call = client.newCall(req)
            continuation.invokeOnCancellation { call.cancel() }
            call.enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    if (continuation.isActive) continuation.resumeWithException(e)
                }

                override fun onResponse(call: Call, response: Response) {
                    response.use {
                        val text = it.body?.string().orEmpty()
                        if (!it.isSuccessful) {
                            // Body capped defensively even though the server's
                            // error responses are always a short fixed-vocabulary
                            // code — never assume a well-behaved server.
                            if (continuation.isActive) {
                                continuation.resumeWithException(
                                    ApiException(
                                        it.code,
                                        "HTTP ${it.code}",
                                        text.take(MAX_ERROR_BODY_CHARS).ifBlank { null },
                                    ),
                                )
                            }
                            return
                        }
                        val json = if (text.isBlank()) JSONObject() else JSONObject(text)
                        if (continuation.isActive) continuation.resume(json)
                    }
                }
            })
        }

    private fun SignalProtocolManager.SignedPreKeyDto.toJson() = JSONObject().apply {
        put("id", id)
        put("public_key", publicKeyBase64)
        put("signature", signatureBase64)
        put("created_at", timestampMs)
    }

    private fun SignalProtocolManager.OneTimePreKeyDto.toJson() = JSONObject().apply {
        put("id", id)
        put("public_key", publicKeyBase64)
    }

    companion object {
        private val JSON_MEDIA_TYPE = "application/json; charset=utf-8".toMediaType()

        /** Defensive cap on the error body surfaced in [ApiException.responseBody]. */
        private const val MAX_ERROR_BODY_CHARS = 200

        private const val KEY_ACCOUNT_ID = "account_id"
        private const val KEY_ACCESS_TOKEN = "access_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"

        /**
         * The login challenge string. Pure function — covered by unit tests
         * to keep the client byte-compatible with the server's verifier.
         */
        fun loginChallenge(accountId: String, unixTs: Long): String =
            "sublemonable-login:$accountId:$unixTs"
    }
}
