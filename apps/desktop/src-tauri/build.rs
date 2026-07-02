// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

fn main() {
    // Bake the relay onion address in at build time. It is NEVER published or
    // committed — set RELAY_ONION_ADDRESS in the build environment so the relay
    // hidden service stays out of the source tree. Empty when unset; rebuilt when
    // the variable changes. Read it in Rust via env!("RELAY_ONION_ADDRESS").
    println!("cargo:rerun-if-env-changed=RELAY_ONION_ADDRESS");
    println!(
        "cargo:rustc-env=RELAY_ONION_ADDRESS={}",
        std::env::var("RELAY_ONION_ADDRESS").unwrap_or_default()
    );

    // Bake the relay I2P destination (*.b32.i2p) in at build time. Same rationale
    // as RELAY_ONION_ADDRESS: the address is never committed; the Rust layer
    // validates requests against this constant so the WebView cannot supply an
    // arbitrary I2P destination. Empty when unset (i2p_request returns an error).
    println!("cargo:rerun-if-env-changed=RELAY_I2P_DEST");
    println!(
        "cargo:rustc-env=RELAY_I2P_DEST={}",
        std::env::var("RELAY_I2P_DEST").unwrap_or_default()
    );

    tauri_build::build();
}
