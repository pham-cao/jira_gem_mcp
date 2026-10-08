# Jira Server MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stdio MCP server that lets Claude read and operate GEM's Jira Server 8.5.19 using each user's own username/password.

**Architecture:** A thin `fetch`-based `JiraClient` (Basic Auth, error mapping, GET-only retry) feeds ~26 MCP tools grouped by resource in `src/tools/*`. Every tool is registered through one `defineTool` helper that enforces read-only mode and converts errors into `isError` results. `src/server.ts` runs startup checks (`/myself`, agile probe) and decides which groups to register; `src/index.ts` wires config → client → server → stdio.

**Tech Stack:** TypeScript (ESM, `module: NodeNext`), Node.js ≥ 20, `@modelcontextprotocol/sdk` (v1.x), `zod` v3, `vitest`, `msw` v2, `tsx` (dev only).

**Spec:** `docs/superpowers/specs/2026-10-08-jira-server-mcp-design.md`

## Global Constraints

- Node ≥ 20 (`"engines": {"node": ">=20"}`); no Jira client libraries; HTTP via global `fetch` only.
- REST bases: core `/rest/api/2`, agile `/rest/agile/1.0`.
- Users are identified by `name` (username), never `accountId`. Description/comment bodies are wiki-markup strings, never ADF.
- Worklog `started` format: `yyyy-MM-dd'T'HH:mm:ss.SSSZ`, e.g. `2026-10-08T09:00:00.000+0700`.
- Env vars: `JIRA_BASE_URL`, `JIRA_USERNAME`, `JIRA_PASSWORD` (required); `JIRA_READ_ONLY` (default `false`), `JIRA_INSECURE_TLS` (default `false`), `JIRA_TIMEOUT_MS` (default `30000`). Booleans accept `true/false/1/0`, case-insensitive; anything else is a config error.
- All tool names prefixed `jira_`. Write tools are not registered when `JIRA_READ_ONLY=true`. Agile tools are registered only if the agile probe returns 2xx.
- Retry: only GET, only on 5xx / network error / timeout, exactly 1 retry after 1000 ms. Never retry 4xx, POST, PUT.
- Logs go to **stderr** only. Never log the password or the `Authorization` header.
- Output: JSON via `JSON.stringify(x, null, 2)`; strings > 10 000 chars truncated with `…[truncated]` + hint; paged results carry `{total, startAt, maxResults, hasMore}`.
- Search `maxResults` default 20, max 100. Upload limit 10 MB (10 × 1024 × 1024 bytes). `move_issues_to_sprint` max 50 keys.
- Error copy (Vietnamese) is fixed in Task 2 and used verbatim.
- **Deviation from spec §3, decided here:** `JIRA_INSECURE_TLS=true` is implemented by setting `process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"` in `src/index.ts` before any request (not an undici `Agent`), so that global `fetch` stays mockable by msw and no `undici` dependency is needed.

## Review Focus

