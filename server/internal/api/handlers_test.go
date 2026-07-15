// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"testing"
)

func mustDecodeB64(t *testing.T, s string) []byte {
	t.Helper()
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestSignedPrekeyMessage(t *testing.T) {
	raw := []byte{0x01, 0x02, 0x03}
	got := signedPrekeyMessage(raw)
	want := []byte{0x05, 0x01, 0x02, 0x03}
	if string(got) != string(want) {
		t.Fatalf("got %x, want %x", got, want)
	}
}

// Real libsignal-client vector (same one used in internal/auth's tests —
// see .l00prite/ledger.md Run 14 for provenance) — proves the mobile
// (XEdDSA, 33-byte serialize() form) branch of verifySignedPrekey.
const (
	mobileIdentityRaw32B64 = "1d8NiGPds3c2oB+Uw7W3RZb6lKRaizNEa3Ci1/g3plY="
	mobileSpkRaw32B64      = "v2NKpmjAu+H5WP0HQJMF8iUfVaVgF3tNU3Zq8iRmE2E="
	mobileSpkSigB64        = "XGpVH3ElT7yNQPh0WvAalHvjG8AZry91SOCy7zqmIPU0TKeMxWRgahAletwDrvKpVCwAu1YWTr5nQ4WLPCW+gw=="
)

func TestVerifySignedPrekey_MobileStyleXEdDSA(t *testing.T) {
	identityKey := mustDecodeB64(t, mobileIdentityRaw32B64)
	pub := mustDecodeB64(t, mobileSpkRaw32B64)
	sig := mustDecodeB64(t, mobileSpkSigB64)
	if !verifySignedPrekey(identityKey, pub, sig) {
		t.Fatal("real libsignal XEdDSA signed-prekey signature was rejected")
	}
}

// Genuine Ed25519, signing the raw prekey directly — exactly
// packages/crypto/src/keys.ts's generateSignedPrekey()/verifySignedPrekey()
// convention (sodium.crypto_sign_detached over kp.publicKey, no prefix).
// Independently confirmed live in Run 14 (a real Node.js request of this
// exact shape got a 201 from the still-unmodified production server) — this
// pins that same acceptance at the unit level.
func TestVerifySignedPrekey_WebStyleEd25519(t *testing.T) {
	identityPub, identityPriv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	prekeyPub := make([]byte, 32)
	if _, err := rand.Read(prekeyPub); err != nil {
		t.Fatal(err)
	}
	sig := ed25519.Sign(identityPriv, prekeyPub)

	if !verifySignedPrekey(identityPub, prekeyPub, sig) {
		t.Fatal("valid web-style Ed25519 signed-prekey signature was rejected")
	}
}

func TestVerifySignedPrekey_RejectsForgedAndCrossedSignatures(t *testing.T) {
	identityKey := mustDecodeB64(t, mobileIdentityRaw32B64)
	pub := mustDecodeB64(t, mobileSpkRaw32B64)
	sig := mustDecodeB64(t, mobileSpkSigB64)

	// Wrong key entirely.
	otherPub, _, _ := ed25519.GenerateKey(rand.Reader)
	if verifySignedPrekey(otherPub, pub, sig) {
		t.Fatal("mobile-style signature verified under an unrelated Ed25519 key")
	}

	// A genuine Ed25519 signature over the wrong (mobile 33-byte-prefixed,
	// rather than raw) message must not verify under the web-style branch.
	identityPub, identityPriv, _ := ed25519.GenerateKey(rand.Reader)
	prefixedSig := ed25519.Sign(identityPriv, signedPrekeyMessage(pub))
	if verifySignedPrekey(identityPub, pub, prefixedSig) {
		t.Fatal("web-style branch accepted a signature over the prefixed (mobile) message")
	}

	// Tampered mobile-style signature.
	tampered := append([]byte(nil), sig...)
	tampered[0] ^= 0x01
	if verifySignedPrekey(identityKey, pub, tampered) {
		t.Fatal("tampered mobile-style signature accepted")
	}
}
