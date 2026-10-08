import { markdownToStorage, storageToMarkdown } from "./convert.js";
export function slimPage(p, baseUrl) {
    return {
        id: p.id,
        type: p.type,
        title: p.title,
        ...(p.space?.key && { space: p.space.key }),
        ...(p.version?.number !== undefined && { version: p.version.number }),
        ...(p.version?.when && { lastModified: p.version.when }),
        url: baseUrl + (p._links?.webui ?? ""),
    };
}
export function slimConfluenceComment(c) {
    const anc = c.ancestors ?? [];
    const author = c.history?.createdBy?.username;
    return {
        id: c.id,
        ...(author && { author }),
        ...(c.history?.createdDate && { created: c.history.createdDate }),
        ...(anc.length > 0 && { parentId: anc[anc.length - 1].id }),
        body: storageToMarkdown(c.body?.storage?.value ?? ""),
    };
}
export function confluencePaged(items, r) {
    return { items, start: r.start, limit: r.limit, size: r.size, ...(typeof r.totalSize === "number" && { total: r.totalSize }), hasMore: Boolean(r._links?.next) };
}
export function toStorage(body, format) {
    return format === "storage" ? body : markdownToStorage(body);
}
