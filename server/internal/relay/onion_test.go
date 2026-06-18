// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package relay

import (
	"bytes"
	"crypto/rand"
	"encoding/binary"
	"testing"

	"golang.org/x/crypto/nacl/box"
)

func newKeyPair(t *testing.T) KeyPair {
	t.Helper()
	pub, priv, err := box.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return KeyPair{Public: *pub, Private: *priv}
}

// frame mirrors the client's per-layer framing for the test's seal step.
func frame(addr string, payload []byte) []byte {
	out := make([]byte, 2+len(addr)+len(payload))
	binary.BigEndian.PutUint16(out[:2], uint16(len(addr)))
	copy(out[2:], addr)
	copy(out[2+len(addr):], payload)
	return out
}

func sealFor(t *testing.T, pub [32]byte, msg []byte) []byte {
	t.Helper()
	sealed, err := box.SealAnonymous(nil, msg, &pub, rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return sealed
}

func TestPeelInnermostLayer(t *testing.T) {
	kp := newKeyPair(t)
	content := []byte("delivered payload")
	packet := sealFor(t, kp.Public, frame("", content))

	peeled, err := PeelLayer(kp, packet)
	if err != nil {
		t.Fatal(err)
	}
	if peeled.NextHop != "" {
		t.Errorf("innermost layer should have no next hop, got %q", peeled.NextHop)
	}
	if !bytes.Equal(peeled.Payload, content) {
		t.Errorf("payload mismatch: got %q want %q", peeled.Payload, content)
	}
}

func TestPeelThreeHops(t *testing.T) {
	a, b, c := newKeyPair(t), newKeyPair(t), newKeyPair(t)
	content := []byte("three hop secret")

	// Build innermost-first, exactly as the client does.
	inner := sealFor(t, c.Public, frame("", content))
	mid := sealFor(t, b.Public, frame("relay-c", inner))
	outer := sealFor(t, a.Public, frame("relay-b", mid))

	atA, err := PeelLayer(a, outer)
	if err != nil || atA.NextHop != "relay-b" {
		t.Fatalf("relay A: hop=%q err=%v", atA.NextHop, err)
	}
	atB, err := PeelLayer(b, atA.Payload)
	if err != nil || atB.NextHop != "relay-c" {
		t.Fatalf("relay B: hop=%q err=%v", atB.NextHop, err)
	}
	atC, err := PeelLayer(c, atB.Payload)
	if err != nil || atC.NextHop != "" {
		t.Fatalf("relay C: hop=%q err=%v", atC.NextHop, err)
	}
	if !bytes.Equal(atC.Payload, content) {
		t.Errorf("final payload mismatch: got %q", atC.Payload)
	}
}

func TestPeelWrongKeyRejected(t *testing.T) {
	kp := newKeyPair(t)
	wrong := newKeyPair(t)
	packet := sealFor(t, kp.Public, frame("", []byte("secret")))
	if _, err := PeelLayer(wrong, packet); err == nil {
		t.Fatal("a relay peeled a layer that wasn't sealed for it")
	}
}
