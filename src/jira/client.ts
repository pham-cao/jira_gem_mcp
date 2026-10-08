import type { Config } from "../config.js";
import { JiraError } from "./errors.js";

export type Query = Record<string, string | number | boolean | undefined>;

type ClientConfig = Pick<Config, "baseUrl" | "username" | "password" | "timeoutMs">;

export class JiraClient {
  readonly baseUrl: string;
  private readonly auth: string;
  private readonly timeoutMs: number;
  private readonly retryDelayMs: number;

  constructor(cfg: ClientConfig, opts: { retryDelayMs?: number } = {}) {
    this.baseUrl = cfg.baseUrl;
    this.auth = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`, "utf8").toString("base64");
    this.timeoutMs = cfg.timeoutMs;
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
  }

  get<T>(path: string, query?: Query): Promise<T> {
    return this.request<T>("GET", path, { query });
  }

  post<T>(path: string, body?: unknown, query?: Query): Promise<T> {
    return this.request<T>("POST", path, { body, query });
  }

  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PUT", path, { body });
  }

  postMultipart<T>(path: string, form: FormData): Promise<T> {
    return this.request<T>("POST", path, { form });
  }

  async getBinary(url: string): Promise<{ data: ArrayBuffer; contentType: string }> {
    const path = new URL(url).pathname;
    const res = await this.withRetry(() => this.fetch(url, { method: "GET", headers: { Authorization: this.auth } }));
    if (!res.ok) throw await JiraError.fromResponse(res, "GET", path);
    return { data: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
  }

  private async request<T>(
    method: string,
    path: string,
    opts: { query?: Query; body?: unknown; form?: FormData },
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { Authorization: this.auth, Accept: "application/json" };
    let body: BodyInit | undefined;
    if (opts.form) {
      headers["X-Atlassian-Token"] = "no-check";
      body = opts.form;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    const send = () => this.fetch(url.toString(), { method, headers, body });
    const res = method === "GET" ? await this.withRetry(send) : await send();
    if (!res.ok) throw await JiraError.fromResponse(res, method, path);
    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      const type = (res.headers.get("content-type") ?? "unknown").split(";")[0];
      throw new Error(
        `Jira trả về nội dung không phải JSON (HTTP ${res.status}, ${type}) cho ${method} ${path} — có thể bị chuyển hướng tới trang đăng nhập/SSO hoặc proxy.`,
      );
    }
  }

  private fetch(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
  }

  /** GET only: one retry after retryDelayMs on 5xx, network error or timeout. */
  private async withRetry(send: () => Promise<Response>): Promise<Response> {
    try {
      const res = await send();
      if (res.status < 500) return res;
      await res.body?.cancel();
    } catch {
      // network error or timeout: fall through to the single retry
    }
    await new Promise((r) => setTimeout(r, this.retryDelayMs));
    return send();
  }
}
