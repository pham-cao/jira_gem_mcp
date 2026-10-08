# Confluence MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 13 `confluence_*` tools (Confluence Server 6.11, Basic Auth, same account as Jira) to the existing jira-server-mcp process, enabled only when `CONFLUENCE_BASE_URL` is set.

**Architecture:** The Jira HTTP client and error class are generalised into `src/http/` (`HttpClient`, `HttpError`) carrying a `service` name; `JiraClient`/`JiraError` stay as thin Jira-flavoured aliases so existing code and tests are untouched. A second `HttpClient` for Confluence is put on `ToolContext.confluence`; tools in `src/tools/confluence/*` use it, and `src/confluence/convert.ts` converts Markdown ↔ storage XHTML with `marked` and `turndown`.

**Tech Stack:** TypeScript (ESM, NodeNext), Node ≥ 20, `@modelcontextprotocol/sdk` 1.x, `zod` 3, `marked` ^18, `turndown` ^7 (+ `@types/turndown`), `turndown-plugin-gfm` ^1, `vitest`, `msw` 2.

**Spec:** `docs/superpowers/specs/2026-10-08-confluence-mcp-design.md`

## Global Constraints

- No Confluence client libraries; HTTP only through `HttpClient` (global `fetch`). New runtime deps limited to `marked`, `turndown`, `turndown-plugin-gfm` (pure JS).
- REST base `/rest/api`. Content paths `/rest/api/content/...`.
- Env: `CONFLUENCE_BASE_URL` (optional; same validation as `JIRA_BASE_URL`), `CONFLUENCE_USERNAME` (default `JIRA_USERNAME`), `CONFLUENCE_PASSWORD` (default `JIRA_PASSWORD`). `JIRA_READ_ONLY`, `JIRA_INSECURE_TLS`, `JIRA_TIMEOUT_MS` apply to both services.
- Tool names prefixed `confluence_`. Write tools (`write: true`) are not registered when read-only.
- Every Confluence id argument (`pageId`, `attachmentId`, `parentId`, `parentCommentId`) is validated with `/^\d+$/` before use in a path.
- Without `CONFLUENCE_BASE_URL`, tool list and behaviour are identical to today. Existing Jira tests must pass with no change to their assertions.
- Page URL = `baseUrl + _links.webui`. Download URL = `baseUrl + _links.download`.
- Logs to stderr only; never log passwords or `Authorization`.
- All user-facing copy is Vietnamese; exact strings are fixed in the task that introduces them.

## Review Focus

1. Storage contains self-closing namespaced tags (`<ri:page ri:content-title="X" />`). The HTML parser treats them as open tags and swallows following siblings → they must be expanded before parsing. Test in Task 4.
2. Code macro bodies are wrapped in `<![CDATA[…]]>`, which an HTML parser turns into a comment → content must be extracted before parsing. Test in Task 4.
3. `confluence_update_page` with only `title` must re-send the current storage body unchanged (Confluence otherwise empties the page). Test in Task 5.
4. Markdown text with `<`, `&`, raw HTML and Vietnamese must produce well-formed XHTML (escaped entities, no raw HTML passthrough). Test in Task 3.
5. Confluence under a context path (`https://host/wiki`) with relative `_links.download` (`/download/attachments/…`) must download from `https://host/wiki/download/…`, and the origin check still applies. Test in Task 7.

---

### Task 1: Generalise the HTTP client and errors

**Files:**
- Create: `src/http/client.ts`, `src/http/errors.ts`
- Modify: `src/jira/client.ts` (becomes a subclass), `src/jira/errors.ts` (becomes re-exports)
- Test: `test/http-errors.test.ts` (new); existing `test/client.test.ts`, `test/errors.test.ts`, `test/review-fixes.test.ts` must pass unchanged

**Interfaces:**
- Produces:
  - `type Service = "Jira" | "Confluence"`
  - `class HttpClient` — constructor `(cfg: { baseUrl; username; password; timeoutMs; service?: Service }, opts?: { retryDelayMs?: number })`, `service` defaults to `"Jira"`; public `readonly baseUrl: string`, `readonly service: Service`; methods `get`, `post`, `put`, `postMultipart`, `getBinary` with today's signatures.
  - `class HttpError extends Error` — today's `JiraError` fields plus `readonly service: Service` (init field optional, default `"Jira"`); `static fromResponse(res, method, path, service: Service = "Jira")`.
  - `formatError(err: unknown): string` in `src/http/errors.ts`.
  - `src/jira/errors.ts`: `export { HttpError as JiraError, formatError } from "../http/errors.js"` (type export too). `src/jira/client.ts`: `export class JiraClient extends HttpClient {}` with service `"Jira"`.

