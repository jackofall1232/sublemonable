// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Package relay implements the relay-node side of the multi-hop onion: peeling
// exactly one encryption layer off a forwarded packet. A relay learns only the
// next hop and an opaque inner packet — never both ends of the path. The
// previous hop is never logged and is zeroed from memory after forwarding.
//
// Each layer is a libsodium sealed box (crypto_box_seal), which Go's
// nacl/box Anonymous API is wire-compatible with. Per-layer cleartext framing
// matches the client (@sublemonable/crypto onion.ts):
//
//	addrLen(2, big-endian) || addr || innerPayload
//
// addrLen == 0 marks the innermost layer; its payload is the delivered content.
package relay

import (
	"encoding/binary"
	"errors"

	"golang.org/x/crypto/nacl/box"
)

// KeyPair is a relay's Curve25519 keypair for onion forwarding.
type KeyPair struct {
	Public  [32]byte
	Private [32]byte
}

// Peeled is the result of removing one onion layer.
type Peeled struct {
	// NextHop is the address to forward to, or "" at the innermost layer.
	NextHop string
	// Payload is the inner packet to forward, or the delivered content at the
	// innermost layer.
	Payload []byte
}

var errNotForUs = errors.New("onion layer not sealed for this relay")

// PeelLayer removes one layer with the relay's keypair. It returns the next hop
// (empty at the innermost layer) and the inner packet/payload. It returns an
// error if the packet was not sealed for this relay's key.
func PeelLayer(kp KeyPair, packet []byte) (Peeled, error) {
	opened, ok := box.OpenAnonymous(nil, packet, &kp.Public, &kp.Private)
	if !ok {
		return Peeled{}, errNotForUs
	}
	return unframe(opened)
}

func unframe(framed []byte) (Peeled, error) {
	if len(framed) < 2 {
		return Peeled{}, errors.New("onion layer truncated")
	}
	addrLen := int(binary.BigEndian.Uint16(framed[:2]))
	if len(framed) < 2+addrLen {
		return Peeled{}, errors.New("onion layer truncated")
	}
	nextHop := ""
	if addrLen > 0 {
		nextHop = string(framed[2 : 2+addrLen])
	}
	return Peeled{NextHop: nextHop, Payload: framed[2+addrLen:]}, nil
}
