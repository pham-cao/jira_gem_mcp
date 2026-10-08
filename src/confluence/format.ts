import { markdownToStorage, storageToMarkdown } from "./convert.js";

/* eslint-disable @typescript-eslint/no-explicit-any -- Confluence payloads are untyped JSON */

export interface SlimPage {
  id: string;
  type: string;
  title: string;
  space?: string;
  version?: number;
  lastModified?: string;
  url: string;
}

export interface ConfluencePaged<T> {
  items: T[];
  start: number;
  limit: number;
  size: number;
  total?: number;
  hasMore: boolean;
}

export function slimPage(p: any, baseUrl: string): SlimPage {
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

export interface SlimConfluenceComment {
  id: string;
  author?: string;
  created?: string;
  parentId?: string;
  body: string;
}

export function slimConfluenceComment(c: any): SlimConfluenceComment {
  const anc: any[] = c.ancestors ?? [];
  const author = c.history?.createdBy?.username;
  return {
    id: c.id,
    ...(author && { author }),
    ...(c.history?.createdDate && { created: c.history.createdDate }),
    ...(anc.length > 0 && { parentId: anc[anc.length - 1].id }),
    body: storageToMarkdown(c.body?.storage?.value ?? ""),
  };
}

export function confluencePaged<T>(items: T[], r: { start: number; limit: number; size: number; totalSize?: number; _links?: { next?: string } }): ConfluencePaged<T> {
  return { items, start: r.start, limit: r.limit, size: r.size, ...(typeof r.totalSize === "number" && { total: r.totalSize }), hasMore: Boolean(r._links?.next) };
}

export function toStorage(body: string, format: "markdown" | "storage"): string {
  return format === "storage" ? body : markdownToStorage(body);
}
