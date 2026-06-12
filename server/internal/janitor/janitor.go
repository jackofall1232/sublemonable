// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// Package janitor purges undelivered envelopes that outlived their TTL.
package janitor

import (
	"context"
	"log"
	"time"

	"github.com/sublemonable/server/internal/db"
)

// Run purges expired undelivered envelopes every 10 minutes until ctx is done.
// The log line carries a row count only — never content or identities.
func Run(ctx context.Context, store *db.Store, ttl time.Duration) {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			purged, err := store.PurgeExpiredEnvelopes(ctx, time.Now().Add(-ttl))
			if err != nil {
				log.Printf("janitor: purge failed: %v", err)
			} else if purged > 0 {
				log.Printf("janitor: purged %d undelivered envelopes past TTL", purged)
			}
		}
	}
}
