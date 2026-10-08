import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { defineTool, issueKey, type ToolContext } from "./define.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const statOrNull = (p: string) => stat(p).catch(() => null);

export function register(ctx: ToolContext): void {
  const { client } = ctx;

  defineTool(
    ctx,
    "jira_upload_attachment",
    {
      description: "Attach a local file (max 10MB) to an issue.",
      input: { issueKey: z.string().trim().min(1), filePath: z.string().min(1).describe("Absolute path of the local file") },
      write: true,
    },
    async (args) => {
      const p = resolve(args.filePath);
      const st = await statOrNull(p);
      if (!st) throw new Error(`Không tìm thấy file: ${p}`);
      if (!st.isFile()) throw new Error(`Không phải file thường: ${p}`);
      if (st.size > MAX_UPLOAD_BYTES) throw new Error(`File vượt quá giới hạn 10MB: ${p} (${st.size} bytes)`);
      const form = new FormData();
      form.append("file", new Blob([await readFile(p)]), basename(p));
      const res = await client.postMultipart<any[]>(`/rest/api/2/issue/${issueKey(args.issueKey)}/attachments`, form);
      return res.map((a) => ({ id: a.id, filename: a.filename, size: a.size }));
    },
  );

  defineTool(
    ctx,
    "jira_download_attachment",
    {
      description: "Download an attachment (id from jira_get_issue) to a local path. If destPath is a directory, the original filename is used.",
      input: {
        attachmentId: z.string().min(1),
        destPath: z.string().min(1).describe("Absolute file or directory path"),
        overwrite: z.boolean().default(false),
      },
    },
    async (args) => {
      const meta = await client.get<any>(`/rest/api/2/attachment/${encodeURIComponent(args.attachmentId)}`);
      if (new URL(meta.content).origin !== new URL(client.baseUrl).origin) {
        throw new Error(`URL tải file khác host Jira, từ chối gửi thông tin đăng nhập: ${meta.content}`);
      }
      let target = resolve(args.destPath);
      if ((await statOrNull(target))?.isDirectory()) target = join(target, basename(meta.filename));
      if ((await statOrNull(target)) && !args.overwrite) throw new Error(`File đã tồn tại: ${target} (dùng overwrite: true để ghi đè)`);
      const { data } = await client.getBinary(meta.content);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(data));
      return { path: target, size: data.byteLength, mimeType: meta.mimeType };
    },
  );
}