- [ ] **Step 1: Write failing tests** in `test/http-errors.test.ts`:

```ts
it("parses Confluence error bodies", async () => {
  const res = new Response(JSON.stringify({ statusCode: 400, message: "Bad body", data: { errors: [{ message: { translation: "Title missing" } }] } }), { status: 400 });
  const e = await HttpError.fromResponse(res, "POST", "/rest/api/content", "Confluence");
  expect(e.service).toBe("Confluence");
  expect(e.messages).toEqual(["Bad body", "Title missing"]);
  expect(e.message).toBe("Confluence 400 POST /rest/api/content");
});
it("detects Confluence CAPTCHA via X-Seraph-LoginReason", async () => {
  const res = new Response(null, { status: 401, headers: { "X-Seraph-LoginReason": "AUTHENTICATION_DENIED" } });
  const e = await HttpError.fromResponse(res, "GET", "/x", "Confluence");
  expect(e.captcha).toBe(true);
  expect(formatError(e)).toBe("Tài khoản đang bị yêu cầu CAPTCHA — đăng nhập Confluence trên trình duyệt một lần để mở khoá.");
});
it("formats Confluence 400 with a storage hint", () => {
  expect(formatError(mk(400, { service: "Confluence", messages: ["bad xhtml"] }))).toBe(
    'Yêu cầu không hợp lệ (400):\nbad xhtml\nGợi ý: nội dung storage XHTML có thể không hợp lệ; thử format: "markdown".');
});
it("formats 409 as a version conflict", () => {
  expect(formatError(mk(409, { service: "Confluence" }))).toBe(
    "Xung đột khi ghi (409): trang vừa bị người khác sửa. Hãy đọc lại trang (confluence_get_page) để lấy version mới.");
});
it("names the service in network errors", async () => {
  const c = new HttpClient({ baseUrl: "https://nope.invalid", username: "u", password: "p", timeoutMs: 200, service: "Confluence" }, { retryDelayMs: 0 });
  const e = await c.get("/x").catch((x) => x);
  expect(formatError(e)).toMatch(/^Lỗi kết nối tới Confluence: /);
});
```

(`mk` = same helper as `test/errors.test.ts`, building `HttpError`.) Jira-only behaviour (400 hint about `jira_get_create_meta`, Jira CAPTCHA header, `Lỗi kết nối tới Jira`) stays as is.

- [ ] **Step 2: Run** `npx vitest run test/http-errors.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Move the body of `JiraClient` to `HttpClient` and `JiraError` to `HttpError`.
  - `request` / `getBinary` pass `this.service` to `fromResponse`. The non-JSON message starts with `${service} trả về nội dung không phải JSON`.
  - Network and timeout rejections from `fetch` are re-thrown after `Object.assign(err, { service })`. `formatPlainError` reads `(err as { service?: Service }).service ?? "Jira"` for both the connection and the timeout copy (`${service} không phản hồi…`, `Lỗi kết nối tới ${service}: …`, TLS hint `nếu ${service} dùng chứng chỉ…`).
  - `fromResponse` also reads `message` (string) and `data.errors[].message.translation`. CAPTCHA = Jira header contains `CAPTCHA_CHALLENGE` **or** `x-seraph-loginreason` contains `AUTHENTICATION_DENIED`.
  - `formatError`:
    - CAPTCHA and default copy use `err.service`.
    - 400 hint per service: Jira = today's line; Confluence = the line in the test.
    - New `case 409` uses the copy in the test, followed by `err.messages`.
  - The `Error.name` stays `"JiraError"` when `service === "Jira"` and is `"HttpError"` otherwise.

- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: all tests PASS, including untouched Jira tests.

- [ ] **Step 5: Commit** `refactor: extract HttpClient/HttpError with service name`

---

### Task 2: Config and test helpers for Confluence

**Files:**
- Modify: `src/config.ts`, `src/tools/define.ts`, `test/helpers.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: `HttpClient` (Task 1).
- Produces:
  - `Config.confluence?: { baseUrl: string; username: string; password: string }`. The key is omitted when `CONFLUENCE_BASE_URL` is unset.
  - `ToolContext.confluence?: HttpClient`.
  - `requireConfluence(ctx: ToolContext): HttpClient` in `define.ts`. It throws `Error("Confluence chưa được cấu hình")` when the client is absent.
  - `numericId = z.string().trim().regex(/^\d+$/, "must be a numeric id")` exported from `define.ts`.
  - Test helpers: `CONF_BASE = "https://conf.test/wiki"`, `CAPI = \`${CONF_BASE}/rest/api\``, `makeConfluenceClient(): HttpClient` (user `alice`, password `s3cret`, `service: "Confluence"`, timeout 200, retry 0). `connectTools(registers, { readOnly?, confluence?: boolean })` sets `ctx.confluence` when `confluence` is true.

