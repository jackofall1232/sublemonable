// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Package pow verifies the hashcash proof-of-work a client must solve to deposit
// a dead drop. Deposit carries no authentication by design — anonymity of the
// sender depends on there being no account to present — so a CPU cost stands in
// for auth to keep anonymous deposit from being free to spam.
//
// A solution is an 8-byte nonce such that SHA-256(challenge || nonce) begins with
// `difficulty` zero bits. The challenge is the drop ID, binding the work to one
// specific deposit so it cannot be precomputed or replayed across drops.
package pow

import "crypto/sha256"

// NonceBytes is the fixed nonce length clients submit.
const NonceBytes = 8

// Verify reports whether nonce solves the puzzle for challenge at the given
// difficulty (leading zero bits).
func Verify(challenge, nonce []byte, difficulty int) bool {
	if len(nonce) != NonceBytes {
		return false
	}
	h := sha256.New()
	h.Write(challenge)
	h.Write(nonce)
	return HasLeadingZeroBits(h.Sum(nil), difficulty)
}

// HasLeadingZeroBits reports whether digest begins with at least `bits` zero bits,
// most-significant first.
func HasLeadingZeroBits(digest []byte, bits int) bool {
	remaining := bits
	for _, b := range digest {
		if remaining <= 0 {
			return true
		}
		if remaining >= 8 {
			if b != 0 {
				return false
			}
			remaining -= 8
		} else {
			return b>>(8-remaining) == 0
		}
	}
	return remaining <= 0
}
