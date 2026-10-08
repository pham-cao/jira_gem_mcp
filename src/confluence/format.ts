import { markdownToStorage } from "./convert.js";

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

export function confluencePaged<T>(items: T[], r: { start: number; limit: number; size: number; _links?: { next?: string } }): ConfluencePaged<T> {
  return { items, start: r.start, limit: r.limit, size: r.size, hasMore: Boolean(r._links?.next) };
}

export function toStorage(body: string, format: "markdown" | "storage"): string {
  return format === "storage" ? body : markdownToStorage(body);
}
