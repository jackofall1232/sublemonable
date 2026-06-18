// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Package ws is the real-time delivery hub. It relays opaque encrypted
// envelopes between connected clients and deletes each envelope from storage
// the instant delivery is acknowledged. Nothing here ever inspects, stores, or
// logs message content.
package ws

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/sublemonable/server/internal/db"
	"github.com/sublemonable/server/internal/ratelimit"
)

const prekeyLowWatermark = 20

type Hub struct {
	mu        sync.RWMutex
	clients   map[uuid.UUID]*Client
	store     *db.Store
	sendLimit *ratelimit.Limiter
}

func NewHub(store *db.Store, sendLimit *ratelimit.Limiter) *Hub {
	return &Hub{
		clients:   make(map[uuid.UUID]*Client),
		store:     store,
		sendLimit: sendLimit,
	}
}

func (h *Hub) register(c *Client) {
	h.mu.Lock()
	if old, ok := h.clients[c.accountID]; ok {
		// One live connection per account — revoke the older session.
		old.send(serverEvent{Type: "session.revoked"})
		old.close()
	}
	h.clients[c.accountID] = c
	h.mu.Unlock()

	h.deliverPending(c)
	h.checkPrekeyStock(c)
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	if h.clients[c.accountID] == c {
		delete(h.clients, c.accountID)
	}
	h.mu.Unlock()
}

func (h *Hub) online(accountID uuid.UUID) *Client {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.clients[accountID]
}

// deliverPending flushes stored envelopes to a freshly connected client.
// Envelopes stay in storage until the client acks each one.
func (h *Hub) deliverPending(c *Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pending, err := h.store.PendingEnvelopes(ctx, c.accountID)
	if err != nil {
		log.Printf("ws: pending envelope fetch failed: %v", err)
		return
	}
	for _, env := range pending {
		c.send(serverEvent{Type: "message.deliver", Envelope: env.Payload})
	}
}

func (h *Hub) checkPrekeyStock(c *Client) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	count, err := h.store.CountOneTimePrekeys(ctx, c.accountID)
	if err == nil && count < prekeyLowWatermark {
		c.send(serverEvent{Type: "prekey.low", Remaining: &count})
	}
}

// envelopeHeader is the minimal routing view of an envelope. The payload is
// stored and relayed as the raw bytes the sender produced — opaque to us.
type envelopeHeader struct {
	ID          string `json:"id"`
	RecipientID string `json:"recipient_id"`
	SenderID    string `json:"sender_id"`
}

type clientEvent struct {
	Type      string          `json:"type"`
	Envelope  json.RawMessage `json:"envelope,omitempty"`
	MessageID string          `json:"message_id,omitempty"`
	PeerID    string          `json:"peer_id,omitempty"`
	Cipher    string          `json:"ciphertext,omitempty"`
}

type serverEvent struct {
	Type      string          `json:"type"`
	Envelope  json.RawMessage `json:"envelope,omitempty"`
	MessageID string          `json:"message_id,omitempty"`
	PeerID    string          `json:"peer_id,omitempty"`
	Cipher    string          `json:"ciphertext,omitempty"`
	Remaining *int            `json:"remaining,omitempty"`
	Code      string          `json:"code,omitempty"`
}

func (h *Hub) handleEvent(c *Client, raw []byte) {
	var ev clientEvent
	if err := json.Unmarshal(raw, &ev); err != nil {
		c.send(serverEvent{Type: "error", Code: "bad_event"})
		return
	}
	switch ev.Type {
	case "message.send":
		h.handleSend(c, ev)
	case "message.ack":
		h.handleAck(c, ev)
	case "message.burn":
		h.relayToPeer(c, ev, "message.burned")
	case "typing.start", "typing.stop", "presence.update", "contact.info":
		h.relaySignal(c, ev)
	default:
		c.send(serverEvent{Type: "error", Code: "unknown_event"})
	}
}

func (h *Hub) handleSend(c *Client, ev clientEvent) {
	if !h.sendLimit.Allow(c.accountID.String()) {
		c.send(serverEvent{Type: "error", Code: "rate_limited"})
		return
	}
	var header envelopeHeader
	if err := json.Unmarshal(ev.Envelope, &header); err != nil {
		c.send(serverEvent{Type: "error", Code: "bad_envelope"})
		return
	}
	id, err1 := uuid.Parse(header.ID)
	recipient, err2 := uuid.Parse(header.RecipientID)
	if err1 != nil || err2 != nil || header.SenderID != c.accountID.String() {
		c.send(serverEvent{Type: "error", Code: "bad_envelope"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.store.StoreEnvelope(ctx, id, recipient, ev.Envelope); err != nil {
		c.send(serverEvent{Type: "error", Code: "store_failed"})
		return
	}
	if peer := h.online(recipient); peer != nil {
		peer.send(serverEvent{Type: "message.deliver", Envelope: ev.Envelope})
	}
}

// handleAck deletes the envelope immediately — store-and-forward only — and
// records a content-free delivery receipt (hash of the message ID).
func (h *Hub) handleAck(c *Client, ev clientEvent) {
	id, err := uuid.Parse(ev.MessageID)
	if err != nil {
		c.send(serverEvent{Type: "error", Code: "bad_ack"})
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := h.store.DeleteEnvelope(ctx, id, c.accountID); err != nil {
		log.Printf("ws: envelope delete failed: %v", err)
		return
	}
	hash := sha256.Sum256([]byte(ev.MessageID))
	_ = h.store.RecordDeliveryReceipt(ctx, hash[:])
}

func (h *Hub) relayToPeer(c *Client, ev clientEvent, outType string) {
	peer, err := uuid.Parse(ev.PeerID)
	if err != nil {
		c.send(serverEvent{Type: "error", Code: "bad_peer"})
		return
	}
	if target := h.online(peer); target != nil {
		target.send(serverEvent{
			Type:      outType,
			MessageID: ev.MessageID,
			PeerID:    c.accountID.String(),
		})
	}
}

// relaySignal forwards encrypted typing/presence signals verbatim.
func (h *Hub) relaySignal(c *Client, ev clientEvent) {
	peer, err := uuid.Parse(ev.PeerID)
	if err != nil {
		return
	}
	if target := h.online(peer); target != nil {
		target.send(serverEvent{
			Type:   ev.Type,
			PeerID: c.accountID.String(),
			Cipher: ev.Cipher,
		})
	}
}
