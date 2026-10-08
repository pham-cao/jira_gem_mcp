import { HttpError } from "./errors.js";
export class HttpClient {
    baseUrl;
    service;
    auth;
    timeoutMs;
    retryDelayMs;
    constructor(cfg, opts = {}) {
        this.baseUrl = cfg.baseUrl;
        this.service = cfg.service ?? "Jira";
        this.auth = "Basic " + Buffer.from(`${cfg.username}:${cfg.password}`, "utf8").toString("base64");
        this.timeoutMs = cfg.timeoutMs;
        this.retryDelayMs = opts.retryDelayMs ?? 1000;
    }
    get(path, query) {
        return this.request("GET", path, { query });
    }
    post(path, body, query) {
        return this.request("POST", path, { body, query });
    }
    put(path, body) {
        return this.request("PUT", path, { body });
    }
    postMultipart(path, form) {
        return this.request("POST", path, { form });
    }
    async getBinary(url) {
        const path = new URL(url).pathname;
        const res = await this.withRetry(() => this.fetch(url, { method: "GET", headers: { Authorization: this.auth } }));
        if (!res.ok)
            throw await HttpError.fromResponse(res, "GET", path, this.service);
        return { data: await res.arrayBuffer(), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    }
    async request(method, path, opts) {
        const url = new URL(this.baseUrl + path);
        for (const [k, v] of Object.entries(opts.query ?? {})) {
            if (v !== undefined)
                url.searchParams.set(k, String(v));
        }
        const headers = { Authorization: this.auth, Accept: "application/json" };
        let body;
        if (opts.form) {
            headers["X-Atlassian-Token"] = "no-check";
            body = opts.form;
        }
        else if (opts.body !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(opts.body);
        }
        const send = () => this.fetch(url.toString(), { method, headers, body });
        const res = method === "GET" ? await this.withRetry(send) : await send();
        if (!res.ok)
            throw await HttpError.fromResponse(res, method, path, this.service);
        const text = await res.text();
        if (!text)
            return undefined;
        try {
            return JSON.parse(text);
        }
        catch {
            const type = (res.headers.get("content-type") ?? "unknown").split(";")[0];
            throw new Error(`${this.service} trả về nội dung không phải JSON (HTTP ${res.status}, ${type}) cho ${method} ${path} — có thể bị chuyển hướng tới trang đăng nhập/SSO hoặc proxy.`);
        }
    }
    fetch(url, init) {
        return fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) }).catch((err) => {
            if (err instanceof Error)
                Object.assign(err, { service: this.service });
            throw err;
        });
    }
    /** GET only: one retry after retryDelayMs on 5xx, network error or timeout. */
    async withRetry(send) {
        try {
            const res = await send();
            if (res.status < 500)
                return res;
            await res.body?.cancel();
        }
        catch {
            // network error or timeout: fall through to the single retry
        }
        await new Promise((r) => setTimeout(r, this.retryDelayMs));
        return send();
    }
}
