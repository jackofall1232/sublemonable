// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"

	"github.com/sublemonable/server/internal/relay"
)

// Relay forwarding (v1.5). When this deployment is configured as a relay node
// (RELAY_PRIVATE_KEY set), it advertises multi-hop support and serves
// POST /relay/forward. It peels exactly one onion layer, learning only the next
// hop, and forwards the inner packet. The previous hop is never logged. At the
// innermost layer the payload is a complete message envelope, which is stored
// for normal delivery — the relay chain has already stripped the origin.

// Forwarder sends an inner onion packet to the next hop. Injectable for tests.
type Forwarder interface {
	Forward(ctx context.Context, nextHop string, packet []byte) error
}

type httpForwarder struct{ client *http.Client }

func (f httpForwarder) Forward(ctx context.Context, nextHop string, packet []byte) error {
	body, _ := json.Marshal(fiber.Map{"packet": base64.StdEncoding.EncodeToString(packet)})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, nextHop, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := f.client.Do(req)
	if err != nil {
		return err
	}
	return resp.Body.Close()
}

// DefaultForwarder forwards over HTTP with a bounded timeout.
func DefaultForwarder() Forwarder {
	return httpForwarder{client: &http.Client{Timeout: 10 * time.Second}}
}

type relayForwardRequest struct {
	Packet string `json:"packet"`
}

// RelayForward peels one onion layer and either forwards the inner packet to the
// next hop or, at the innermost layer, stores the delivered envelope.
func (h *Handlers) RelayForward(c *fiber.Ctx) error {
	if h.relayKey == nil {
		return errJSON(c, fiber.StatusNotImplemented, "relay_disabled")
	}
	if !h.dropLimit.Allow(c.IP()) {
		return errJSON(c, fiber.StatusTooManyRequests, "rate_limited")
	}
	var req relayForwardRequest
	if err := c.BodyParser(&req); err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_request")
	}
	packet, err := base64.StdEncoding.DecodeString(req.Packet)
	if err != nil || len(packet) == 0 {
		return errJSON(c, fiber.StatusBadRequest, "bad_packet")
	}

	peeled, err := relay.PeelLayer(*h.relayKey, packet)
	if err != nil {
		// Not sealed for us — indistinguishable response, no detail leaked.
		return errJSON(c, fiber.StatusBadRequest, "bad_packet")
	}

	if peeled.NextHop != "" {
		// Forward one hop onward. The previous hop is not retained.
		if err := h.forwarder.Forward(c.Context(), peeled.NextHop, peeled.Payload); err != nil {
			return errJSON(c, fiber.StatusBadGateway, "forward_failed")
		}
		return c.SendStatus(fiber.StatusAccepted)
	}

	// Innermost layer: the payload is a message envelope for normal delivery.
	var header envelopeForward
	if err := json.Unmarshal(peeled.Payload, &header); err != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_envelope")
	}
	id, err1 := uuid.Parse(header.ID)
	recipient, err2 := uuid.Parse(header.RecipientID)
	if err1 != nil || err2 != nil {
		return errJSON(c, fiber.StatusBadRequest, "bad_envelope")
	}
	if err := h.store.StoreEnvelope(c.Context(), id, recipient, peeled.Payload); err != nil {
		return errJSON(c, fiber.StatusInternalServerError, "store_failed")
	}
	return c.SendStatus(fiber.StatusAccepted)
}

type envelopeForward struct {
	ID          string `json:"id"`
	RecipientID string `json:"recipient_id"`
}
