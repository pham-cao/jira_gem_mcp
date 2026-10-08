import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { JiraError } from "../src/jira/errors.js";
import { FieldCache } from "../src/jira/fields.js";
import { defineTool, type ToolContext } from "../src/tools/define.js";
import { API, connectTools, makeClient, mswServer, useMsw } from "./helpers.js";

useMsw();

const register = (ctx: ToolContext) => {
  defineTool(ctx, "t_read", { description: "r", input: {} }, async () => ({ a: 1 }));
  defineTool(ctx, "t_write", { description: "w", input: { x: z.string() }, write: true }, async () => undefined);
  defineTool(ctx, "t_fail", { description: "f", input: {} }, async () => {
    throw new JiraError({ status: 401, method: "GET", path: "/p", messages: [], fieldErrors: {}, captcha: false });
  });
};

describe("defineTool", () => {
  it("skips write tools in read-only mode", async () => {
    expect(await (await connectTools([register], { readOnly: true })).toolNames()).toEqual(["t_fail", "t_read"]);
  });

  it("registers write tools otherwise", async () => {
    expect(await (await connectTools([register])).toolNames()).toEqual(["t_fail", "t_read", "t_write"]);
  });

  it("returns pretty JSON", async () => {
    const h = await connectTools([register]);
    expect(await h.text("t_read")).toBe('{\n  "a": 1\n}');
  });

  it("returns {ok: true} for undefined results", async () => {
    const h = await connectTools([register]);
    expect(await h.text("t_write", { x: "1" })).toBe('{\n  "ok": true\n}');
  });

  it("converts errors to isError results", async () => {
    const r = await (await connectTools([register])).call("t_fail");
    expect(r.isError).toBe(true);
    expect((r.content[0] as { text: string }).text).toBe("Xác thực thất bại: sai username/password.");
  });

  it("reports invalid input as an error", async () => {
    const r = await (await connectTools([register])).call("t_write", { x: 5 });
    expect(r.isError).toBe(true);
  });
});

describe("FieldCache", () => {
  it("fetches /field once and finds the sprint field", async () => {
    let calls = 0;
    mswServer.use(
      http.get(`${API}/field`, () => {
        calls++;
        return HttpResponse.json([
          { id: "summary", name: "Summary", custom: false, schema: { type: "string" } },
          { id: "customfield_10004", name: "Sprint", custom: true, schema: { type: "array", custom: "com.pyxis.greenhopper.jira:gh-sprint" } },
        ]);
      }),
    );
    const cache = new FieldCache(makeClient());
    expect(await cache.sprintFieldId()).toBe("customfield_10004");
    expect(await cache.sprintFieldId()).toBe("customfield_10004");
    expect((await cache.all()).length).toBe(2);
    expect(calls).toBe(1);
  });
});
