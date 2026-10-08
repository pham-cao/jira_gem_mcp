/* eslint-disable @typescript-eslint/no-explicit-any */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { register } from "../src/tools/confluence/attachments.js";
import { CAPI, CONF_BASE, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "conf-mcp-"));
});

const h = (opts: { readOnly?: boolean } = {}) => connectTools([register], { ...opts, confluence: true });

describe("confluence_list_attachments", () => {
  it("returns id, title, mediaType, fileSize and version", async () => {
    mswServer.use(
      http.get(`${CAPI}/content/123/child/attachment`, () =>
        HttpResponse.json({
          results: [{ id: "att9", title: "a.txt", extensions: { mediaType: "text/plain", fileSize: 5 }, version: { number: 2 }, _links: {} }],
          start: 0,
          limit: 25,
          size: 1,
        }),
      ),
    );
    const out = await (await h()).json("confluence_list_attachments", { pageId: "123" });
    expect(out.items).toEqual([{ id: "att9", title: "a.txt", mediaType: "text/plain", fileSize: 5, version: 2 }]);
  });

  it("rejects a non-numeric pageId", async () => {
    expect((await (await h()).call("confluence_list_attachments", { pageId: "1/../2" })).isError).toBe(true);
  });
});

describe("confluence_download_attachment", () => {
  const meta = (download: string, title = "a.txt") =>
    http.get(`${CAPI}/content/77`, () => HttpResponse.json({ id: "77", title, _links: { download } }));
  const bytes = http.get(`${CONF_BASE}/download/attachments/1/a.txt`, () => new HttpResponse(new Uint8Array([1, 2, 3])));

  it("downloads a relative link into a directory under basename(title)", async () => {
    mswServer.use(meta("/download/attachments/1/a.txt?version=1"), bytes);
    const out = await (await h()).json("confluence_download_attachment", { attachmentId: "77", destPath: dir });
    expect(out).toEqual({ path: join(dir, "a.txt"), size: 3 });
    expect([...(await readFile(join(dir, "a.txt")))]).toEqual([1, 2, 3]);
  });

  it("strips path components from a hostile title", async () => {
    mswServer.use(meta("/download/attachments/1/a.txt?version=1", "../../evil.txt"), bytes);
    const out = await (await h()).json("confluence_download_attachment", { attachmentId: "77", destPath: dir });
    expect(out.path).toBe(join(dir, "evil.txt"));
  });

  it("refuses to overwrite unless asked", async () => {
    mswServer.use(meta("/download/attachments/1/a.txt?version=1"), bytes);
    const p = join(dir, "x.txt");
    await writeFile(p, "old");
    const c = await h();
    expect(await c.text("confluence_download_attachment", { attachmentId: "77", destPath: p })).toBe(
      `File đã tồn tại: ${p} (dùng overwrite: true để ghi đè)`,
    );
    await c.json("confluence_download_attachment", { attachmentId: "77", destPath: p, overwrite: true });
    expect([...(await readFile(p))]).toEqual([1, 2, 3]);
  });

  it("refuses to send credentials to another origin", async () => {
    mswServer.use(meta("https://evil.test/x"));
    expect(await (await h()).text("confluence_download_attachment", { attachmentId: "77", destPath: dir })).toBe(
      "URL tải file khác host Confluence, từ chối gửi thông tin đăng nhập: https://evil.test/x",
    );
  });

  it("rejects a non-numeric attachmentId", async () => {
    expect((await (await h()).call("confluence_download_attachment", { attachmentId: "x", destPath: dir })).isError).toBe(true);
  });
});

describe("confluence_upload_attachment", () => {
  it("sends multipart with no-check token, file basename, minorEdit and comment", async () => {
    const p = join(dir, "report.txt");
    await writeFile(p, "hello");
    let token: string | null = null;
    let form: FormData | undefined;
    mswServer.use(
      http.post(`${CAPI}/content/123/child/attachment`, async ({ request }) => {
        token = request.headers.get("x-atlassian-token");
        form = await request.formData();
        return HttpResponse.json({ results: [{ id: "att1", title: "report.txt", extensions: { mediaType: "text/plain", fileSize: 5 }, version: { number: 1 } }] });
      }),
    );
    const out = await (await h()).json("confluence_upload_attachment", { pageId: "123", filePath: p, comment: "note" });
    expect(token).toBe("no-check");
    expect((form!.get("file") as File).name).toBe("report.txt");
    expect(await (form!.get("file") as File).text()).toBe("hello");
    expect(form!.get("minorEdit")).toBe("true");
    expect(form!.get("comment")).toBe("note");
    expect(out).toEqual({ id: "att1", title: "report.txt", mediaType: "text/plain", fileSize: 5, version: 1 });
  });

  it("omits comment when not given", async () => {
    const p = join(dir, "r.txt");
    await writeFile(p, "x");
    let form: FormData | undefined;
    mswServer.use(
      http.post(`${CAPI}/content/123/child/attachment`, async ({ request }) => {
        form = await request.formData();
        return HttpResponse.json({ results: [{ id: "1", title: "r.txt", extensions: {}, version: { number: 1 } }] });
      }),
    );
    await (await h()).json("confluence_upload_attachment", { pageId: "123", filePath: p });
    expect(form!.has("comment")).toBe(false);
  });

  it("rejects files over 10MB", async () => {
    const p = join(dir, "big.bin");
    await writeFile(p, Buffer.alloc(10 * 1024 * 1024 + 1));
    const r = await (await h()).call("confluence_upload_attachment", { pageId: "123", filePath: p });
    expect(r.isError).toBe(true);
    expect((r.content[0] as any).text).toBe(`File vượt quá giới hạn 10MB: ${p} (10485761 bytes)`);
  });
});

it("read-only lists only list and download", async () => {
  expect(await (await h({ readOnly: true })).toolNames()).toEqual(["confluence_download_attachment", "confluence_list_attachments"]);
});