- [ ] **Step 1: Write failing tests** in `test/config.test.ts`:

```ts
it("reuses Jira credentials for Confluence by default", () => {
  expect(loadConfig({ ...base, CONFLUENCE_BASE_URL: "https://conf.gem-corp.tech/" }).confluence)
    .toEqual({ baseUrl: "https://conf.gem-corp.tech", username: "u", password: "p" });
});
it("lets CONFLUENCE_USERNAME/PASSWORD override", () => {
  expect(loadConfig({ ...base, CONFLUENCE_BASE_URL: "https://c", CONFLUENCE_USERNAME: "cu", CONFLUENCE_PASSWORD: "cp" }).confluence)
    .toMatchObject({ username: "cu", password: "cp" });
});
it("omits confluence when CONFLUENCE_BASE_URL is unset", () => {
  expect("confluence" in loadConfig(base)).toBe(false);
});
it.each(["CONFLUENCE_USERNAME", "CONFLUENCE_PASSWORD"])("rejects %s without CONFLUENCE_BASE_URL", (k) => {
  expect(() => loadConfig({ ...base, [k]: "x" })).toThrow(/CONFLUENCE_BASE_URL/);
});
it("validates CONFLUENCE_BASE_URL as http(s)", () => {
  expect(() => loadConfig({ ...base, CONFLUENCE_BASE_URL: "ftp://c" })).toThrow(/CONFLUENCE_BASE_URL/);
});
```

- [ ] **Step 2: Run** `npx vitest run test/config.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Reuse the existing URL schema for an optional `CONFLUENCE_BASE_URL`, with empty string treated as unset.
  - The cross-field check goes in `superRefine` with path `["CONFLUENCE_BASE_URL"]` and message `is required when CONFLUENCE_USERNAME/CONFLUENCE_PASSWORD is set`.
  - Add the `define.ts` and `test/helpers.ts` exports listed above.

- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `feat: add Confluence config and tool context`

---

### Task 3: Markdown → storage

**Files:**
- Create: `src/confluence/convert.ts`
- Modify: `package.json` (add `marked`)
- Test: `test/confluence-convert.test.ts`

**Interfaces:**
- Produces: `markdownToStorage(md: string): string`

- [ ] **Step 1: Write failing tests:**

```ts
it("renders code blocks as the code macro", () => {
  expect(markdownToStorage("```ts\nconst a = 1 < 2;\n```")).toBe(
    '<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">ts</ac:parameter>' +
    "<ac:plain-text-body><![CDATA[const a = 1 < 2;]]></ac:plain-text-body></ac:structured-macro>");
});
it("omits the language parameter when none is given", () => {
  expect(markdownToStorage("```\nx\n```")).not.toContain("ac:parameter");
});
it("splits ]]> inside code", () => {
  expect(markdownToStorage("```\na]]>b\n```")).toContain("<![CDATA[a]]]]><![CDATA[>b]]>");
});
it("escapes raw HTML and special characters", () => {
  const out = markdownToStorage('Tiếng Việt a < b & c <script>x</script>');
  expect(out).toBe("<p>Tiếng Việt a &lt; b &amp; c &lt;script&gt;x&lt;/script&gt;</p>");
});
it("self-closes void elements", () => {
  const out = markdownToStorage("a  \nb\n\n---\n\n![alt](https://x/i.png)");
  expect(out).toContain("<br />");
  expect(out).toContain("<hr />");
  expect(out).toMatch(/<img src="https:\/\/x\/i.png" alt="alt" \/>/);
});
it("renders GFM tables and nested lists", () => {
  const out = markdownToStorage("| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n  - y");
  expect(out).toContain("<table>");
  expect(out).toContain("<td>2</td>");
  expect(out).toMatch(/<li>x\s*<ul>\s*<li>y<\/li>/);
});
it("renders task list items as text, not inputs", () => {
  expect(markdownToStorage("- [x] done")).not.toContain("<input");
});
```

- [ ] **Step 2: Run** `npx vitest run test/confluence-convert.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** with `npm i marked`, using a dedicated `new Marked({ gfm: true, renderer: { … } })` instance (never the global `marked`).
  - Override renderers `code`, `html` (escape the token text), `br`, `hr`, `image` (self-closing) and `checkbox` (`[x] ` / `[ ] `).
  - The code renderer uses the raw token text, so no HTML unescape is needed.
  - Trim the trailing newline of the whole output.

