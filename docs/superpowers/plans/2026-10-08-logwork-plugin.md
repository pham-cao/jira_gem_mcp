# Logwork & Daily Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `confluence_fill_daily` MCP tool, package the repo as the Claude Code plugin `gem-jira` (marketplace `gem-tools`) with userConfig credentials, and ship a `logwork` skill that logs Jira task sessions locally, proposes Jira worklogs, and fills the team's Confluence daily page.

**Architecture:** Pure storage-XHTML cell logic lives in `src/confluence/daily.ts` (locate the user's row × date column in the daily table and splice only that cell's inner content). The thin tool `src/tools/confluence/daily.ts` fetches the page and current user, calls that logic, and PUTs with a one-time 409 retry. Plugin files (`.claude-plugin/*` with inline `mcpServers`, committed `dist/`) and `skills/logwork/SKILL.md` sit on top without changing server config code.

**Tech Stack:** TypeScript ESM (NodeNext), Node ≥ 20, `@modelcontextprotocol/sdk`, `zod` 3, `vitest` + `msw` 2; Claude Code 2.1.294 plugin system.

**Spec:** `docs/superpowers/specs/2026-10-08-logwork-plugin-design.md`

## Global Constraints

- Plugin `name: "gem-jira"`; marketplace `name: "gem-tools"`, owner `pham-cao`, plugin source `"."`; skill dir `skills/logwork/`.
- userConfig keys exactly: `jira_base_url` (default `https://pm.gem-corp.tech`), `confluence_base_url` (default `https://conf.gem-corp.tech`), `username`, `password` (`sensitive: true`). MCP server key `jira`, command `node ${CLAUDE_PLUGIN_ROOT}/dist/index.js`, env `JIRA_BASE_URL`, `CONFLUENCE_BASE_URL`, `JIRA_USERNAME`, `JIRA_PASSWORD` mapped from `${user_config.…}`.
- `confluence_fill_daily` is a write tool (`write: true`): total tools 40 with Confluence, read-only count stays 22.
- Error copy for the daily tool is fixed in spec §3.4 and used verbatim.
- Only the target `<td>`'s inner content may change; every other byte of the page storage is preserved.
- Jira issue link in cells: `${ctx.client.baseUrl}/browse/${KEY}`; issueKey regex `/^[A-Z][A-Z0-9_]*-\d+$/` after trim + uppercase.
- No existing test assertions change except the tool-count lists in `test/server.test.ts`.
- `dist/` is committed and must match `npm run build` output.
- Skill and docs are written in Vietnamese; times are taken with `date`, never estimated.

## Review Focus

1. The current user is @-mentioned inside another member's cell (e.g. "pair with @caopv") → row matching must look only at the row's first cell, never pick the other member's row. Test in Task 1.
2. A cell contains a nested table whose cells include `<time datetime="{date}"/>` → the column must come from the outer table's header row, and nested `<tr>/<td>` must not shift row/column counting. Test in Task 1.
3. The target cell is self-closing (`<td colspan="1" />`) or contains only `&nbsp;`/`<br/>` → treated as empty and replaced with a proper `<td …>…</td>`, keeping its attributes. Test in Task 1.
4. Between preview and write, a teammate fills the same page (409) and the retry finds your cell now non-empty → retry must re-run the overwrite check, not blindly overwrite. Test in Task 2.
5. Item text with `<`, `&`, `"` or `]]>` and Vietnamese → escaped, well-formed storage. Test in Task 1.

---

### Task 1: Daily cell logic

**Files:**
- Create: `src/confluence/daily.ts`, `test/fixtures/daily-page.ts`
- Test: `test/daily.test.ts`

