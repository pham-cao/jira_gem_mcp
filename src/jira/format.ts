
export const MAX_TEXT = 10_000;

export interface SlimUser {
  name: string;
  displayName: string;
}

export interface SlimSprint {
  id: number;
  name: string;
  state: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  startAt: number;
  maxResults: number;
  hasMore: boolean;
}

export function truncate(s: string | null | undefined, hint: string): string | null {
  if (s === null || s === undefined) return null;
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…[truncated] ${hint}` : s;
}

export function slimUser(u: any): SlimUser | null {
  return u ? { name: u.name, displayName: u.displayName } : null;
}

const SPRINT_KEYS = "id|rapidViewId|state|name|startDate|endDate|completeDate|activatedDate|sequence|goal|autoStartStop|synced|incompleteIssuesDestinationId";

/** Parses one `key=value` from Jira's legacy `Sprint@hash[k=v,...]` string; values may contain commas. */
function legacyField(s: string, key: string): string | undefined {
  const m = new RegExp(`[\\[,]${key}=(.*?)(?=,(?:${SPRINT_KEYS})=|\\]$)`).exec(s);
  return m?.[1];
}

export function parseSprintValue(v: unknown): SlimSprint[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item): SlimSprint[] => {
    if (typeof item === "string") {
      const id = Number(legacyField(item, "id"));
      if (!Number.isFinite(id)) return [];
      return [{ id, name: legacyField(item, "name") ?? "", state: legacyField(item, "state") ?? "" }];
    }
    if (item && typeof item === "object") {
      const o = item as any;
      return [{ id: o.id, name: o.name, state: o.state }];
    }
    return [];
  });
}

export function slimComment(c: any) {
  return {
    id: c.id,
    author: slimUser(c.author),
    body: truncate(c.body, "(dùng jira_get_comments để xem đầy đủ)"),
    created: c.created,
    updated: c.updated,
  };
}

export function slimWorklog(w: any) {
  return {
    id: w.id,
    author: slimUser(w.author),
    timeSpent: w.timeSpent,
    timeSpentSeconds: w.timeSpentSeconds,
    started: w.started,
    comment: truncate(w.comment, ""),
  };
}

export function slimSprint(s: any): SlimSprint & { startDate?: string; endDate?: string; goal?: string; boardId?: number } {
  return {
    id: s.id,
    name: s.name,
    state: s.state,
    startDate: s.startDate,
    endDate: s.endDate,
    goal: s.goal,
    boardId: s.originBoardId,
  };
}

const isPrimitive = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

export function slimIssue(raw: any, opts: { baseUrl: string; sprintFieldId?: string; full?: boolean }): Record<string, unknown> {
  const f = raw.fields ?? {};
  const out: Record<string, unknown> = { key: raw.key, url: `${opts.baseUrl}/browse/${raw.key}` };
  const set = (k: string, v: unknown) => {
    if (v !== undefined) out[k] = v;
  };
  const has = (k: string) => k in f;

  if (has("summary")) set("summary", f.summary);
  if (has("status")) set("status", f.status?.name ?? null);
  if (has("issuetype")) set("issuetype", f.issuetype?.name ?? null);
  if (has("priority")) set("priority", f.priority?.name ?? null);
  if (has("assignee")) set("assignee", slimUser(f.assignee));
  if (has("updated")) set("updated", f.updated);

  if (opts.full) {
    if (has("reporter")) set("reporter", slimUser(f.reporter));
    if (has("labels")) set("labels", f.labels);
    if (has("description")) set("description", truncate(f.description, ""));
    if (has("created")) set("created", f.created);
    if (has("resolution")) set("resolution", f.resolution?.name ?? null);
    if (f.parent) set("parent", { key: f.parent.key, summary: f.parent.fields?.summary });
    if (has("subtasks"))
      set("subtasks", (f.subtasks ?? []).map((s: any) => ({ key: s.key, summary: s.fields?.summary, status: s.fields?.status?.name })));
    if (has("issuelinks"))
      set(
        "issuelinks",
        (f.issuelinks ?? []).map((l: any) => {
          const inward = !!l.inwardIssue;
          const other = inward ? l.inwardIssue : l.outwardIssue;
          return {
            type: inward ? l.type?.inward : l.type?.outward,
            direction: inward ? "inward" : "outward",
            key: other?.key,
            summary: other?.fields?.summary,
            status: other?.fields?.status?.name,
          };
        }),
      );
    if (has("attachment"))
      set("attachments", (f.attachment ?? []).map((a: any) => ({ id: a.id, filename: a.filename, size: a.size, mimeType: a.mimeType })));
    if (f.comment) {
      set("comments", (f.comment.comments ?? []).slice(-10).map(slimComment));
      set("commentsTotal", f.comment.total);
    }
  }

  if (opts.sprintFieldId && has(opts.sprintFieldId)) set("sprint", parseSprintValue(f[opts.sprintFieldId]));

  for (const [k, v] of Object.entries(f)) {
    if (!k.startsWith("customfield_") || k === opts.sprintFieldId) continue;
    if (isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive))) out[k] = v;
  }
  return out;
}

export function paged<T>(items: T[], meta: { total: number; startAt: number; maxResults: number }): Paged<T> {
  return { items, ...meta, hasMore: meta.startAt + items.length < meta.total };
}

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

const offsetString = (minutes: number) => `${minutes >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(minutes) / 60))}${pad(Math.abs(minutes) % 60)}`;

/** Formats a date as Jira's `yyyy-MM-dd'T'HH:mm:ss.SSSZ`, preserving the offset written in an ISO input. */
export function toJiraDate(input?: string | Date): string {
  if (typeof input === "string") {
    const m = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d{1,3})\d*)?)?(Z|[+-]\d\d:?\d\d)?$/.exec(input.trim());
    if (!m) throw new Error(`Ngày giờ không hợp lệ: ${input} (cần ISO-8601, vd 2026-10-08T09:00:00+07:00)`);
    const [, date, hh, mi, ss = "00", ms = "0", tz] = m;
    if (Number.isNaN(Date.parse(`${date}T${hh}:${mi}:${ss}Z`))) throw new Error(`Ngày giờ không hợp lệ: ${input}`);
    if (!tz) return toJiraDate(new Date(`${date}T${hh}:${mi}:${ss}.${ms.padEnd(3, "0")}`));
    const offset = tz === "Z" ? "+0000" : tz.replace(":", "");
    return `${date}T${hh}:${mi}:${ss}.${ms.padEnd(3, "0")}${offset}`;
  }
  const d = input ?? new Date();
  if (Number.isNaN(d.getTime())) throw new Error("Ngày giờ không hợp lệ");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `.${pad(d.getMilliseconds(), 3)}${offsetString(-d.getTimezoneOffset())}`
  );
}
