# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`jira-server-mcp`: a stdio MCP server for on-prem Jira Server 8.x and Confluence Server 6.x (Basic Auth, no PAT support on these versions). The repo is also the Claude Code plugin `gem-jira` (marketplace `gem-tools`), which bundles the MCP server plus two skills: `logwork` (`skills/logwork/SKILL.md`, local session tracking and Jira worklogs) and `logdailymeeting` (`skills/logdailymeeting/SKILL.md`, fills today's cell of the Confluence daily page with A. Today Task / B. Problems from `./logwork/` data; the cell layout itself is rendered by `renderDailyCell` in `src/confluence/daily.ts`). Both share `./logwork/config.json`, so a format change in one usually needs the other updated too. User-facing docs (README, `docs/`, skill, error messages) are written in Vietnamese; code comments and tool descriptions are in English.

## Commands

```bash
npm ci
npm test                          # vitest, all HTTP mocked with msw (no real server)
npx vitest run test/worklogs.test.ts      # single file
npx vitest run -t "jira_add_worklog"      # single test by name
npm run build                     # tsc -> dist/
npm run smoke                     # read-only tools against real Jira/Confluence, needs .env (copy .env.example)
npm run release-check             # clean rebuild + tests; fails if dist/ differs from what is committed
claude plugin validate .          # validate plugin manifest
npx @modelcontextprotocol/inspector node dist/index.js
```

**`dist/` is committed** because plugins installed from git do not run a build. After any change under `src/`, run `npm run release-check` and commit the regenerated `dist/` with the source.

## Architecture

- `src/index.ts`: loads env config, runs startup checks (Jira `/myself`, agile probe, optional Confluence `/user/current` with anonymous rejection), then connects the server over stdio. Any startup failure exits with a `[jira-mcp]` message on stderr.
- `src/server.ts` `createServer`: builds a shared `ToolContext` and registers tool groups. Agile tools register only if the agile probe succeeded; Confluence tools only if `CONFLUENCE_BASE_URL` is set.
- `src/tools/define.ts` `defineTool`: the single entry point for every tool. It wraps results as JSON text, converts thrown errors into `isError` results via `formatError`, and silently skips tools marked `write: true` when `JIRA_READ_ONLY=true` (this also applies to Confluence). Each tool module exports `register(ctx)`.
- `src/http/client.ts` `HttpClient`: shared by Jira and Confluence (the `service` field labels errors). GET requests (and binary downloads) get one retry on 5xx, network error or timeout; writes never retry. `JiraClient` and `jira/errors.ts` are thin Jira-flavoured wrappers over the http layer.
- `src/jira/fields.ts` `FieldCache`: resolves custom field names to ids, shared via the context.
- `src/confluence/`: Markdown to storage format conversion (`marked`, `turndown` + gfm), result formatting, and the daily-meeting table cell logic used by `confluence_fill_daily`.

Design constraints that are deliberate (see README "Giới hạn đã biết" and `docs/superpowers/specs/`):
- No delete operations for any entity.
- `confluence_update_page` refuses a Markdown overwrite of a page containing content Markdown cannot represent unless `allowLossyMarkdown: true`.
- `confluence_fill_daily` defaults to `preview: true`; it never adds rows or date columns and stops on merged header cells or duplicate dates.

## Tests

`test/helpers.ts` provides `useMsw()` (unhandled requests are errors), fake base URLs (`API`, `AGILE`, `CAPI`), and `connectTools([register], { readOnly, confluence })`, which wires tool modules to an in-memory MCP client. Tool tests call tools by name through that harness (`.json()`, `.text()`, `.toolNames()`) and stub endpoints with `mswServer.use(http.get(...))`. `test/plugin.test.ts` pins the plugin manifest (name, `userConfig` keys, env wiring) and requires `plugin.json` version to equal `package.json` version, so bump both together.

## Docs to keep in sync

When adding or changing a tool, update `docs/tools.md` (tool list and read/write counts) and the README tool table. Design specs and implementation plans live in `docs/superpowers/`.