**Interfaces:**
- Produces (all exported from `src/confluence/daily.ts`):
  - `interface DailyItem { text: string; issueKey?: string }`
  - `interface DailyContent { yesterday: DailyItem[]; today: DailyItem[]; problems: string[] }`
  - `renderDailyCell(c: DailyContent, jiraBaseUrl: string): string`
  - `interface DailyCell { innerStart: number; innerEnd: number; inner: string; rowLabel?: string; selfClosing: boolean; openTag: string }` (`openTag` = the cell's opening tag text, without the `/` for self-closing ones)
  - `locateDailyCell(storage: string, date: string, userKey: string): DailyCell` (throws `DailyError`)
  - `isEmptyCell(inner: string): boolean`
  - `replaceCell(storage: string, cell: DailyCell, html: string): string`
  - `class DailyError extends Error` with `code: "no-date" | "no-row"`
- Fixture `test/fixtures/daily-page.ts` exports `DAILY_PAGE: string` (storage modelled on the real page in spec §1, anonymised) and `ME = "me-key"`. Contents:
  - Header row: `<th><br /></th>`, `<th colspan="1">Role</th>`, then date headers 2026-10-07, 2026-10-08, 2026-10-09 using the real wrappers (`<div class="content-wrapper"><p><time datetime="…" />&nbsp;</p></div>`).
  - A `Template` row.
  - A teammate row whose 2026-10-08 cell mentions `ri:userkey="me-key"` (Review Focus 1).
  - My row (`<div class="content-wrapper"><p><ac:link><ri:user ri:userkey="me-key" /><ac:plain-text-link-body><![CDATA[Cao PV]]></ac:plain-text-link-body></ac:link></p></div>`, role `BE`). Its cells:
    - 2026-10-07: filled;
    - 2026-10-08: `<td colspan="1"><br /></td>`;
    - 2026-10-09: `<td colspan="1" />`.
  - Another teammate row whose 2026-10-07 cell holds a nested table with a `<time datetime="2026-10-09" />` (Review Focus 2).

- [ ] **Step 1: Write failing tests** in `test/daily.test.ts`:
  - `locateDailyCell(DAILY_PAGE, "2026-10-08", ME)` returns `inner === "<br />"`, `rowLabel === "Cao PV"`, `selfClosing === false`.
  - The same call with date `2026-10-09` returns `selfClosing === true`. `replaceCell` then yields `<td colspan="1"><p>…</p></td>` at that spot.
  - With date `2026-10-07`, `isEmptyCell(cell.inner) === false`.
  - With date `2026-10-10`, it throws a `DailyError` with code `no-date`. The message equals `Trang daily không có cột cho ngày 2026-10-10. Các ngày hiện có: 2026-10-07, 2026-10-08, 2026-10-09. Có thể đã sang sprint/tuần mới — hãy cung cấp link trang daily mới.`
  - With userKey `nobody`, it throws code `no-row` with message `Không tìm thấy hàng của bạn (userKey nobody) trong bảng daily. Hãy nhờ người quản lý trang thêm bạn vào bảng.`
  - Review Focus 1: the row found for `ME` is my row, not the teammate who mentions me (assert on `rowLabel`).
  - Review Focus 2: the nested table does not change the located `innerStart` (compare with a version of the fixture without the nested table, after offset adjustment), and does not add a fake `2026-10-09` column.
  - `replaceCell(DAILY_PAGE, cell, X)` equals `DAILY_PAGE.slice(0, cell.innerStart) + X + DAILY_PAGE.slice(cell.innerEnd)` for non-self-closing cells. Every byte outside the cell is identical.
  - `isEmptyCell` is true for `"<br />"`, `"&nbsp;"`, `" <p><br /></p> "`, `""` and false for `"<p>x</p>"`.
  - `renderDailyCell({ yesterday: [{ text: "Sửa lỗi <SSO> & token", issueKey: "ABC-1" }], today: [], problems: [] }, "https://jira.test")` equals:
    `<p><strong>A. Yesterday Task:</strong></p><ol><li>Sửa lỗi &lt;SSO&gt; &amp; token (<a href="https://jira.test/browse/ABC-1">ABC-1</a>)</li></ol><p><strong>B. Today Task:</strong></p><ol><li>—</li></ol><p><strong>C. Problems:</strong></p>`
  - With `problems: ["Chờ KH \"cấp\" quyền ]]>"]`, C becomes `<ol><li>Chờ KH &quot;cấp&quot; quyền ]]&gt;</li></ol>`.

- [ ] **Step 2: Run** `npx vitest run test/daily.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `src/confluence/daily.ts`.
  - Use a single forward tag scanner over the storage string. Track `<table>` depth; only `<tr>`, `<th>` and `<td>` at the depth of the table being examined count.
  - Handle self-closing `<td …/>`; skip CDATA sections and comments.
  - Header row = the first `<tr>` of a top-level table that contains a `<th>`. The column index for `date` sums `colspan` (default 1) over the header cells before the cell containing `datetime="{date}"`.
  - Data rows: match `ri:userkey="{userKey}"` only inside the row's first cell. Walk that row's cells, summing `colspan`, to reach the column index.
  - `rowLabel` = the first-cell `plain-text-link-body` CDATA text, if present.
  - Tables are tried in order; the first table whose header has the date wins.
  - For a self-closing cell, `replaceCell` rewrites `<td a="b" />` as `<td a="b">{html}</td>`.

- [ ] **Step 4: Run** `npx vitest run test/daily.test.ts && npx tsc --noEmit` — Expected: PASS.

- [ ] **Step 5: Commit** `feat: add Confluence daily cell locator and renderer`

---

### Task 2: `confluence_fill_daily` tool

**Files:**
- Create: `src/tools/confluence/daily.ts`
- Modify: `src/tools/confluence/index.ts` (add `daily` to the group list), `test/server.test.ts` (add `confluence_fill_daily` to `CONF_WRITE` — now 6, total 40, read-only 22)
- Test: `test/confluence-daily.test.ts`

**Interfaces:**
- Consumes: Task 1 exports; `defineTool`, `requireConfluence`, `numericId` (`src/tools/define.ts`); `HttpError` (`src/http/errors.ts`); `DAILY_PAGE`, `ME` fixture; test helpers `CAPI`, `CONF_BASE`, `BASE_URL`, `connectTools(…, { confluence: true })`.
- Produces: `register(ctx)` registering `confluence_fill_daily` with input and output exactly as spec §3.1/§3.3.

- [ ] **Step 1: Write failing tests** (msw on `CAPI`):
  - `user/current` → `{ type: "known", username: "caopv", userKey: "me-key" }`; content GET → `{ id: "5", type: "page", title: "Daily", version: { number: 2 }, body: { storage: { value: DAILY_PAGE } } }`.
  - Preview (default) for `2026-10-08`: no PUT is sent (no PUT handler; msw errors on unhandled). The result is `{ preview: true, date: "2026-10-08", row: "Cao PV", before: "<br />", version: 2, url: CONF_BASE + "/pages/viewpage.action?pageId=5" }`, and `after` equals `renderDailyCell(…, BASE_URL)`.
  - `preview: false`: the PUT body equals `{ id: "5", type: "page", title: "Daily", version: { number: 3 }, body: { storage: { value: replaceCell(DAILY_PAGE, cell, after), representation: "storage" } } }`. Result `version === 3`.
  - The `2026-10-07` cell is already filled and `overwrite` is false → `isError`. Text is `Ô ngày 2026-10-07 của bạn đã có nội dung. Xem "before" và gọi lại với overwrite: true nếu muốn ghi đè.` and includes the existing cell content. With `overwrite: true` the PUT is sent.
  - 409 retry: the first PUT returns 409 and the second GET returns the page with version 3, so the second PUT carries version 4. Exactly 2 PUTs.
  - Review Focus 4: the first PUT returns 409 and the re-fetched page has my `2026-10-08` cell filled → `isError` with the overwrite copy, and no second PUT.
  - `issueKey: "abc-1 "` becomes `ABC-1`. `issueKey: "bad key"` → `isError`, no request.
  - Read-only: `confluence_fill_daily` is not listed.

- [ ] **Step 2: Run** `npx vitest run test/confluence-daily.test.ts test/server.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** `src/tools/confluence/daily.ts`.
  - `date` uses `z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`.
  - `DailyError` is surfaced as its message.
  - The tool description says: preview first, show the user, then call with `preview: false`.

- [ ] **Step 4: Run** `npx vitest run && npx tsc --noEmit` — Expected: all PASS.

- [ ] **Step 5: Commit** `feat: add confluence_fill_daily tool`

---

### Task 3: Plugin packaging

**Files:**
- Create: `.claude-plugin/plugin.json` (with inline `mcpServers`), `.claude-plugin/marketplace.json`, `test/plugin.test.ts`. No repo-root `.mcp.json`: it would also act as a project-scope MCP config for anyone opening Claude Code in this repo, with an unexpanded `${CLAUDE_PLUGIN_ROOT}`
- Modify: `.gitignore` (remove the `dist` line at :84 only), `package.json` (add the `release-check` script), add the `dist/` build output to git

**Interfaces:**
- Consumes: `package.json` `version`.
- Produces: an installable plugin `gem-jira@gem-tools`. Task 4 adds `skills/logwork/` to it.

- [ ] **Step 1: Write failing test** `test/plugin.test.ts`. It reads the two JSON files and asserts:
  - `plugin.json.name === "gem-jira"` and `version === package.json.version`;
  - the four userConfig keys exist with the defaults and `password.sensitive === true`;
  - `marketplace.json.name === "gem-tools"` and `plugins[0]` is `{ name: "gem-jira", source: "." … }`;
  - `plugin.json.mcpServers.jira.args` equals `["${CLAUDE_PLUGIN_ROOT}/dist/index.js"]`;
  - each env value is the corresponding `${user_config.…}` string;
  - `dist/index.js` exists.

- [ ] **Step 2: Run** `npx vitest run test/plugin.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.**
  - Write the files per spec §2.1–2.3.
  - Add `"release-check": "npm run build && npm test && git diff --exit-code -- dist"`.
  - Remove `dist` from `.gitignore`, run `npm run build`, and `git add dist`.

- [ ] **Step 4: Verify.**
  - `npx vitest run && claude plugin validate .` — Expected: PASS, and validate reports no errors.
  - Then do a throwaway local install check:
    1. `claude plugin marketplace add ./`
    2. `claude plugin install gem-jira@gem-tools --scope local`
    3. `claude plugin details gem-jira@gem-tools` shows the MCP server `jira`.
    4. Uninstall the plugin and remove the marketplace again. Record the output.
  - Do not enter real credentials.

- [ ] **Step 5: Commit** `build: package repo as gem-jira Claude Code plugin (commit dist)`

---

### Task 4: `logwork` skill

**Files:**
- Create: `skills/logwork/SKILL.md`
- Rebuild check: none (no TS changes)

**Interfaces:**
- Consumes the tool names `jira_get_issue`, `jira_add_worklog` (params `issueKey`, `timeSpent`, `started`, `comment` — read `src/tools/worklogs.ts` for the exact names and the `started` format), `jira_search`, `confluence_search`, `confluence_fill_daily` (Task 2).

- [ ] **Step 1: Write** `skills/logwork/SKILL.md` in Vietnamese, following spec §4 exactly.
  - Frontmatter: `name: logwork`, a trigger-rich `description`, `argument-hint: "[start <ISSUE> | stop | daily]"`.
  - Sections:
    - Khi nào dùng
    - File logwork: format with an example entry, `config.json`, `.git/info/exclude`
    - Lấy giờ: `date +%H:%M`, `date +%F`, and computing the next working day with `date -d`
    - Bắt đầu task
    - Kết thúc task + đề xuất worklog: the 15-minute round-up rule, only unlogged sessions, ask first
    - Điền daily: A/B/C mapping, JQL, the pageId from the link, preview → confirm → write, handling `no-date` / `no-row` / overwrite errors
    - Phong cách Agile: 3 good and 3 bad example lines
    - Quy tắc an toàn: never write Jira or Confluence without confirmation, never estimate times
  - Keep it under 250 lines.

- [ ] **Step 2: Verify.** Run `claude plugin validate .` (PASS). Install locally as in Task 3, Step 4 and confirm `claude plugin details gem-jira@gem-tools` lists the skill `logwork`, then clean up.

- [ ] **Step 3: Commit** `feat: add logwork skill`

---

### Task 5: Documentation and live verification

**Files:**
- Modify: `README.md`, `docs/tools.md`, `docs/integration.md`

- [ ] **Step 1: Update docs** (Vietnamese, existing style) per spec §6.
  - **README:**
    - Add a "Cài dưới dạng plugin (khuyến nghị)" subsection at the top of Cài đặt, with the two `/plugin` commands, the userConfig prompts, and the migration step `claude mcp remove jira -s user`.
    - Add `confluence_fill_daily` ✎ to the Confluence table under a "Daily" group (count 14).
    - Add a short "Skill logwork" section: start, stop and daily usage, and that `./logwork/` is git-excluded.
  - **`docs/tools.md`:** a `confluence_fill_daily` section with params, defaults, the output example and error copies.
  - **`docs/integration.md`:** a plugin section.

- [ ] **Step 2: Live preview check (read-only on Confluence).**
  - Run `npm run build`.
  - Call the built server's `confluence_fill_daily` with `preview: true` on page `212026868` for a date present on the page, using the existing local credentials (the user-scope MCP env or `.env`; never print them).
  - Expected: either a preview with the user's row, or the exact `no-row` error.
  - Record the result in the commit body. Never call with `preview: false`.

- [ ] **Step 3: Run** `npm run release-check` — Expected: PASS (`dist` clean).

- [ ] **Step 4: Commit** `docs: document plugin install, logwork skill and confluence_fill_daily`
