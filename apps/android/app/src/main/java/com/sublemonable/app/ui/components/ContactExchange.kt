// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package com.sublemonable.app.ui.components

import org.json.JSONException
import org.json.JSONObject

/**
 * Contact-exchange (QR / link) payload — the shared, cross-client format used to
 * add a contact by their routing ID and identity public key.
 *
 * This is deliberately the ContactExchangePayload format, NOT a dead-drop token.
 * The dead-drop token (packages/crypto/deaddrop.ts) is a single-use anonymous
 * *messaging* capability for Ghost mode; it carries no durable identity and no
 * client parses it as a contact-add input. Using it here would invent a contact
 * protocol nothing can read. The identity/routing exchange has always been
 * ContactExchangePayload: iOS ConversationStore.ContactExchangePayload +
 * SignalManager.contactExchangePayload(), and parseContactInput below.
 */

/** Wire version string for the payload — a string "1", matching iOS. */
const val CONTACT_EXCHANGE_VERSION = "1"

/**
 * Builds this account's shareable contact payload:
 * `{"version":"1","account_id":"<uuid>","identity_key":"<base64>"}` — identical
 * in shape and field order to iOS SignalManager.contactExchangePayload(). The
 * `identityKeyBase64` must be the same bytes registered with the relay
 * (SignalProtocolManager.localIdentityPublicKeyBase64()) so a scanning peer can
 * verify the fingerprint before the first message. Pure — covered by tests.
 */
fun buildContactExchangePayload(accountId: String, identityKeyBase64: String): String =
    JSONObject().apply {
        put("version", CONTACT_EXCHANGE_VERSION)
        put("account_id", accountId.lowercase())
        put("identity_key", identityKeyBase64)
    }.toString()

/**
 * Extracts the contact's account UUID from whatever was shared:
 * - the JSON ContactExchangePayload other clients put in QR codes
 *   ({"version":"1","account_id":"<uuid>","identity_key":"<base64>"}),
 * - an invite link or any text containing a UUID,
 * - or the raw UUID itself.
 * Returns null when no UUID can be found. Pure — covered by unit tests. Scanner
 * output and pasted text are untrusted input; they only ever reach the app
 * through here, and this fails closed on anything that isn't a UUID.
 */
fun parseContactInput(input: String): String? {
    val trimmed = input.trim()
    if (trimmed.startsWith("{")) {
        try {
            val accountId = JSONObject(trimmed).optString("account_id")
            if (UUID_REGEX.matches(accountId)) return accountId.lowercase()
        } catch (_: JSONException) {
            // Fall through to the generic UUID search.
        }
    }
    return UUID_REGEX.find(trimmed)?.value?.lowercase()
}

private val UUID_REGEX = Regex(
    "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
)
