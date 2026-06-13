// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

// ⚠️ This implementation has not undergone third-party security audit.
// See AUDIT.md in the repository root.

export { poissonIntervalMs, cadenceMeanSeconds, type UniformRng } from "./poisson.js";
export {
  makeDecoyEnvelope,
  DecoyScheduler,
  type DecoySchedulerOptions,
  type Timer,
} from "./decoy.js";
export { selectPath, buildCircuit, shouldRotate, guardOf, type Circuit } from "./circuit.js";
