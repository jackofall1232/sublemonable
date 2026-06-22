// Sublemonable — Copyright (C) 2026 Sublemonable contributors
// Licensed under the GNU Affero General Public License v3.0 or later.
// See the LICENSE file in the repository root for full license text.
// SPDX-License-Identifier: AGPL-3.0-only

import type {
  PreKeyBundle,
  RegistrationRequest,
  PreKeyUploadRequest,
  DropDepositRequest,
  DropDepositResponse,
  DropRedeemResponse,
} from "@sublemonable/protocol";
import { isTauri, nativeRequest } from "./nativeTransport.js";
import { getServerUrl, SERVER_URL } from "../config.js";
import { useSettings } from "../settings.js";

export { SERVER_URL };

interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  // Dial the relay onion when Tor is the live transport, else clearnet.
  const baseUrl = getServerUrl(useSettings.getState().transport);

  // Desktop (Tauri): route through the native certificate-pinned client. The
  // browser PWA falls through to fetch below, unchanged.
  if (isTauri()) {
    const { status, body } = await nativeRequest(
      init.method ?? "GET",
      `${baseUrl}${path}`,
      headers,
      init.body as string | undefined,
    );
    if (status < 200 || status >= 300) {
      let code = "request_failed";
      try {
        code = (JSON.parse(body) as { error?: string }).error ?? code;
      } catch {
        /* body absent */
      }
      throw new ApiError(status, code);
    }
    if (status === 204 || body === "") return undefined as T;
    return JSON.parse(body) as T;
  }

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    let code = "request_failed";
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      /* body absent */
    }
    throw new ApiError(res.status, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export const api = {
  register(body: RegistrationRequest): Promise<{ account_id: string }> {
    return request("/api/v1/register", { method: "POST", body: JSON.stringify(body) });
  },

  createSession(accountId: string, timestamp: number, signature: string): Promise<TokenPair> {
    return request("/api/v1/session", {
      method: "POST",
      body: JSON.stringify({ account_id: accountId, timestamp, signature }),
    });
  },

  refreshSession(refreshToken: string): Promise<TokenPair> {
    return request("/api/v1/session/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
  },

  logout(token: string): Promise<void> {
    return request("/api/v1/session", { method: "DELETE" }, token);
  },

  fetchPrekeyBundle(userId: string, token: string): Promise<PreKeyBundle> {
    return request(`/api/v1/users/${encodeURIComponent(userId)}/prekey`, {}, token);
  },

  uploadPrekeys(
    body: PreKeyUploadRequest & { signed_prekey?: unknown },
    token: string,
  ): Promise<void> {
    return request("/api/v1/prekeys", { method: "POST", body: JSON.stringify(body) }, token);
  },

  prekeyCount(token: string): Promise<{ count: number }> {
    return request("/api/v1/prekeys/count", {}, token);
  },

  deleteAccount(token: string): Promise<void> {
    return request("/api/v1/account", { method: "DELETE" }, token);
  },

  // Dead drops (v1.5) — no auth: proof-of-work on deposit, token on redeem.
  depositDrop(body: DropDepositRequest): Promise<DropDepositResponse> {
    return request("/api/v1/drops", { method: "POST", body: JSON.stringify(body) });
  },

  redeemDrop(token: string): Promise<DropRedeemResponse> {
    return request("/api/v1/drops/redeem", { method: "POST", body: JSON.stringify({ token }) });
  },
};