- [ ] **Step 4: Run** `npx vitest run test/confluence-convert.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit** `feat: convert Markdown to Confluence storage`

---

### Task 4: Storage → Markdown

**Files:**
- Modify: `src/confluence/convert.ts`, `package.json` (add `turndown`, `turndown-plugin-gfm`, dev `@types/turndown`)
- Create: `src/types/turndown-plugin-gfm.d.ts` (declare `gfm` plugin)
- Test: `test/confluence-convert.test.ts`

**Interfaces:**
- Produces: `storageToMarkdown(xhtml: string): string`

- [ ] **Step 1: Write failing tests:**

```ts
const code = (lang: string, body: string) =>
  `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${lang}</ac:parameter><ac:plain-text-body><![CDATA[${body}]]></ac:plain-text-body></ac:structured-macro>`;

it("keeps CDATA code content", () => {
  expect(storageToMarkdown(code("ts", "if (a < b) {}"))).toBe("```ts\nif (a < b) {}\n```");
});
it("does not swallow siblings after self-closing ri:/ac: tags", () => {
  const md = storageToMarkdown('<p><ac:link><ri:page ri:content-title="Spec" /></ac:link> và <strong>sau</strong></p>');
  expect(md).toBe("[Spec] và **sau**");
});
it.each([["info", "Info"], ["note", "Note"], ["warning", "Warning"], ["tip", "Tip"]])("renders %s panels", (name, label) => {
  const md = storageToMarkdown(`<ac:structured-macro ac:name="${name}"><ac:rich-text-body><p>Chú ý</p></ac:rich-text-body></ac:structured-macro>`);
  expect(md).toBe(`> **${label}:** Chú ý`);
});
it("renders jira macro as the issue key", () => {
  expect(storageToMarkdown('<p><ac:structured-macro ac:name="jira"><ac:parameter ac:name="key">ABC-12</ac:parameter></ac:structured-macro></p>')).toBe("ABC-12");
});
it("renders attachment images", () => {
  expect(storageToMarkdown('<ac:image><ri:attachment ri:filename="a.png" /></ac:image>')).toBe("![a.png]");
});
it("marks unknown macros", () => {
  expect(storageToMarkdown('<ac:structured-macro ac:name="toc" />')).toBe("[macro: toc]");
});
it("keeps tables", () => {
  expect(storageToMarkdown("<table><tbody><tr><th>a</th></tr><tr><td>1</td></tr></tbody></table>")).toContain("| a |");
});
it.each(["# Tiêu đề\n\nĐoạn **đậm**", "- a\n- b", "| a | b |\n| --- | --- |\n| 1 | 2 |", "```js\nx()\n```"])(
  "round-trips %j", (md) => { expect(storageToMarkdown(markdownToStorage(md))).toBe(md); });
```

- [ ] **Step 2: Run** `npx vitest run test/confluence-convert.test.ts` — Expected: new tests FAIL.

- [ ] **Step 3: Implement.**
  - Pre-process the string before handing it to Turndown:
    - (a) Replace each `<![CDATA[…]]>` with its HTML-escaped content.
    - (b) Expand `<(ac|ri):name attrs/>` into `<ac:name attrs></ac:name>`.
  - Use `new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced", bulletListMarker: "-" })` plus the `gfm` plugin.
  - Add custom rules, keyed on `node.nodeName` (upper-case, e.g. `AC:STRUCTURED-MACRO`) and `getAttribute("ac:name")`:
    - `code`/`noformat` macro → fenced block from the `ac:plain-text-body` text.
    - Panels → `> **Label:** ` + inner Markdown.
    - `jira` macro → value of the `key` parameter.
    - `ac:link` → `[content-title]` of its `ri:page` child.
    - `ac:image` → `![filename]`.
    - Any other macro → `[macro: name]`, followed by its rich-text body if one exists.
  - Unescape Turndown's `\[`/`\]` escapes only inside the generated `[…]` tokens.
  - Return the trimmed result.

