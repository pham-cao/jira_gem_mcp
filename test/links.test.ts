import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { register } from "../src/tools/links.js";
import { API, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

it("jira_link_issues sends the exact body", async () => {
  let body: unknown;
  mswServer.use(
    http.post(`${API}/issueLink`, async ({ request }) => {
      body = await request.json();
      return new HttpResponse(null, { status: 201 });
    }),
  );
  const h = await connectTools([register]);
  expect(await h.json("jira_link_issues", { type: "Blocks", inwardIssue: "abc-1", outwardIssue: "ABC-2", comment: "c" })).toEqual({ ok: true });
  expect(body).toEqual({ type: { name: "Blocks" }, inwardIssue: { key: "ABC-1" }, outwardIssue: { key: "ABC-2" }, comment: { body: "c" } });
});

it("jira_link_issues is hidden in read-only mode", async () => {
  expect(await (await connectTools([register], { readOnly: true })).toolNames()).toEqual([]);
});
