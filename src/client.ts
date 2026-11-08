import { z } from "zod";
import { apiBase, loadApp, loadTokens, saveTokens, type AppConfig, type Tokens } from "./config.ts";
import { interactiveLogin } from "./auth.ts";

export const tokenStore = process.env.FREEAGENT_TOKEN_STORE === "file" ? "file" : "memory";

const tokenResponse = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
});

export async function exchangeToken(
  app: AppConfig,
  params: Record<string, string>,
  previousRefresh?: string,
): Promise<Tokens> {
  const res = await fetch(`${apiBase}/token_endpoint`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  const data = tokenResponse.parse(await res.json());
  const refreshToken = data.refresh_token ?? previousRefresh;
  if (!refreshToken) throw new Error("Token response has no refresh token");
  const tokens = {
    accessToken: data.access_token,
    refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return tokens;
}

export type Query = Record<string, string | number | boolean | undefined>;

export interface ApiResponse {
  status: number;
  data: unknown;
  next: string | null;
  total: number | null;
}

export class FreeAgentClient {
  private tokens: Tokens | null = null;
  private app: AppConfig | null = null;

  private login: Promise<Tokens> | null = null;

  private async accessToken(force = false): Promise<string> {
    this.app ??= await loadApp();
    if (!this.tokens && tokenStore === "file") this.tokens = await loadTokens();
    if (!this.tokens) {
      this.login ??= interactiveLogin(this.app, {
        timeoutMs: 3 * 60_000,
        onUrl: (url) => console.error(`FreeAgent approval needed: ${url}`),
      }).finally(() => {
        this.login = null;
      });
      this.tokens = await this.login;
    } else if (force || this.tokens.expiresAt - Date.now() < 60_000) {
      this.tokens = await exchangeToken(
        this.app,
        { grant_type: "refresh_token", refresh_token: this.tokens.refreshToken },
        this.tokens.refreshToken,
      );
    } else {
      return this.tokens.accessToken;
    }
    if (tokenStore === "file") await saveTokens(this.tokens);
    return this.tokens.accessToken;
  }

  url(path: string, query: Query = {}): string {
    const url = path.startsWith("http")
      ? new URL(path)
      : new URL(apiBase + "/" + path.replace(/^\/+/, "").replace(/^v2\//, ""));
    if (url.origin !== new URL(apiBase).origin) throw new Error(`Refusing non-FreeAgent URL: ${path}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  async request(method: string, path: string, query: Query = {}, body?: unknown): Promise<ApiResponse> {
    const target = this.url(path, query);
    let refreshed = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(target, {
        method,
        headers: {
          Authorization: `Bearer ${await this.accessToken(refreshed)}`,
          Accept: "application/json",
          "User-Agent": "freeagent-mcp",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        continue;
      }
      refreshed = false;
      if (res.status === 429) {
        const wait = Number(res.headers.get("retry-after") ?? 0) * 1000 || 2 ** attempt * 2000;
        await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
        continue;
      }
      const text = await res.text();
      const data: unknown = text ? safeJson(text) : null;
      if (!res.ok) throw new Error(`FreeAgent ${method} ${target} -> ${res.status}: ${text.slice(0, 2000)}`);
      const total = res.headers.get("x-total-count");
      return {
        status: res.status,
        data,
        next: /<([^>]+)>;\s*rel="next"/.exec(res.headers.get("link") ?? "")?.[1] ?? null,
        total: total === null ? null : Number(total),
      };
    }
    throw new Error(`FreeAgent ${method} ${target}: still rate limited after retries`);
  }

  async getAll(path: string, query: Query, maxPages: number): Promise<{ data: unknown; pages: number; total: number | null; truncated: boolean }> {
    let res = await this.request("GET", path, { per_page: 100, ...query });
    if (!res.next || !isRecord(res.data)) return { data: res.data, pages: 1, total: res.total, truncated: false };
    const merged: Record<string, unknown[]> = {};
    const add = (d: unknown) => {
      if (!isRecord(d)) return;
      for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) (merged[k] ??= []).push(...v);
    };
    add(res.data);
    let pages = 1;
    while (res.next && pages < maxPages) {
      res = await this.request("GET", res.next);
      add(res.data);
      pages++;
    }
    return { data: merged, pages, total: res.total, truncated: res.next !== null };
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
