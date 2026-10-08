// Pure logic for the team daily-meeting page: find one cell in the storage XHTML and splice it by offsets.
// Never parse-and-reserialise: the page is shared, so every byte outside the target cell must stay identical.

export interface DailyItem {
  text: string;
  issueKey?: string;
}

export interface DailyContent {
  yesterday: DailyItem[];
  today: DailyItem[];
  problems: string[];
}

export interface DailyCell {
  innerStart: number;
  innerEnd: number;
  inner: string;
  rowLabel?: string;
  selfClosing: boolean;
  // Opening tag text; for a self-closing cell, `<td a="b" />` becomes `<td a="b">`.
  openTag: string;
}

export class DailyError extends Error {
  constructor(
    readonly code: "no-date" | "no-row" | "layout",
    message: string,
  ) {
    super(message);
    this.name = "DailyError";
  }
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const section = (title: string, items: string[], emptyDash: boolean): string => {
  const head = `<p><strong>${title}</strong></p>`;
  if (!items.length) return emptyDash ? `${head}<ol><li>—</li></ol>` : head;
  return `${head}<ol>${items.map((i) => `<li>${i}</li>`).join("")}</ol>`;
};

const item = (it: DailyItem, base: string): string => {
  if (!it.issueKey) return esc(it.text);
  const key = esc(it.issueKey);
  return `${esc(it.text)} (<a href="${esc(base)}/browse/${key}">${key}</a>)`;
};

/** Cell content following the page's Template row. */
export function renderDailyCell(c: DailyContent, jiraBaseUrl: string): string {
  const base = jiraBaseUrl.replace(/\/+$/, "");
  return (
    section("A. Yesterday Task:", c.yesterday.map((i) => item(i, base)), true) +
    section("B. Today Task:", c.today.map((i) => item(i, base)), true) +
    section("C. Problems:", c.problems.map(esc), false)
  );
}

/** Empty = nothing left after dropping <br />, &nbsp; and p/div/span wrappers. Any other tag (mention, image, macro…) counts as content. */
export function isEmptyCell(inner: string): boolean {
  const rest = inner
    .replace(/<\/?(?:p|div|span|br)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, "")
    .replace(/&nbsp;|&#160;|&#xa0;| /gi, "");
  return rest.trim() === "";
}

/** Rewrites only the cell's inner content; a self-closing cell is expanded to `<td …>html</td>`. */
export function replaceCell(storage: string, cell: DailyCell, html: string): string {
  const mid = cell.selfClosing ? `${cell.openTag}${html}</${/^<([^\s>/]+)/.exec(cell.openTag)![1]}>` : html;
  return storage.slice(0, cell.innerStart) + mid + storage.slice(cell.innerEnd);
}

interface Cell {
  tag: string;
  openTag: string;
  colspan: number;
  rowspan: number;
  selfClosing: boolean;
  // For self-closing cells: the whole tag's span. Otherwise: inner content span.
  innerStart: number;
  innerEnd: number;
}

interface Table {
  rows: Cell[][];
}

// CDATA and comments are matched first so their contents are never seen as tags.
const TOKEN = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<(\/?)(table|tr|td|th)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;

/** Top-level tables with their direct rows/cells; nested tables are skipped by depth. */
function scanTables(s: string): Table[] {
  const tables: Table[] = [];
  let depth = 0;
  let table: Table | undefined;
  let row: Cell[] | undefined;
  let open: Cell | undefined;
  const closeCell = (at: number) => {
    if (open) open.innerEnd = at;
    open = undefined;
  };
  for (const m of s.matchAll(TOKEN)) {
    if (!m[2]) continue;
    const [text, slash, rawName, attrs, selfSlash] = m;
    const name = rawName.toLowerCase();
    const start = m.index!;
    const end = start + text.length;
    if (name === "table") {
      if (selfSlash) continue;
      if (slash) {
        if (depth === 1) {
          closeCell(start);
          row = undefined;
          table = undefined;
        }
        depth = Math.max(0, depth - 1);
      } else if (++depth === 1) {
        table = { rows: [] };
        tables.push(table);
      }
      continue;
    }
    if (depth !== 1 || !table) continue;
    if (name === "tr") {
      closeCell(start);
      if (slash) row = undefined;
      else if (!selfSlash) table.rows.push((row = []));
      continue;
    }
    // td / th
    if (slash) {
      closeCell(start);
      continue;
    }
    closeCell(start);
    if (!row) table.rows.push((row = []));
    const span = /\bcolspan\s*=\s*["']?(\d+)/i.exec(attrs);
    const rspan = /\browspan\s*=\s*["']?(\d+)/i.exec(attrs);
    const cell: Cell = {
      tag: rawName,
      openTag: selfSlash ? text.replace(/\s*\/>$/, ">") : text,
      colspan: span ? Math.max(1, Number(span[1])) : 1,
      rowspan: rspan ? Math.max(1, Number(rspan[1])) : 1,
      selfClosing: !!selfSlash,
      innerStart: selfSlash ? start : end,
      innerEnd: end,
    };
    row.push(cell);
    if (!selfSlash) open = cell;
  }
  closeCell(s.length);
  return tables;
}

// First `ri:user` outside nested tables; CDATA and comments skipped.
const OWNER = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<(\/?)(table|ri:user)\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi;

/** Row owner: the first mention in the first cell, ignoring nested tables. `at` = offset of its `ri:user` tag. */
function owner(firstInner: string): { key?: string; at: number } | undefined {
  let depth = 0;
  for (const m of firstInner.matchAll(OWNER)) {
    if (!m[2]) continue;
    if (m[2].toLowerCase() === "table") {
      if (!m[4]) depth = m[1] ? Math.max(0, depth - 1) : depth + 1;
      continue;
    }
    if (m[1] || depth) continue;
    return { key: /\bri:userkey\s*=\s*"([^"]*)"/i.exec(m[3])?.[1], at: m.index! };
  }
  return undefined;
}

const innerOf = (s: string, c: Cell): string => (c.selfClosing ? "" : s.slice(c.innerStart, c.innerEnd));

/** Cell whose column span covers `col` (colspan-aware). */
function cellAt(row: Cell[], col: number): Cell | undefined {
  let at = 0;
  for (const c of row) {
    if (col < at + c.colspan) return col >= at ? c : undefined;
    at += c.colspan;
  }
  return undefined;
}

/** Finds the current user's cell for `date`. Throws DailyError (copy fixed in spec §3.4). */
export function locateDailyCell(storage: string, date: string, userKey: string): DailyCell {
  const tables = scanTables(storage);
  const known: string[] = [];
  const dateAttr = `datetime="${date}"`;
  for (const t of tables) {
    const header = t.rows.find((r) => r.some((c) => c.tag.toLowerCase() === "th"));
    if (!header) continue;
    let col = -1;
    let at = 0;
    for (const c of header) {
      const inner = innerOf(storage, c);
      for (const m of inner.matchAll(/datetime="(\d{4}-\d{2}-\d{2})/g)) if (!known.includes(m[1])) known.push(m[1]);
      if (col < 0 && inner.includes(dateAttr)) col = at;
      at += c.colspan;
    }
    if (col < 0) continue;
    for (const [i, r] of t.rows.entries()) {
      if (r === header || !r.length) continue;
      const first = innerOf(storage, r[0]);
      const who = owner(first);
      if (!who || who.key !== userKey) continue;
      // Rowspan shifts column positions in later rows; fail closed rather than risk writing a teammate's cell.
      if (t.rows.slice(0, i + 1).some((row) => row.some((c) => c.rowspan > 1))) {
        throw new DailyError("layout", "Bảng daily có ô gộp nhiều hàng (rowspan) nên không xác định chắc chắn được ô cần điền. Hãy điền thủ công trên Confluence.");
      }
      const target = cellAt(r, col);
      if (!target) continue;
      const label = /<ac:plain-text-link-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-link-body>/.exec(first.slice(who.at));
      return {
        innerStart: target.innerStart,
        innerEnd: target.innerEnd,
        inner: innerOf(storage, target),
        rowLabel: label?.[1],
        selfClosing: target.selfClosing,
        openTag: target.openTag,
      };
    }
    throw new DailyError(
      "no-row",
      `Không tìm thấy hàng của bạn (userKey ${userKey}) trong bảng daily. Hãy nhờ người quản lý trang thêm bạn vào bảng.`,
    );
  }
  throw new DailyError(
    "no-date",
    `Trang daily không có cột cho ngày ${date}. Các ngày hiện có: ${known.join(", ")}. Có thể đã sang sprint/tuần mới — hãy cung cấp link trang daily mới.`,
  );
}