1. Password containing `:` or non-ASCII characters (e.g. `pässː`) → Basic header must be `base64(utf8("user:pass"))` via `Buffer`, not `btoa`. Test in Task 2.
2. `JIRA_BASE_URL` with a context path (e.g. `https://host/jira/`) → requests must go to `https://host/jira/rest/api/2/...`, not drop `/jira`. Tests in Task 1 (normalisation) and Task 2 (URL join).
3. Non-JSON error bodies (HTML 502 page from a proxy, empty body) → a `JiraError` with status text, never a `SyntaxError`. Test in Task 2.
4. Worklog `started` given with an offset or `Z` (`2026-10-08T09:00:00+07:00`, `2026-10-08T02:00:00Z`) → converted to Jira format preserving the given offset (`+0700`, `+0000`). Test in Task 3.
5. Attachment `content` URL pointing at a different origin than `JIRA_BASE_URL` → credentials must not be sent there; the tool refuses. Test in Task 8.

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, .gitignore, .env.example, README.md
src/index.ts            entry (shebang): loadConfig → JiraClient → createServer → stdio
src/config.ts           loadConfig, Config, ConfigError
src/server.ts           startupChecks, createServer
src/jira/errors.ts      JiraError, formatError
src/jira/client.ts      JiraClient
src/jira/format.ts      slim*/truncate/paged/parseSprintValue/toJiraDate
src/jira/fields.ts      FieldCache (GET /field, cached)
src/tools/define.ts     ToolContext, defineTool, jsonResult
src/tools/meta.ts       projects, create meta, fields, users, link types
src/tools/issues.ts     search, get_issue, get_transitions, create, update, assign, transition
src/tools/comments.ts   get/add/update comment
src/tools/worklogs.ts   get/add worklog
src/tools/links.ts      link_issues
src/tools/attachments.ts upload/download
src/tools/agile.ts      boards, sprints, sprint issues, move, create/update sprint
test/helpers.ts         msw server, BASE_URL, makeClient, connectTools
test/*.test.ts          one test file per src file
scripts/smoke.ts        manual smoke against real Jira
```

`jira_list_link_types` lives in `meta.ts` (read-only metadata); `links.ts` holds only the write tool.

---

### Task 1: Project scaffold + config

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`, `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Config { baseUrl: string; username: string; password: string; readOnly: boolean; insecureTls: boolean; timeoutMs: number }
  export class ConfigError extends Error {}
  export function loadConfig(env: Record<string, string | undefined>): Config
  ```

- [ ] **Step 1: Scaffold**

`package.json`: `"name": "jira-server-mcp"`, `"type": "module"`, `"bin": {"jira-server-mcp": "dist/index.js"}`, `"files": ["dist"]`, `"engines": {"node": ">=20"}`, scripts `build: "tsc"`, `prepare: "npm run build"`, `test: "vitest run"`, `smoke: "tsx --env-file=.env scripts/smoke.ts"`. Install deps: `@modelcontextprotocol/sdk@^1 zod@^3`; dev: `typescript @types/node vitest msw@^2 tsx`.
`tsconfig.json`: `target ES2022`, `module/moduleResolution NodeNext`, `strict`, `rootDir src`, `outDir dist`, `include ["src"]`.
`.gitignore`: `node_modules`, `dist`, `.env`. `.env.example`: the three required vars with placeholder values.

- [ ] **Step 2: Write failing tests `test/config.test.ts`**

```ts
const base = { JIRA_BASE_URL: "https://pm.gem-corp.tech", JIRA_USERNAME: "u", JIRA_PASSWORD: "p" };
it("applies defaults", () => expect(loadConfig(base)).toEqual({ baseUrl: "https://pm.gem-corp.tech", username: "u", password: "p", readOnly: false, insecureTls: false, timeoutMs: 30000 }));
it.each(["JIRA_BASE_URL", "JIRA_USERNAME", "JIRA_PASSWORD"])("throws ConfigError naming missing %s", (k) => {
  expect(() => loadConfig({ ...base, [k]: undefined })).toThrow(new RegExp(k));   // instance of ConfigError
});
it("strips trailing slashes but keeps context path", () =>
  expect(loadConfig({ ...base, JIRA_BASE_URL: "https://host/jira//" }).baseUrl).toBe("https://host/jira"));
it.each([["true", true], ["TRUE", true], ["1", true], ["false", false], ["0", false]])("parses READ_ONLY=%s", (v, want) =>
  expect(loadConfig({ ...base, JIRA_READ_ONLY: v }).readOnly).toBe(want));
it("rejects bad boolean", () => expect(() => loadConfig({ ...base, JIRA_INSECURE_TLS: "yes" })).toThrow(ConfigError));
it("parses timeout and rejects non-positive", () => {
  expect(loadConfig({ ...base, JIRA_TIMEOUT_MS: "5000" }).timeoutMs).toBe(5000);
  expect(() => loadConfig({ ...base, JIRA_TIMEOUT_MS: "0" })).toThrow(ConfigError);
});
it("rejects non-http base URL", () => expect(() => loadConfig({ ...base, JIRA_BASE_URL: "pm.gem-corp.tech" })).toThrow(ConfigError));
```

- [ ] **Step 3: Run** `npx vitest run test/config.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `loadConfig` in `src/config.ts`** with a zod schema over `env`; empty string counts as missing; ConfigError message lists every failing variable.

- [ ] **Step 5: Run** `npx vitest run test/config.test.ts && npx tsc --noEmit` — Expected: PASS, no type errors.

- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: scaffold project and config loading"`

---

### Task 2: JiraError + JiraClient

**Files:**
- Create: `src/jira/errors.ts`, `src/jira/client.ts`, `test/helpers.ts`
- Test: `test/client.test.ts`, `test/errors.test.ts`

**Interfaces:**
- Consumes: `Config` (Task 1).
- Produces:
  ```ts
  // errors.ts
  export class JiraError extends Error {
    constructor(init: { status: number; method: string; path: string; messages: string[]; fieldErrors: Record<string, string>; captcha: boolean; statusText?: string })
    readonly status: number; readonly method: string; readonly path: string; readonly messages: string[]; readonly fieldErrors: Record<string, string>; readonly captcha: boolean
    static async fromResponse(res: Response, method: string, path: string): Promise<JiraError>
  }
  export function formatError(err: unknown): string
  // client.ts
  export type Query = Record<string, string | number | boolean | undefined>
  export class JiraClient {
    constructor(cfg: Pick<Config, "baseUrl" | "username" | "password" | "timeoutMs">, opts?: { retryDelayMs?: number })  // default 1000
    readonly baseUrl: string
    get<T>(path: string, query?: Query): Promise<T>
    post<T>(path: string, body?: unknown, query?: Query): Promise<T>
    put<T>(path: string, body?: unknown): Promise<T>
    postMultipart<T>(path: string, form: FormData): Promise<T>
    getBinary(url: string): Promise<{ data: ArrayBuffer; contentType: string }>
  }
  // test/helpers.ts
  export const BASE_URL = "https://jira.test/ctx";
  export const mswServer: SetupServerApi;   // setupServer(); listen({ onUnhandledRequest: "error" }) in beforeAll, resetHandlers afterEach, close afterAll — exported helper `useMsw()` registers these hooks
  export function makeClient(): JiraClient  // BASE_URL, user "alice", password "s3cret", timeoutMs 200, retryDelayMs 0
  ```

**Error copy (exact strings `formatError` returns):**
- 400: `Yêu cầu không hợp lệ (400):` then one line per `errorMessages` entry and one `- <field>: <message>` per field error, then `Gợi ý: dùng jira_get_create_meta hoặc jira_search_fields để kiểm tra field.`
- 401: `Xác thực thất bại: sai username/password.`
- 403 with captcha: `Tài khoản đang bị yêu cầu CAPTCHA — đăng nhập Jira trên trình duyệt một lần để mở khoá.`
- 403 otherwise: `Không có quyền thực hiện thao tác.` + Jira messages if any
- 404: `Không tìm thấy <METHOD> <path> hoặc không có quyền xem.`
- other status: `Lỗi Jira <status> <statusText>` + messages
- non-JiraError: `err.message` (or `String(err)`)

- [ ] **Step 1: Write failing tests `test/errors.test.ts`**
  - `fromResponse` parses `{errorMessages:["a"], errors:{summary:"required"}}` → messages `["a"]`, fieldErrors `{summary:"required"}`.
  - `fromResponse` on `text/html` body `"<html>502</html>"` with status 502 → messages `[]`, no throw, status 502.
  - `fromResponse` on empty body → no throw.
  - `captcha` is true when header `X-Authentication-Denied-Reason: CAPTCHA_CHALLENGE; login-url=...`.
  - `formatError` returns each exact string above for 400 (with field line `- summary: required`), 401, 403+captcha, 404 (`Không tìm thấy GET /rest/api/2/issue/X-1 hoặc không có quyền xem.`), and `new Error("boom")` → `"boom"`.

- [ ] **Step 2: Write failing tests `test/client.test.ts`** (msw handlers on `${BASE_URL}/rest/api/2/...`)
  - `sends Basic auth as UTF-8`: client with password `pä:ss` → header equals `"Basic " + Buffer.from("alice:pä:ss", "utf8").toString("base64")`; `Accept: application/json`.
  - `keeps context path`: `get("/rest/api/2/myself")` hits `https://jira.test/ctx/rest/api/2/myself`.
  - `encodes query and skips undefined`: `get("/x", { username: "Nguyễn", a: undefined, n: 5 })` → request URL search params `username=Nguyễn` (decoded), `n=5`, no `a`.
  - `post sends JSON` with `Content-Type: application/json`; `put` likewise.
  - `204 returns undefined`.
  - `throws JiraError on 400` with parsed field errors.
  - `retries GET once on 503 then succeeds` (handler counts calls → 2).
  - `GET gives up after one retry` (always 503 → JiraError 503, calls = 2).
  - `does not retry POST on 503` (calls = 1).
  - `does not retry 401` (calls = 1).
  - `times out` (handler `await delay(500)`; timeoutMs 200) → rejects; GET was attempted twice.
  - `postMultipart` sends `X-Atlassian-Token: no-check` and no explicit JSON content-type.
  - `getBinary` returns bytes and content type.

- [ ] **Step 3: Run** `npx vitest run test/errors.test.ts test/client.test.ts` — Expected: FAIL.

- [ ] **Step 4: Implement `src/jira/errors.ts` and `src/jira/client.ts`.** URL = `baseUrl + path` (path always starts with `/rest/`), then append query via `URL.searchParams`. Timeout via `AbortSignal.timeout(timeoutMs)`. Read body as text first, `JSON.parse` only if non-empty. Network/timeout errors on non-GET are rethrown as-is.

- [ ] **Step 5: Run** the two test files — Expected: PASS.

- [ ] **Step 6: Commit** `git commit -m "feat: add JiraClient with error mapping and GET retry"`

---

### Task 3: Output formatting

**Files:**
- Create: `src/jira/format.ts`
- Test: `test/format.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const MAX_TEXT = 10_000
  export interface SlimUser { name: string; displayName: string }
  export interface SlimSprint { id: number; name: string; state: string }
  export interface Paged<T> { items: T[]; total: number; startAt: number; maxResults: number; hasMore: boolean }
  export function truncate(s: string | null | undefined, hint: string): string | null
  export function slimUser(u: any): SlimUser | null
  export function parseSprintValue(v: unknown): SlimSprint[]
  export function slimComment(c: any): { id: string; author: SlimUser | null; body: string | null; created: string; updated: string }
  export function slimWorklog(w: any): { id: string; author: SlimUser | null; timeSpent: string; timeSpentSeconds: number; started: string; comment: string | null }
  export function slimSprint(s: any): SlimSprint & { startDate?: string; endDate?: string; goal?: string; boardId?: number }
  export function slimIssue(raw: any, opts: { baseUrl: string; sprintFieldId?: string; full?: boolean }): Record<string, unknown>
  export function paged<T>(items: T[], meta: { total: number; startAt: number; maxResults: number }): Paged<T>
  export function toJiraDate(input?: string | Date): string
  ```

`slimIssue` always returns `key, url (<baseUrl>/browse/<key>), summary, status, issuetype, priority, assignee, updated` (only those present in `fields`). With `full: true` it adds `reporter, labels, description (truncated), created, resolution, parent {key, summary}, subtasks [{key, summary, status}], issuelinks [{type, direction: "inward"|"outward", key, summary, status}], attachments [{id, filename, size, mimeType}], comments (last 10, slimComment)`, plus `sprint` when `sprintFieldId` is set. Custom fields not listed are passed through as-is if their value is a primitive or array of primitives, dropped otherwise.

- [ ] **Step 1: Write failing tests**
  - `truncate`: 10 000-char string unchanged; 10 001-char string → first 10 000 chars + `"…[truncated] " + hint`; null → null.
  - `slimUser({name:"alice", displayName:"Alice", avatarUrls:{}})` → `{name:"alice", displayName:"Alice"}`; null → null.
  - `parseSprintValue` on legacy string `"com.atlassian.greenhopper.service.sprint.Sprint@1a[id=12,rapidViewId=3,state=ACTIVE,name=Sprint 5,startDate=...]"` → `[{id:12, name:"Sprint 5", state:"ACTIVE"}]`; on objects `[{id:1,name:"S",state:"closed"}]` → same shape; null → `[]`.
  - `slimIssue` minimal fixture → no `self`/`expand`/`avatarUrls` anywhere (`JSON.stringify` doesn't contain them), status is a string, url correct; `full` fixture with an inward link → `direction: "inward"`, 15 comments → 10 latest kept.
  - `paged([1,2], {total: 5, startAt: 0, maxResults: 2}).hasMore === true`; `{total: 2, startAt: 0}` → false.
  - `toJiraDate("2026-10-08T09:00:00+07:00") === "2026-10-08T09:00:00.000+0700"`; `toJiraDate("2026-10-08T02:00:00Z") === "2026-10-08T02:00:00.000+0000"`; `toJiraDate("2026-10-08T09:00:00.123-05:30") === "2026-10-08T09:00:00.123-0530"`; `toJiraDate(new Date(...))` uses local offset and matches `/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d{4}$/`; `toJiraDate("not a date")` throws.

- [ ] **Step 2: Run** `npx vitest run test/format.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `src/jira/format.ts`.** For string input to `toJiraDate`, keep the wall-clock and offset written in the string (regex on the ISO form); input without an offset is treated as local time.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat: add Jira response formatters"`

---

### Task 4: Tool framework, field cache, test harness, meta tools

**Files:**
- Create: `src/jira/fields.ts`, `src/tools/define.ts`, `src/tools/meta.ts`
- Modify: `test/helpers.ts` (add `connectTools`)
- Test: `test/define.test.ts`, `test/meta.test.ts`

**Interfaces:**
- Consumes: `JiraClient`, `formatError`, format helpers.
- Produces:
  ```ts
  // fields.ts
  export interface JiraField { id: string; name: string; custom: boolean; schema?: { type?: string; custom?: string } }
  export class FieldCache { constructor(client: JiraClient); all(): Promise<JiraField[]>; sprintFieldId(): Promise<string | undefined> }  // one GET /field per instance; sprint = schema.custom === "com.pyxis.greenhopper.jira:gh-sprint"
  // define.ts
  export interface ToolContext { server: McpServer; client: JiraClient; fields: FieldCache; readOnly: boolean }
  export function jsonResult(data: unknown): CallToolResult   // { content: [{ type: "text", text: JSON.stringify(data ?? { ok: true }, null, 2) }] }
  export function defineTool<S extends ZodRawShape>(ctx: ToolContext, name: string, spec: { description: string; input: S; write?: boolean }, fn: (args: z.objectOutputType<S, ZodTypeAny>) => Promise<unknown>): void
      // returns without registering if spec.write && ctx.readOnly; catch → { isError: true, content: [{ type: "text", text: formatError(e) }] }
  // every tools/*.ts
  export function register(ctx: ToolContext): void
  // test/helpers.ts
  export async function connectTools(registers: Array<(ctx: ToolContext) => void>, opts?: { readOnly?: boolean }): Promise<{ client: Client; call(name: string, args?: object): Promise<CallToolResult>; json(name: string, args?: object): Promise<any> }>
      // builds McpServer + ToolContext(makeClient()), links via InMemoryTransport.createLinkedPair(); json() asserts !isError and JSON.parses content[0].text
  ```

Meta tools (all read): `jira_list_projects` → `[{id, key, name}]`; `jira_get_create_meta {projectKey, issueType?}` → `GET /rest/api/2/issue/createmeta?projectKeys=<k>&expand=projects.issuetypes.fields` (+ `issuetypeNames=<t>` if given) → `[{issueType, fields: [{id, name, required, allowedValues?: string[] (name ?? value, max 50)}]}]`; `jira_search_fields {query?}` → FieldCache filtered case-insensitively on id or name → `[{id, name, custom, type}]`; `jira_search_users {query, maxResults? (default 20, max 100)}` → `GET /user/search?username=<q>&maxResults=` → `[{name, displayName, emailAddress, active}]`; `jira_list_link_types` → `[{id, name, inward, outward}]`.

- [ ] **Step 1: Write failing tests**
  - `define.test.ts`: write tool absent from `listTools` when `readOnly: true`, present when false; read tool always present; a fn throwing `JiraError` 401 → `isError: true` with text `Xác thực thất bại: sai username/password.`; fn returning `undefined` → text `{"ok": true}` (pretty-printed).
  - `define.test.ts` also covers FieldCache: two `sprintFieldId()` calls → one HTTP request; returns `customfield_10004` from fixture.
  - `meta.test.ts`: each of the five tools happy path asserting method/path/query and slim output; `jira_search_users` with `query: "Nguyễn"` sends `username=Nguyễn` (decoded); `jira_get_create_meta` for unknown project (Jira returns `projects: []`) → `isError` with text containing the project key.

- [ ] **Step 2: Run** `npx vitest run test/define.test.ts test/meta.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `fields.ts`, `define.ts`, `meta.ts`, `connectTools`. Tool descriptions are English one-liners stating purpose and Server-specific hints (e.g. search_users: "Find users by username/display name; use the returned `name` for assignee fields").

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `git commit -m "feat: add tool framework and metadata tools"`

---

### Task 5: Issue read tools

**Files:**
- Create: `src/tools/issues.ts` (read part)
- Test: `test/issues-read.test.ts`

**Interfaces:**
- Consumes: `defineTool`, `FieldCache.sprintFieldId`, `slimIssue`, `paged`.
- Produces: `register(ctx)` in `issues.ts` (Task 6 adds write tools to the same function).

Tools:
- `jira_search {jql, fields?: string[], maxResults?: int 1..100 default 20, startAt?: int ≥0 default 0}` → `POST /rest/api/2/search` body `{jql, startAt, maxResults, fields: fields ?? ["summary","status","assignee","issuetype","priority","updated"]}` → `paged(issues.map(slimIssue), …)`.
- `jira_get_issue {issueKey, expand?: string[]}` → `GET /rest/api/2/issue/{key}` (`expand` joined by `,`) → `slimIssue(raw, {full: true, sprintFieldId})`. Comments come from `fields.comment.comments`.
- `jira_get_transitions {issueKey}` → `GET /issue/{key}/transitions` → `[{id, name, to}]`.

`issueKey` schema everywhere: `z.string().trim().min(1)`, upper-cased before use.

- [ ] **Step 1: Write failing tests**: search sends exact default body; `maxResults: 101` rejected by schema (`isError`); `hasMore` true when total > returned; get_issue returns `sprint` parsed from legacy string fixture and 10 comments; `issueKey: " abc-1 "` requests `/issue/ABC-1`; 404 → text `Không tìm thấy GET /rest/api/2/issue/ABC-1 hoặc không có quyền xem.`; get_transitions slim shape.
- [ ] **Step 2: Run** `npx vitest run test/issues-read.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** read tools in `src/tools/issues.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add issue search and read tools"`

---

### Task 6: Issue write tools

**Files:**
- Modify: `src/tools/issues.ts`
- Test: `test/issues-write.test.ts`

**Interfaces:**
- Produces (internal, exported for Task 7 reuse): `export function buildIssueFields(input: IssueFieldInput): Record<string, unknown>` where `IssueFieldInput = { summary?; description?; assignee?: string | null; priority?; labels?: string[]; parentKey?; customFields?: Record<string, unknown> }` mapping to `summary`, `description`, `assignee: {name} | null`, `priority: {name}`, `labels`, `parent: {key}`, then spreading `customFields`.

Tools (all `write: true`):
- `jira_create_issue {projectKey, issueType, summary, …IssueFieldInput}` → `POST /issue` body `{fields: {project: {key}, issuetype: {name}, ...buildIssueFields}}` → `{key, url}`.
- `jira_update_issue {issueKey, …IssueFieldInput}` → `PUT /issue/{key}` body `{fields}`; schema refine: at least one field besides `issueKey` → else `isError`. Returns `{key, url}`.
- `jira_assign_issue {issueKey, assignee: string | null}` → `PUT /issue/{key}/assignee` body `{name: assignee}` → `{ok: true}`.
- `jira_transition_issue {issueKey, transition, comment?, resolution?, fields?: record}` → `GET /issue/{key}/transitions`; match by exact id, else case-insensitive trimmed name; none → `isError` text `Không có transition "<x>" cho <KEY>. Các transition hợp lệ: <name (id)>, …`; then `POST /issue/{key}/transitions` body `{transition: {id}, fields?: {...fields, resolution?: {name}}, update?: {comment: [{add: {body}}]}}` (omit empty keys) → `{key, url, status: <to name>}`.

- [ ] **Step 1: Write failing tests**: create body exact (incl. `customfield_10002: 5` spread and `parent`); create 400 → field-error text; update with only `issueKey` → `isError`, no HTTP call; update sends only given fields; assign `null` sends `{name: null}`; transition by name `"in progress"` matches `"In Progress"` id `21` and posts comment+resolution body exactly; unknown transition lists valid ones; all five absent with `readOnly: true`.
- [ ] **Step 2: Run** `npx vitest run test/issues-write.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run` — Expected: all PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add issue create/update/assign/transition tools"`

---

### Task 7: Comments + worklogs

**Files:**
- Create: `src/tools/comments.ts`, `src/tools/worklogs.ts`
- Test: `test/comments.test.ts`, `test/worklogs.test.ts`

Tools:
- `jira_get_comments {issueKey, startAt? default 0, maxResults? default 50 max 100}` → `GET /issue/{key}/comment?startAt=&maxResults=&orderBy=created` → `paged(slimComment…)`.
- `jira_add_comment {issueKey, body}` *(write)* → `POST /issue/{key}/comment {body}` → `{id, url: <baseUrl>/browse/<KEY>?focusedCommentId=<id>}`.
- `jira_update_comment {issueKey, commentId, body}` *(write)* → `PUT /issue/{key}/comment/{id} {body}` → `{id}`.
- `jira_get_worklogs {issueKey}` → `GET /issue/{key}/worklog` → `paged(slimWorklog…)`.
- `jira_add_worklog {issueKey, timeSpent, started?, comment?, adjustEstimate?: "auto"|"leave"|"new"|"manual", newEstimate?, reduceBy?}` *(write)* → `POST /issue/{key}/worklog` with query `{adjustEstimate, newEstimate, reduceBy}` and body `{timeSpent, started: toJiraDate(started), comment?}` → `{id, timeSpent, started}`. Schema refine: `adjustEstimate: "new"` requires `newEstimate`; `"manual"` requires `reduceBy`.

- [ ] **Step 1: Write failing tests**: each tool happy path asserting path/query/body; `started: "2026-10-08T09:00:00+07:00"` is sent as `2026-10-08T09:00:00.000+0700`; `adjustEstimate: "new"` without `newEstimate` → `isError`, no HTTP call; long comment body in get_comments truncated; write tools absent in read-only.
- [ ] **Step 2: Run** `npx vitest run test/comments.test.ts test/worklogs.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add comment and worklog tools"`

---

### Task 8: Links + attachments

**Files:**
- Create: `src/tools/links.ts`, `src/tools/attachments.ts`
- Test: `test/links.test.ts`, `test/attachments.test.ts`

Tools:
- `jira_link_issues {type, inwardIssue, outwardIssue, comment?}` *(write)* → `POST /issueLink {type: {name}, inwardIssue: {key}, outwardIssue: {key}, comment?: {body}}` → `{ok: true}`.
- `jira_upload_attachment {issueKey, filePath}` *(write)* → `fs.stat`: missing → `isError` `Không tìm thấy file: <path>`; not a regular file → `isError`; size > 10 485 760 → `isError` `File vượt quá giới hạn 10MB: <path> (<size> bytes)`; else `FormData` field `file` = `new Blob([await readFile(p)])` with `basename(p)` → `postMultipart("/rest/api/2/issue/{key}/attachments")` → `[{id, filename, size}]`.
- `jira_download_attachment {attachmentId, destPath, overwrite? default false}` → `GET /rest/api/2/attachment/{id}` → meta `{content, filename, size}`; if `new URL(content).origin !== new URL(client.baseUrl).origin` → `isError` `URL tải file khác host Jira, từ chối gửi thông tin đăng nhập: <content>`; if `destPath` exists and is a directory → write to `join(destPath, filename)`; if target file exists and `!overwrite` → `isError` `File đã tồn tại: <path> (dùng overwrite: true để ghi đè)`; `mkdir -p` the parent; write bytes from `getBinary(content)` → `{path, size, mimeType}`.

- [ ] **Step 1: Write failing tests** (use `mkdtemp` under `os.tmpdir()` for files): link body exact; upload sends multipart with field `file` named after basename and header `X-Atlassian-Token: no-check`; upload missing file → error text, no HTTP call; upload file of 10 485 761 bytes → size error, no HTTP call; download writes exact bytes into a directory dest using `filename`; download refuses existing file without overwrite and succeeds with it; download with `content: "https://evil.test/x"` → origin error and no request to `evil.test` (msw `onUnhandledRequest: "error"` guarantees this).
- [ ] **Step 2: Run** `npx vitest run test/links.test.ts test/attachments.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add issue link and attachment tools"`

---

### Task 9: Agile tools

**Files:**
- Create: `src/tools/agile.ts`
- Test: `test/agile.test.ts`

All under `/rest/agile/1.0`:
- `jira_list_boards {projectKey?, name?, type?: "scrum"|"kanban", startAt? 0, maxResults? 50 (max 100)}` → `GET /board?projectKeyOrId=&name=&type=` → `paged([{id, name, type}])` using Jira's `total` if present, else `isLast` (`hasMore = !isLast`).
- `jira_list_sprints {boardId, state? default "active,future", startAt?, maxResults?}` → `GET /board/{id}/sprint?state=` → `paged(slimSprint…)` (same `isLast` handling).
- `jira_get_sprint_issues {sprintId, jql?, startAt? 0, maxResults? 20 (max 100)}` → `GET /sprint/{id}/issue?jql=&fields=summary,status,assignee,issuetype,priority,updated` → `paged(slimIssue…)`.
- `jira_move_issues_to_sprint {sprintId, issueKeys: string[] 1..50}` *(write)* → `POST /sprint/{id}/issue {issues: keys upper-cased}` → `{ok: true}`.
- `jira_create_sprint {boardId, name, startDate?, endDate?, goal?}` *(write)* → `POST /sprint {originBoardId: boardId, name, startDate?, endDate?, goal?}` → `slimSprint`.
- `jira_update_sprint {sprintId, name?, state?: "active"|"closed", startDate?, endDate?, goal?}` *(write)* → `POST /sprint/{id}` with only given keys; at least one besides `sprintId` → else `isError`, no HTTP call → `slimSprint`.

Sprint dates are passed through as ISO strings (agile API accepts ISO-8601).

- [ ] **Step 1: Write failing tests**: each happy path asserting path/query/body; `isLast: false` → `hasMore: true`; 51 keys rejected; update_sprint with only id rejected; write tools absent in read-only.
- [ ] **Step 2: Run** `npx vitest run test/agile.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: add agile board and sprint tools"`

---

### Task 10: Server assembly, startup checks, entry point

**Files:**
- Create: `src/server.ts`, `src/index.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: all `register` functions, `JiraClient`, `FieldCache`, `Config`.
- Produces:
  ```ts
  export async function startupChecks(client: JiraClient): Promise<{ user: SlimUser; agile: boolean }>  // GET /myself (throws JiraError on failure); GET /rest/agile/1.0/board?maxResults=1 → agile = 2xx, any error → false
  export function createServer(client: JiraClient, opts: { readOnly: boolean; agile: boolean }): McpServer  // name "jira-server-mcp", version from package.json; registers meta, issues, comments, worklogs, links, attachments, and agile iff opts.agile
  ```

`src/index.ts` (shebang `#!/usr/bin/env node`): `loadConfig(process.env)` (ConfigError → stderr `[jira-mcp] <message>`, exit 1); if `insecureTls` set `NODE_TLS_REJECT_UNAUTHORIZED = "0"` and warn on stderr; `startupChecks` (JiraError → stderr `[jira-mcp] ` + `formatError(e)`, exit 1); stderr `[jira-mcp] connected as <name>, agile tools: on|off, read-only: on|off`; `server.connect(new StdioServerTransport())`.

- [ ] **Step 1: Write failing tests `test/server.test.ts`**
  - `startupChecks` returns `{user:{name:"alice",…}, agile:true}` when both 200; `agile:false` when board returns 404; throws `JiraError` with `captcha: true` when `/myself` 401 + CAPTCHA header, and makes exactly one `/myself` request.
  - `createServer({readOnly:false, agile:true})` lists exactly the 26 tool names from spec §4 (assert sorted array equality).
  - `{readOnly:true, agile:true}` lists exactly the 14 read tools; `{readOnly:false, agile:false}` excludes all 6 agile tools.
- [ ] **Step 2: Run** `npx vitest run test/server.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `server.ts` and `index.ts`.
- [ ] **Step 4: Run** `npx vitest run && npm run build && JIRA_BASE_URL= node dist/index.js; echo $?` — Expected: all tests PASS; last command prints `[jira-mcp] …JIRA_BASE_URL…` to stderr and exits `1`.
- [ ] **Step 5: Commit** `git commit -m "feat: wire server startup and stdio entry point"`

---

### Task 11: Smoke script + README

**Files:**
- Create: `scripts/smoke.ts`, `README.md`

`scripts/smoke.ts`: spawns `node dist/index.js` via the SDK's `StdioClientTransport` with `process.env` (loaded from `.env` by `tsx --env-file`), then calls **read tools only**: `listTools` (print count), `jira_search {jql: "assignee = currentUser() ORDER BY updated DESC", maxResults: 5}`, `jira_get_issue` on the first result (if any), `jira_list_boards {maxResults: 5}` (if listed). Prints a one-line summary per call; exits non-zero if any result has `isError`.

`README.md` (Vietnamese): purpose; requirements (Node ≥ 20, Jira Server 8.5, Basic Auth); install option A (`npx -y git+https://<git-nội-bộ>/jira-mcp.git`) and option B (clone, `npm ci && npm run build`, `node /path/dist/index.js`), each with a `.mcp.json` example using `https://pm.gem-corp.tech`; env var table from spec §3; security warning (password in plain text, never commit `.mcp.json`/`.env`, too many wrong passwords trigger CAPTCHA → log in via browser once); tool list grouped read/write/agile; dev commands (`npm test`, `npm run smoke`, `npx @modelcontextprotocol/inspector node dist/index.js`).

- [ ] **Step 1: Write** `scripts/smoke.ts` and `README.md`.
- [ ] **Step 2: Run** `npx tsc --noEmit -p . && npx tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 --strict --skipLibCheck scripts/smoke.ts` — Expected: no errors.
- [ ] **Step 3: Run (needs a real `.env` from the user)** `npm run build && npm run smoke` — Expected: every line OK, exit 0. If no `.env` is available, stop and ask the user to run `! npm run smoke` after filling `.env`.
- [ ] **Step 4: Commit** `git commit -m "docs: add README and smoke test script"`