- [ ] **Step 4: Run** `npx vitest run test/confluence-convert.test.ts && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `feat: convert Confluence storage to Markdown`

---

### Task 5: Page tools

**Files:**
- Create: `src/confluence/format.ts`, `src/tools/confluence/pages.ts`
- Test: `test/confluence-pages.test.ts`

**Interfaces:**
- Consumes: `requireConfluence`, `numericId`, `defineTool` (Task 2); `markdownToStorage`, `storageToMarkdown` (Tasks 3–4); test helpers `CAPI`, `CONF_BASE`, `connectTools(…, { confluence: true })`.
- Produces:
  - `slimPage(p: any, baseUrl: string): { id; type; title; space?: string; version?: number; lastModified?: string; url: string }`
  - `confluencePaged<T>(items: T[], r: { start; limit; size; _links?: { next?: string } }): { items; start; limit; size; hasMore: boolean }`
  - `toStorage(body: string, format: "markdown" | "storage"): string`
  - `register(ctx)` in `pages.ts` registering `confluence_search`, `confluence_get_page`, `confluence_get_page_children`, `confluence_list_spaces`, `confluence_create_page` ✎, `confluence_update_page` ✎.
- Parameters, defaults and API calls are exactly as in spec §5.1/§5.2: search `limit` default 25, max 100, `expand=space,version`; `get_page` `maxChars` default 50000; when looking up by `spaceKey` + `title` use `GET /rest/api/content?type=page&spaceKey=&title=` and take `results[0]`.

- [ ] **Step 1: Write failing tests** (msw on `CAPI`), one `it` each:
  - `confluence_search` sends `cql`, `limit=25`, `start=0`, `expand=space,version`, and returns slim items with `url === CONF_BASE + "/display/X/Page"` and `hasMore` from `_links.next`.
  - `confluence_get_page` by `pageId: "123"` returns `body` as Markdown, `version: 7`, and `ancestors: [{ id, title }]`.
  - With `format: "storage"`, the raw storage is returned.
  - With `maxChars: 10`, `body.length === 10`, `truncated: true` and `totalChars` are returned.
  - Lookup by `spaceKey` + `title` with no result → `isError` text `Không tìm thấy trang "T" trong space X`.
  - Passing neither `pageId` nor `spaceKey`+`title` → `isError`.
  - `pageId: "12/../1"` → `isError`, and no request is made (`onUnhandledRequest: "error"` guarantees this).
  - `confluence_create_page` POSTs `{ type: "page", title, space: { key }, ancestors: [{ id: "9" }], body: { storage: { value: "<p>Hi</p>", representation: "storage" } } }` from Markdown `Hi`. It returns `{ id, title, version, url }`.
  - `confluence_update_page` with `body` GETs version 4, then PUTs `version: { number: 5, minorEdit: false }` with the current title.
  - `confluence_update_page` with only `title` re-sends the current storage body unchanged (Review Focus 3).
  - `confluence_update_page` with `version: 3` while the server has 4 → `isError` text `Xung đột phiên bản: trang 123 đang ở version 4, không phải 3. Hãy đọc lại trang (confluence_get_page) rồi sửa lại.` and no PUT is sent.
  - `confluence_update_page` with neither `body` nor `title` → `isError`.
  - Read-only: `connectTools([register], { readOnly: true, confluence: true })` lists exactly the 4 read tools.

- [ ] **Step 2: Run** `npx vitest run test/confluence-pages.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `format.ts` and `pages.ts` to the interfaces above. Tool descriptions mention that `body` is Markdown by default and that `format: "storage"` takes Confluence XHTML.

