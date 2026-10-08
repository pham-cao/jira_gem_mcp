import { z } from "zod";
import { confluencePaged } from "../../confluence/format.js";
import { defineTool, numericId, requireConfluence, type ToolContext } from "../define.js";
import { downloadTo, readUploadFile } from "../download.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- Confluence payloads are untyped JSON */

const limit = z.number().int().min(1).max(100).default(25);
const start = z.number().int().min(0).default(0);

const slimAttachment = (a: any) => ({
  id: a.id,
  title: a.title,
  mediaType: a.extensions?.mediaType,
  fileSize: a.extensions?.fileSize,
  version: a.version?.number,
});

export function register(ctx: ToolContext): void {
  const conf = () => requireConfluence(ctx);

  defineTool(
    ctx,
    "confluence_list_attachments",
    { description: "List a page's attachments (id, title, mediaType, fileSize, version). Paged.", input: { pageId: numericId, limit, start } },
    async (args) => {
      const res = await conf().get<any>(`/rest/api/content/${args.pageId}/child/attachment`, { limit: args.limit, start: args.start });
      return confluencePaged(res.results.map(slimAttachment), res);
    },
  );

  defineTool(
    ctx,
    "confluence_download_attachment",
    {
      description: "Download a Confluence attachment (id from confluence_list_attachments) to a local path. If destPath is a directory, the attachment title is used as filename.",
      input: {
        attachmentId: numericId,
        destPath: z.string().min(1).describe("Absolute file or directory path"),
        overwrite: z.boolean().default(false),
      },
      // Read-only towards Confluence (stays available in read-only mode) but writes local files.
      readOnlyHint: false,
    },
    async (args) => {
      const client = conf();
      const meta = await client.get<any>(`/rest/api/content/${args.attachmentId}`);
      const link: string | undefined = meta._links?.download;
      if (!link) throw new Error(`Attachment ${args.attachmentId} không có link tải về`);
      const url = /^[a-z][a-z0-9+.-]*:/i.test(link) ? new URL(link, client.baseUrl + "/").href : client.baseUrl + link;
      return downloadTo(client, { url, filename: meta.title, destPath: args.destPath, overwrite: args.overwrite });
    },
  );

  defineTool(
    ctx,
    "confluence_upload_attachment",
    {
      description: "Attach a local file (max 10MB) to a page.",
      input: { pageId: numericId, filePath: z.string().min(1).describe("Absolute path of the local file"), comment: z.string().optional() },
      write: true,
    },
    async (args) => {
      const f = await readUploadFile(args.filePath);
      const form = new FormData();
      form.append("file", f.blob, f.name);
      form.append("minorEdit", "true"); // required by Confluence 6.x
      if (args.comment) form.append("comment", args.comment);
      const res = await conf().postMultipart<any>(`/rest/api/content/${args.pageId}/child/attachment`, form);
      return slimAttachment(res.results?.[0] ?? res);
    },
  );
}
