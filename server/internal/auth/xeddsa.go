// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package auth

import (
	"crypto/ed25519"

	"filippo.io/edwards25519/field"
)

// VerifyXEdDSA verifies an XEdDSA signature — the Curve25519-based signing
// scheme used by libsignal-client's IdentityKeyPair/Curve.calculateSignature
// (https://moderncrypto.org/mail-archive/curves/2014/000205.html). This is
// what Android/iOS clients sign with (identity keys are Curve25519, required
// for X3DH's Diffie-Hellman agreement); web/desktop clients sign with plain
// Ed25519 instead (see docs/SECURITY_MODEL.md's "Identity-key signing scheme
// differs by platform" and the dual-scheme callers in handlers.go/jwt.go —
// this function covers only the Android/iOS half of that split, not "every
// client").
//
// This is NOT plain Ed25519: curve25519PublicKey is a Montgomery-form X25519
// public key (a "u" coordinate), not an Edwards-form Ed25519 public key, and
// crypto/ed25519.Verify cannot validate a signature over it directly — the
// two are different curve representations related by a birational map, and
// verification additionally needs the sign bit XEdDSA smuggles into the
// otherwise-unused top bit of the signature's S value. Feeding the raw 32
// bytes to ed25519.Verify silently rejects every valid signature; this is
// the exact bug this function fixes (see .l00prite/ledger.md Run 12/14).
//
// Ported from go.mau.fi/libsignal's ecc.verify (GPLv3), a Go reimplementation
// of the same scheme libsignal-client itself uses, used in production by
// Signal-protocol bridges that interoperate with real Signal/Sublemonable
// clients — chosen over a hand-derived implementation specifically to avoid
// re-deriving signature-verification math from scratch for a security-
// critical path. Verified against real libsignal-client-generated signature
// vectors (see xeddsa_test.go) before this was wired into any handler.
func VerifyXEdDSA(curve25519PublicKey, message, signature []byte) bool {
	if len(curve25519PublicKey) != 32 || len(signature) != 64 {
		return false
	}

	var publicKey [32]byte
	copy(publicKey[:], curve25519PublicKey)
	// The top bit of a Curve25519 u-coordinate isn't part of the field
	// element (RFC 7748 §5); clear it before treating the bytes as a field
	// value, matching how libsignal encodes/decodes Montgomery keys.
	publicKey[31] &= 0x7F

	var sig [64]byte
	copy(sig[:], signature)

	// Convert the Montgomery-form public key into the corresponding
	// Edwards-form Ed25519 public key: ed_y = (mont_x - 1) / (mont_x + 1).
	var edY, zero, one, montX, montXMinusOne, montXPlusOne field.Element
	if _, err := montX.SetBytes(publicKey[:]); err != nil {
		return false
	}
	zero.Zero()
	one.One()
	montXMinusOne.Subtract(&montX, &one)
	montXPlusOne.Add(&montX, &one)
	// mont_x = -1 (mod p) makes the map undefined (mont_x+1 = 0, with no
	// inverse); Invert would silently return 0 rather than erroring, so
	// reject this degenerate public key explicitly instead of letting a
	// meaningless edY = 0 flow into ed25519.Verify below.
	if montXPlusOne.Equal(&zero) == 1 {
		return false
	}
	montXPlusOne.Invert(&montXPlusOne)
	edY.Multiply(&montXMinusOne, &montXPlusOne)

	// y alone doesn't determine the sign of the Edwards x-coordinate — XEdDSA
	// signing stores it in the otherwise-unused top bit of the signature's S
	// (Ed25519 S values are always < the group order, well under 2^255, so
	// that bit is free). Move it into the reconstructed public key, then
	// mask it back out of S before handing off to standard Ed25519 verify.
	var edPublicKey [32]byte
	copy(edPublicKey[:], edY.Bytes())
	edPublicKey[31] |= sig[63] & 0x80
	sig[63] &= 0x7F

	return ed25519.Verify(edPublicKey[:], message, sig[:])
}