- [ ] **Step 4: Run** `npx vitest run test/confluence-pages.test.ts && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `feat: add Confluence page tools`

---

### Task 6: Comment and label tools

**Files:**
- Create: `src/tools/confluence/comments.ts`, `src/tools/confluence/labels.ts`
- Modify: `src/confluence/format.ts` (add `slimConfluenceComment`)
- Test: `test/confluence-comments.test.ts`

**Interfaces:**
- Consumes: Task 5 `confluencePaged`, `toStorage`; Task 2 helpers.
- Produces:
  - `slimConfluenceComment(c: any): { id; author?: string; created?: string; parentId?: string; body: string }`, where `body` is Markdown and `author` is `c.history?.createdBy?.username`.
  - `register` in each file: `confluence_get_comments`, `confluence_add_comment` ✎, `confluence_get_labels`, `confluence_add_labels` ✎.

- [ ] **Step 1: Write failing tests:**
  - `get_comments` calls `GET …/123/child/comment` with `expand=body.storage,version,history,ancestors` and `depth=all`, and returns Markdown bodies.
  - A reply's `parentId` equals its last ancestor id.
  - `add_comment` POSTs `{ type: "comment", container: { id: "123", type: "page" }, body: { storage: { value: "<p><strong>ok</strong></p>", representation: "storage" } } }` from `**ok**`.
  - With `parentCommentId: "55"`, the body adds `ancestors: [{ id: "55" }]`.
  - `get_labels` returns `[{ name, prefix }]`.
  - `add_labels` POSTs `[{ prefix: "global", name: "a" }, { prefix: "global", name: "b" }]`.
  - `labels: []` is rejected (min 1).

- [ ] **Step 2: Run** `npx vitest run test/confluence-comments.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** to the interfaces above.

- [ ] **Step 4: Run** `npx vitest run test/confluence-comments.test.ts && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `feat: add Confluence comment and label tools`

---

### Task 7: Attachments and the shared download helper

**Files:**
- Create: `src/tools/download.ts`, `src/tools/confluence/attachments.ts`
- Modify: `src/tools/attachments.ts` (use the helper; keep `MAX_UPLOAD_BYTES` export)
- Test: `test/confluence-attachments.test.ts`; existing `test/attachments.test.ts` unchanged

**Interfaces:**
- Consumes: `HttpClient` (Task 1).
- Produces:
  - `downloadTo(client: HttpClient, a: { url: string; filename: string; destPath: string; overwrite: boolean }): Promise<{ path: string; size: number }>`. This is today's Jira logic moved over; the origin error copy becomes `URL tải file khác host ${client.service}, từ chối gửi thông tin đăng nhập: ${url}`.
  - `statOrNull(p)` and `readUploadFile(filePath): Promise<{ path: string; blob: Blob; name: string }>`. These enforce `MAX_UPLOAD_BYTES` with today's error copy and are moved to `download.ts`.
  - `register` in `confluence/attachments.ts`: `confluence_list_attachments`, `confluence_download_attachment` (`readOnlyHint: false`, not `write`), `confluence_upload_attachment` ✎.

- [ ] **Step 1: Write failing tests:**
  - `list_attachments` returns `{ id, title, mediaType, fileSize, version }` from `extensions.mediaType`, `extensions.fileSize` and `version.number`.
  - `download_attachment`:
    - GETs `…/content/{attachmentId}`, then downloads from `https://conf.test/wiki/download/attachments/1/a.txt?version=1` and writes the file into a temp dir under `basename(title)` (Review Focus 5).
    - Refuses to overwrite without `overwrite`.
    - When `_links.download` is absolute and on another origin (`https://evil.test/x`), returns `isError` text `URL tải file khác host Confluence, từ chối gửi thông tin đăng nhập: https://evil.test/x`.
  - `upload_attachment` sends multipart to `…/123/child/attachment` with header `X-Atlassian-Token: no-check` and fields `file` (basename), `minorEdit=true`, plus `comment` when given. A file over 10 MB → `isError`.
  - Read-only lists `confluence_list_attachments` and `confluence_download_attachment` only.

