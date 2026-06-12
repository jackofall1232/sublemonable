// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Package ratelimit is a fixed-window in-memory limiter. Keys (a transient
// client address for registration, account IDs elsewhere) live only in memory
// and are never persisted or logged.
package ratelimit

import (
	"sync"
	"time"
)

type window struct {
	start time.Time
	count int
}

type Limiter struct {
	mu      sync.Mutex
	max     int
	per     time.Duration
	windows map[string]*window
	enabled bool
}

func New(max int, per time.Duration, enabled bool) *Limiter {
	l := &Limiter{max: max, per: per, windows: make(map[string]*window), enabled: enabled}
	if enabled {
		go l.sweep()
	}
	return l
}

// Allow reports whether the key may proceed, consuming one unit if so.
func (l *Limiter) Allow(key string) bool {
	if !l.enabled {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	w, ok := l.windows[key]
	if !ok || now.Sub(w.start) >= l.per {
		l.windows[key] = &window{start: now, count: 1}
		return true
	}
	if w.count >= l.max {
		return false
	}
	w.count++
	return true
}

// sweep drops stale windows so transient keys don't accumulate in memory.
func (l *Limiter) sweep() {
	ticker := time.NewTicker(l.per)
	for range ticker.C {
		l.mu.Lock()
		now := time.Now()
		for k, w := range l.windows {
			if now.Sub(w.start) >= l.per {
				delete(l.windows, k)
			}
		}
		l.mu.Unlock()
	}
}
