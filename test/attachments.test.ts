import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { register } from "../src/tools/attachments.js";
import { API, BASE_URL, connectTools, mswServer, useMsw } from "./helpers.js";

useMsw();

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "jira-mcp-"));
});

const h = () => connectTools([register]);

describe("jira_upload_attachment", () => {
  it("uploads multipart with the file basename", async () => {
    const p = join(dir, "report.txt");
    await writeFile(p, "hello");
    let token: string | null = null;
    let file: File | null = null;
    mswServer.use(
      http.post(`${API}/issue/ABC-1/attachments`, async ({ request }) => {
        token = request.headers.get("x-atlassian-token");
        file = (await request.formData()).get("file") as File;
        return HttpResponse.json([{ id: "3", filename: "report.txt", size: 5, self: "s" }]);
      }),
    );
    expect(await (await h()).json("jira_upload_attachment", { issueKey: "abc-1", filePath: p })).toEqual([{ id: "3", filename: "report.txt", size: 5 }]);
    expect(token).toBe("no-check");
    expect(file!.name).toBe("report.txt");
    expect(await file!.text()).toBe("hello");
  });

  it("errors on a missing file without calling Jira", async () => {
    const p = join(dir, "nope.txt");
    expect(await (await h()).text("jira_upload_attachment", { issueKey: "ABC-1", filePath: p })).toBe(`Không tìm thấy file: ${p}`);
  });

  it("rejects files over 10MB without calling Jira", async () => {
    const p = join(dir, "big.bin");
    await writeFile(p, Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(await (await h()).text("jira_upload_attachment", { issueKey: "ABC-1", filePath: p })).toBe(
      `File vượt quá giới hạn 10MB: ${p} (10485761 bytes)`,
    );
  });
});

describe("jira_download_attachment", () => {
  const meta = (content: string) =>
    http.get(`${API}/attachment/3`, () => HttpResponse.json({ id: "3", filename: "a.bin", size: 3, mimeType: "application/octet-stream", content }));
  const bytes = http.get(`${BASE_URL}/secure/attachment/3/a.bin`, () => new HttpResponse(new Uint8Array([1, 2, 3])));

  it("writes into a directory using the attachment filename", async () => {
    mswServer.use(meta(`${BASE_URL}/secure/attachment/3/a.bin`), bytes);
    const out = await (await h()).json("jira_download_attachment", { attachmentId: "3", destPath: dir });
    expect(out).toEqual({ path: join(dir, "a.bin"), size: 3, mimeType: "application/octet-stream" });
    expect([...(await readFile(join(dir, "a.bin")))]).toEqual([1, 2, 3]);
  });

  it("creates missing parent directories", async () => {
    mswServer.use(meta(`${BASE_URL}/secure/attachment/3/a.bin`), bytes);
    const p = join(dir, "sub", "x.bin");
    await (await h()).json("jira_download_attachment", { attachmentId: "3", destPath: p });
    expect([...(await readFile(p))]).toEqual([1, 2, 3]);
  });

  it("refuses to overwrite unless asked", async () => {
    mswServer.use(meta(`${BASE_URL}/secure/attachment/3/a.bin`), bytes);
    const p = join(dir, "x.bin");
    await writeFile(p, "old");
    const c = await h();
    expect(await c.text("jira_download_attachment", { attachmentId: "3", destPath: p })).toBe(
      `File đã tồn tại: ${p} (dùng overwrite: true để ghi đè)`,
    );
    await c.json("jira_download_attachment", { attachmentId: "3", destPath: p, overwrite: true });
    expect([...(await readFile(p))]).toEqual([1, 2, 3]);
  });

  it("refuses to send credentials to another origin", async () => {
    mswServer.use(meta("https://evil.test/x"));
    expect(await (await h()).text("jira_download_attachment", { attachmentId: "3", destPath: dir })).toBe(
      "URL tải file khác host Jira, từ chối gửi thông tin đăng nhập: https://evil.test/x",
    );
  });
});

it("upload is hidden in read-only mode", async () => {
  expect(await (await connectTools([register], { readOnly: true })).toolNames()).toEqual(["jira_download_attachment"]);
});
