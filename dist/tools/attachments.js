import { z } from "zod";
import { defineTool, issueKey } from "./define.js";
import { downloadTo, MAX_UPLOAD_BYTES, readUploadFile } from "./download.js";
/* eslint-disable @typescript-eslint/no-explicit-any -- Jira payloads are untyped JSON */
export { MAX_UPLOAD_BYTES };
export function register(ctx) {
    const { client } = ctx;
    defineTool(ctx, "jira_upload_attachment", {
        description: "Attach a local file (max 10MB) to an issue.",
        input: { issueKey: z.string().trim().min(1), filePath: z.string().min(1).describe("Absolute path of the local file") },
        write: true,
    }, async (args) => {
        const f = await readUploadFile(args.filePath);
        const form = new FormData();
        form.append("file", f.blob, f.name);
        const res = await client.postMultipart(`/rest/api/2/issue/${issueKey(args.issueKey)}/attachments`, form);
        return res.map((a) => ({ id: a.id, filename: a.filename, size: a.size }));
    });
    defineTool(ctx, "jira_download_attachment", {
        description: "Download an attachment (id from jira_get_issue) to a local path. If destPath is a directory, the original filename is used.",
        input: {
            attachmentId: z.string().min(1),
            destPath: z.string().min(1).describe("Absolute file or directory path"),
            overwrite: z.boolean().default(false),
        },
        // Read-only towards Jira (stays available in read-only mode) but writes local files.
        readOnlyHint: false,
    }, async (args) => {
        const meta = await client.get(`/rest/api/2/attachment/${encodeURIComponent(args.attachmentId)}`);
        const { path, size } = await downloadTo(client, { url: meta.content, filename: meta.filename, destPath: args.destPath, overwrite: args.overwrite });
        return { path, size, mimeType: meta.mimeType };
    });
}
