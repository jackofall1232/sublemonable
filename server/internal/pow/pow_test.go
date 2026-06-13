// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package pow

import (
	"crypto/sha256"
	"encoding/binary"
	"testing"
)

func TestHasLeadingZeroBits(t *testing.T) {
	cases := []struct {
		digest []byte
		bits   int
		want   bool
	}{
		{[]byte{0x00, 0xff}, 8, true},
		{[]byte{0x00, 0xff}, 9, false},
		{[]byte{0x0f}, 4, true},
		{[]byte{0x1f}, 4, false},
		{[]byte{0x00, 0x00}, 16, true},
		{[]byte{0x00, 0x01}, 16, false},
	}
	for i, c := range cases {
		if got := HasLeadingZeroBits(c.digest, c.bits); got != c.want {
			t.Errorf("case %d: HasLeadingZeroBits(%x, %d) = %v, want %v", i, c.digest, c.bits, got, c.want)
		}
	}
}

func TestVerifyRoundTrip(t *testing.T) {
	challenge := sha256.Sum256([]byte("a drop id"))
	difficulty := 12
	nonce := make([]byte, NonceBytes)

	// Brute force a solution the way a client would.
	var counter uint64
	for {
		binary.BigEndian.PutUint64(nonce, counter)
		if Verify(challenge[:], nonce, difficulty) {
			break
		}
		counter++
		if counter > 1<<24 {
			t.Fatal("failed to find a solution within budget")
		}
	}

	if !Verify(challenge[:], nonce, difficulty) {
		t.Fatal("freshly found solution did not verify")
	}
	// Tampering invalidates it.
	nonce[0] ^= 0xff
	if Verify(challenge[:], nonce, difficulty) {
		t.Fatal("tampered nonce verified")
	}
	// Wrong nonce length is rejected.
	if Verify(challenge[:], nonce[:4], difficulty) {
		t.Fatal("short nonce verified")
	}
}