- [ ] **Step 2: Run** `npx vitest run test/confluence-attachments.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Download URL = `new URL(link, client.baseUrl + "/")` when `link` is absolute, otherwise `client.baseUrl + link`.
  - Refactor `jira_download_attachment` and `jira_upload_attachment` to use the helpers.

- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: all PASS, including the existing `test/attachments.test.ts`.

- [ ] **Step 5: Commit** `feat: add Confluence attachment tools with shared download helper`

---

### Task 8: Server wiring and startup check

**Files:**
- Create: `src/tools/confluence/index.ts` (`registerConfluence(ctx)` calls the four registers)
- Modify: `src/server.ts`, `src/index.ts`
- Test: `test/server.test.ts`

**Interfaces:**
- Consumes: all Confluence `register`s; `Config.confluence` (Task 2).
- Produces:
  - `checkConfluence(c: HttpClient): Promise<{ name: string }>`. It calls `GET /rest/api/user/current` and throws `Error("Đăng nhập Confluence thất bại (sai username/password hoặc tài khoản bị khoá/CAPTCHA).")` when the response `type === "anonymous"`. HTTP errors propagate as `HttpError`.
  - `createServer(client, opts: { readOnly: boolean; agile: boolean; confluence?: HttpClient })`. It registers the Confluence tools iff `opts.confluence` is set.
  - `index.ts` builds the client with `service: "Confluence"` when `config.confluence` exists, then calls `checkConfluence`. The log line becomes `connected as ${name}, agile tools: on|off, confluence: on|off, read-only: on|off`.

- [ ] **Step 1: Write failing tests** in `test/server.test.ts`:
  - Define a `CONF_READ` list (8 names) and a `CONF_WRITE` list (5 names).
  - `createServer(makeClient(), { readOnly: false, agile: true, confluence: makeConfluenceClient() })` registers 39 tools, equal to `sorted(READ, WRITE, AGILE_READ, AGILE_WRITE, CONF_READ, CONF_WRITE)`.
  - With `readOnly: true` it registers 22 tools.
  - Existing tests without `confluence` still expect 26 and 14.
  - `checkConfluence` returns `{ name: "alice" }` for `{ type: "known", username: "alice" }`.
  - For `{ type: "anonymous" }` it rejects with the copy above.
  - A 401 rejects with `HttpError` whose `service === "Confluence"`.

- [ ] **Step 2: Run** `npx vitest run test/server.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** to the interfaces above.

- [ ] **Step 4: Run** `npx vitest run && npm run build && JIRA_BASE_URL= node dist/index.js; echo $?` — Expected: all tests PASS. The last command prints a config error to stderr and exits `1`.

- [ ] **Step 5: Commit** `feat: wire Confluence tools into the server`

---

### Task 9: Smoke script and documentation

**Files:**
- Modify: `scripts/smoke.ts`, `.env.example`, `README.md`, `docs/integration.md`, `docs/tools.md`

**Interfaces:**
- Consumes: tool names and parameters from Tasks 5–7.

- [ ] **Step 1: Extend `scripts/smoke.ts`.** When `confluence_list_spaces` is listed, call these read tools only and print `OK`/`FAIL` lines in the existing style:
  - `confluence_list_spaces { limit: 5 }`
  - `confluence_search { cql: "type = page ORDER BY lastmodified DESC", limit: 3 }`
  - `confluence_get_page { pageId: <first result id>, maxChars: 500 }`

- [ ] **Step 2: Add** `CONFLUENCE_BASE_URL=https://conf.gem-corp.tech` to `.env.example`.

- [ ] **Step 3: Run** `npm run build && npm run smoke` with a real `.env`. Expected: every line `OK`, and the exit code is 0. If no credentials are available, record that this step was skipped.

- [ ] **Step 4: Update the docs (Vietnamese, matching existing style):**
  - **`README.md`:**
    - Add the 3 env vars to the config table.
    - Add `CONFLUENCE_BASE_URL` to both `.mcp.json` examples.
    - Add a "Confluence" tool group listing, marking the write tools.
    - In the security section, extend the attachment-path warning to `confluence_download_attachment`/`confluence_upload_attachment`.
  - **`docs/integration.md`:**
    - Add the env var to the client examples.
    - Add 3 example prompts (search, read a page, create a page from Markdown).
    - Add troubleshooting rows for the anonymous/login failure, Confluence CAPTCHA (`X-Seraph-LoginReason`) and the 409/version conflict.
  - **`docs/tools.md`:** add a Confluence section with each tool's parameters, defaults and one example, as in spec §5.

- [ ] **Step 5: Run** `npx vitest run && npm run build` — Expected: PASS.

- [ ] **Step 6: Commit** `docs: document Confluence tools; extend smoke test`
