// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

package ws

import (
	"encoding/json"
	"sync"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/google/uuid"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingInterval   = 50 * time.Second
	maxMessageSize = 256 * 1024 // generous envelope ceiling (encrypted images)
)

type Client struct {
	accountID uuid.UUID
	conn      *websocket.Conn
	outbox    chan serverEvent
	closeOnce sync.Once
	done      chan struct{}
}

// Serve runs a client's read/write loops until the connection drops.
// Called from the Fiber websocket handler with an authenticated account ID.
func (h *Hub) Serve(accountID uuid.UUID, conn *websocket.Conn) {
	c := &Client{
		accountID: accountID,
		conn:      conn,
		outbox:    make(chan serverEvent, 64),
		done:      make(chan struct{}),
	}
	h.register(c)
	defer h.unregister(c)

	go c.writeLoop()
	c.readLoop(h)
}

func (c *Client) send(ev serverEvent) {
	select {
	case c.outbox <- ev:
	case <-c.done:
	default:
		// Slow consumer: drop the connection rather than buffer unboundedly;
		// undelivered envelopes remain in storage and re-flush on reconnect.
		c.close()
	}
}

func (c *Client) close() {
	c.closeOnce.Do(func() {
		close(c.done)
		_ = c.conn.Close()
	})
}

func (c *Client) readLoop(h *Hub) {
	defer c.close()
	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		h.handleEvent(c, raw)
	}
}

func (c *Client) writeLoop() {
	ticker := time.NewTicker(pingInterval)
	defer ticker.Stop()
	defer c.close()
	for {
		select {
		case ev := <-c.outbox:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			payload, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		case <-c.done:
			return
		}
	}
}
