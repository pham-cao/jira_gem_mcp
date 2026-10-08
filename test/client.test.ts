import { delay, http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { JiraError } from "../src/jira/errors.js";
import { API, BASE_URL, makeClient, mswServer, useMsw } from "./helpers.js";

useMsw();

function counter(path: string, method: "get" | "post", respond: () => Response | Promise<Response>) {
  const state = { calls: 0 };
  mswServer.use(
    http[method](path, async () => {
      state.calls++;
      return respond();
    }),
  );
  return state;
}

describe("JiraClient", () => {
  it("sends Basic auth encoded as UTF-8", async () => {
    let auth: string | null = null;
    let accept: string | null = null;
    mswServer.use(
      http.get(`${API}/myself`, ({ request }) => {
        auth = request.headers.get("authorization");
        accept = request.headers.get("accept");
        return HttpResponse.json({ name: "alice" });
      }),
    );
    await makeClient({ password: "pä:ss" }).get("/rest/api/2/myself");
    expect(auth).toBe("Basic " + Buffer.from("alice:pä:ss", "utf8").toString("base64"));
    expect(accept).toBe("application/json");
  });

  it("keeps the base URL context path", async () => {
    let url = "";
    mswServer.use(
      http.get(`${API}/myself`, ({ request }) => {
        url = request.url;
        return HttpResponse.json({});
      }),
    );
    await makeClient().get("/rest/api/2/myself");
    expect(url).toBe("https://jira.test/ctx/rest/api/2/myself");
  });

  it("encodes query params and skips undefined", async () => {
    let params: URLSearchParams | undefined;
    mswServer.use(
      http.get(`${API}/user/search`, ({ request }) => {
        params = new URL(request.url).searchParams;
        return HttpResponse.json([]);
      }),
    );
    await makeClient().get("/rest/api/2/user/search", { username: "Nguyễn", a: undefined, n: 5 });
    expect(params?.get("username")).toBe("Nguyễn");
    expect(params?.get("n")).toBe("5");
    expect(params?.has("a")).toBe(false);
  });

  it("post and put send JSON", async () => {
    const seen: Array<[string, string | null, unknown]> = [];
    const h = (m: string) => async ({ request }: { request: Request }) => {
      seen.push([m, request.headers.get("content-type"), await request.json()]);
      return HttpResponse.json({ ok: m });
    };
    mswServer.use(http.post(`${API}/issue`, h("POST")), http.put(`${API}/issue/A-1`, h("PUT")));
    const c = makeClient();
    expect(await c.post("/rest/api/2/issue", { a: 1 })).toEqual({ ok: "POST" });
    expect(await c.put("/rest/api/2/issue/A-1", { b: 2 })).toEqual({ ok: "PUT" });
    expect(seen).toEqual([
      ["POST", "application/json", { a: 1 }],
      ["PUT", "application/json", { b: 2 }],
    ]);
  });

  it("returns undefined for 204", async () => {
    mswServer.use(http.put(`${API}/issue/A-1/assignee`, () => new HttpResponse(null, { status: 204 })));
    expect(await makeClient().put("/rest/api/2/issue/A-1/assignee", { name: "x" })).toBeUndefined();
  });

  it("throws JiraError with parsed field errors on 400", async () => {
    mswServer.use(http.post(`${API}/issue`, () => HttpResponse.json({ errorMessages: [], errors: { summary: "required" } }, { status: 400 })));
    const err = await makeClient().post("/rest/api/2/issue", {}).catch((e) => e);
    expect(err).toBeInstanceOf(JiraError);
    expect(err.fieldErrors).toEqual({ summary: "required" });
    expect(err.method).toBe("POST");
    expect(err.path).toBe("/rest/api/2/issue");
  });

  it("retries a GET once on 503 then succeeds", async () => {
    let n = 0;
    mswServer.use(http.get(`${API}/x`, () => (++n === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ ok: 1 }))));
    expect(await makeClient().get("/rest/api/2/x")).toEqual({ ok: 1 });
    expect(n).toBe(2);
  });

  it("gives up a GET after one retry", async () => {
    const s = counter(`${API}/x`, "get", () => new HttpResponse(null, { status: 503 }));
    const err = await makeClient().get("/rest/api/2/x").catch((e) => e);
    expect(err).toBeInstanceOf(JiraError);
    expect(err.status).toBe(503);
    expect(s.calls).toBe(2);
  });

  it("does not retry POST on 503", async () => {
    const s = counter(`${API}/x`, "post", () => new HttpResponse(null, { status: 503 }));
    await expect(makeClient().post("/rest/api/2/x", {})).rejects.toBeInstanceOf(JiraError);
    expect(s.calls).toBe(1);
  });

  it("does not retry 401", async () => {
    const s = counter(`${API}/x`, "get", () => new HttpResponse(null, { status: 401 }));
    await expect(makeClient().get("/rest/api/2/x")).rejects.toMatchObject({ status: 401 });
    expect(s.calls).toBe(1);
  });

  it("times out and retries a GET once", async () => {
    const s = counter(`${API}/slow`, "get", async () => {
      await delay(500);
      return HttpResponse.json({});
    });
    await expect(makeClient({ timeoutMs: 100 }).get("/rest/api/2/slow")).rejects.toThrow();
    expect(s.calls).toBe(2);
  });

  it("postMultipart sends no-check token and form data", async () => {
    let token: string | null = null;
    let ctype: string | null = null;
    mswServer.use(
      http.post(`${API}/issue/A-1/attachments`, ({ request }) => {
        token = request.headers.get("x-atlassian-token");
        ctype = request.headers.get("content-type");
        return HttpResponse.json([{ id: "1" }]);
      }),
    );
    const form = new FormData();
    form.append("file", new Blob(["hi"]), "a.txt");
    await makeClient().postMultipart("/rest/api/2/issue/A-1/attachments", form);
    expect(token).toBe("no-check");
    expect(ctype).toMatch(/^multipart\/form-data; boundary=/);
  });

  it("getBinary returns bytes and content type", async () => {
    mswServer.use(
      http.get(`${BASE_URL}/secure/attachment/1/a.bin`, () =>
        new HttpResponse(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "application/octet-stream" } }),
      ),
    );
    const r = await makeClient().getBinary(`${BASE_URL}/secure/attachment/1/a.bin`);
    expect([...new Uint8Array(r.data)]).toEqual([1, 2, 3]);
    expect(r.contentType).toBe("application/octet-stream");
  });
});
