import { describe, expect, it } from "vitest";
import { DailyError, isEmptyCell, locateDailyCell, renderDailyCell, replaceCell } from "../src/confluence/daily.js";
import { DAILY_PAGE, ME, NESTED_TABLE } from "./fixtures/daily-page.js";

const catchErr = (fn: () => unknown): DailyError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DailyError);
    return e as DailyError;
  }
  throw new Error("expected DailyError");
};

describe("locateDailyCell", () => {
  it("finds my empty <br /> cell for 2026-10-08", () => {
    const cell = locateDailyCell(DAILY_PAGE, "2026-10-08", ME);
    expect(cell.inner).toBe("<br />");
    expect(cell.rowLabel).toBe("Cao PV");
    expect(cell.selfClosing).toBe(false);
    expect(cell.openTag).toBe('<td colspan="1">');
    expect(DAILY_PAGE.slice(cell.innerStart, cell.innerEnd)).toBe("<br />");
  });

  it("handles a self-closing cell and replaces it with a full <td>, keeping attributes", () => {
    const cell = locateDailyCell(DAILY_PAGE, "2026-10-09", ME);
    expect(cell.selfClosing).toBe(true);
    expect(cell.inner).toBe("");
    expect(cell.openTag).toBe('<td colspan="1">');
    expect(isEmptyCell(cell.inner)).toBe(true);
    const out = replaceCell(DAILY_PAGE, cell, "<p>x</p>");
    expect(out).toBe(DAILY_PAGE.slice(0, cell.innerStart) + '<td colspan="1"><p>x</p></td>' + DAILY_PAGE.slice(cell.innerEnd));
    expect(DAILY_PAGE.slice(cell.innerStart, cell.innerEnd)).toBe('<td colspan="1" />');
    expect(out).toContain('<td colspan="1"><br /></td><td colspan="1"><p>x</p></td></tr></tbody></table>');
  });

  it("reports a filled cell as non-empty", () => {
    const cell = locateDailyCell(DAILY_PAGE, "2026-10-07", ME);
    expect(isEmptyCell(cell.inner)).toBe(false);
    expect(cell.inner).toContain("Thiết kế API");
  });

  it("throws no-date with the fixed copy", () => {
    const e = catchErr(() => locateDailyCell(DAILY_PAGE, "2026-10-10", ME));
    expect(e.code).toBe("no-date");
    expect(e.message).toBe(
      "Trang daily không có cột cho ngày 2026-10-10. Các ngày hiện có: 2026-10-07, 2026-10-08, 2026-10-09. Có thể đã sang sprint/tuần mới — hãy cung cấp link trang daily mới.",
    );
  });

  it("throws no-row with the fixed copy", () => {
    const e = catchErr(() => locateDailyCell(DAILY_PAGE, "2026-10-08", "nobody"));
    expect(e.code).toBe("no-row");
    expect(e.message).toBe("Không tìm thấy hàng của bạn (userKey nobody) trong bảng daily. Hãy nhờ người quản lý trang thêm bạn vào bảng.");
  });

  it("matches the row by its first cell only, not a teammate's cell that mentions me (Review Focus 1)", () => {
    const cell = locateDailyCell(DAILY_PAGE, "2026-10-08", ME);
    expect(cell.rowLabel).toBe("Cao PV");
    expect(cell.inner).not.toContain("Pair with");
  });

  it("ignores nested tables when counting rows/columns (Review Focus 2)", () => {
    const plain = DAILY_PAGE.replace(NESTED_TABLE, "");
    expect(plain).not.toBe(DAILY_PAGE);
    for (const date of ["2026-10-07", "2026-10-08", "2026-10-09"]) {
      const a = locateDailyCell(DAILY_PAGE, date, ME);
      const b = locateDailyCell(plain, date, ME);
      expect(a.innerStart).toBe(b.innerStart + NESTED_TABLE.length);
      expect(a.inner).toBe(b.inner);
    }
    // The nested <time datetime="2026-10-09" /> does not add a column.
    const e = catchErr(() => locateDailyCell(DAILY_PAGE, "2026-10-10", ME));
    expect(e.message).toContain("Các ngày hiện có: 2026-10-07, 2026-10-08, 2026-10-09.");
  });

  it("skips CDATA and comments that look like tags", () => {
    const page = DAILY_PAGE.replace("<p>Daily meeting sprint 1.</p>", '<!-- <table><tr><th><time datetime="2026-10-10" /></th></tr></table> --><ac:plain-text-body><![CDATA[<td>]]></ac:plain-text-body>');
    expect(catchErr(() => locateDailyCell(page, "2026-10-10", ME)).code).toBe("no-date");
    expect(locateDailyCell(page, "2026-10-08", ME).inner).toBe("<br />");
  });
});

describe("replaceCell", () => {
  it("only changes the cell's inner content", () => {
    const cell = locateDailyCell(DAILY_PAGE, "2026-10-08", ME);
    const X = "<p>new</p>";
    const out = replaceCell(DAILY_PAGE, cell, X);
    expect(out).toBe(DAILY_PAGE.slice(0, cell.innerStart) + X + DAILY_PAGE.slice(cell.innerEnd));
    expect(out.slice(0, cell.innerStart)).toBe(DAILY_PAGE.slice(0, cell.innerStart));
    expect(out.slice(cell.innerStart + X.length)).toBe(DAILY_PAGE.slice(cell.innerEnd));
  });
});

describe("isEmptyCell", () => {
  it.each(["<br />", "&nbsp;", " <p><br /></p> ", ""])("%j is empty", (s) => expect(isEmptyCell(s)).toBe(true));
  it("<p>x</p> is not empty", () => expect(isEmptyCell("<p>x</p>")).toBe(false));
});

describe("renderDailyCell", () => {
  it("renders the template with escaping and Jira links", () => {
    expect(renderDailyCell({ yesterday: [{ text: "Sửa lỗi <SSO> & token", issueKey: "ABC-1" }], today: [], problems: [] }, "https://jira.test")).toBe(
      '<p><strong>A. Yesterday Task:</strong></p><ol><li>Sửa lỗi &lt;SSO&gt; &amp; token (<a href="https://jira.test/browse/ABC-1">ABC-1</a>)</li></ol><p><strong>B. Today Task:</strong></p><ol><li>—</li></ol><p><strong>C. Problems:</strong></p>',
    );
  });

  it("escapes quotes and ]]> in problems", () => {
    const out = renderDailyCell({ yesterday: [], today: [], problems: ['Chờ KH "cấp" quyền ]]>'] }, "https://jira.test");
    expect(out.endsWith("<p><strong>C. Problems:</strong></p><ol><li>Chờ KH &quot;cấp&quot; quyền ]]&gt;</li></ol>")).toBe(true);
  });
});
