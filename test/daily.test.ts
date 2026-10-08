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
    // The nested <time datetime="2026-10-11" /> does not add a column.
    expect(NESTED_TABLE).toContain('datetime="2026-10-11"');
    const e = catchErr(() => locateDailyCell(DAILY_PAGE, "2026-10-11", ME));
    expect(e.code).toBe("no-date");
    expect(e.message).toContain("Các ngày hiện có: 2026-10-07, 2026-10-08, 2026-10-09.");
  });

  const mention = (key: string, name: string): string =>
    `<ac:link><ri:user ri:userkey="${key}" /><ac:plain-text-link-body><![CDATA[${name}]]></ac:plain-text-link-body></ac:link>`;
  const page = (rows: string): string =>
    `<table><tbody><tr><th><br /></th><th>Role</th><th><time datetime="2026-10-07" /></th><th><time datetime="2026-10-08" /></th><th><time datetime="2026-10-09" /></th></tr>${rows}</tbody></table>`;
  const myRow = `<tr><td><p>${mention(ME, "Cao PV")}</p></td><td>BE</td><td>MINE07</td><td>MINE08</td><td>MINE09</td></tr>`;

  it("fails closed with code layout when the table uses rowspan", () => {
    const storage = page(`<tr><td><p>${mention("mate-a-key", "A")}</p></td><td rowspan="2">BE</td><td>A07</td><td>A08</td><td>A09</td></tr>${myRow}`);
    const e = catchErr(() => locateDailyCell(storage, "2026-10-08", ME));
    expect(e.code).toBe("layout");
    expect(e.message).toBe("Bảng daily có ô gộp nhiều hàng (rowspan) nên không xác định chắc chắn được ô cần điền. Hãy điền thủ công trên Confluence.");
  });

  it("ignores rowspan=1", () => {
    const storage = page(`<tr><td><p>${mention("mate-a-key", "A")}</p></td><td rowspan="1">BE</td><td>A07</td><td>A08</td><td>A09</td></tr>${myRow}`);
    expect(locateDailyCell(storage, "2026-10-08", ME).inner).toBe("MINE08");
  });

  it("pairfirst: a teammate's first cell mentioning me after their own mention is not my row", () => {
    const mate = `<tr><td><p>${mention("mate-a-key", "Mate A")} (backup ${mention(ME, "Cao PV")})</p></td><td>FE</td><td>A07</td><td>A08</td><td>A09</td></tr>`;
    const cell = locateDailyCell(page(mate + myRow), "2026-10-08", ME);
    expect(cell.inner).toBe("MINE08");
    expect(cell.rowLabel).toBe("Cao PV");
    expect(catchErr(() => locateDailyCell(page(mate), "2026-10-08", ME)).code).toBe("no-row");
  });

  it("nestedfirst: a mention of me inside a nested table in a teammate's first cell is ignored", () => {
    const nested = `<table><tbody><tr><td>${mention(ME, "Cao PV")}</td></tr></tbody></table>`;
    const mate = `<tr><td><div class="content-wrapper">${nested}<p>${mention("mate-b-key", "Mate B")}</p></div></td><td>QA</td><td>B07</td><td>B08</td><td>B09</td></tr>`;
    const cell = locateDailyCell(page(mate + myRow), "2026-10-08", ME);
    expect(cell.inner).toBe("MINE08");
    expect(cell.rowLabel).toBe("Cao PV");
    expect(catchErr(() => locateDailyCell(page(mate), "2026-10-08", ME)).code).toBe("no-row");
  });

  it("takes rowLabel from the owner mention, not a nested-table mention before it", () => {
    const nested = `<table><tbody><tr><td>${mention("mate-b-key", "Mate B")}</td></tr></tbody></table>`;
    const mine = `<tr><td><div class="content-wrapper">${nested}<p>${mention(ME, "Cao PV")}</p></div></td><td>BE</td><td>M07</td><td>M08</td><td>M09</td></tr>`;
    const cell = locateDailyCell(page(mine), "2026-10-08", ME);
    expect(cell.inner).toBe("M08");
    expect(cell.rowLabel).toBe("Cao PV");
  });

  const AMBIGUOUS = (d: string): string =>
    `Bảng daily có cột ngày ${d} không rõ ràng (ô tiêu đề gộp cột hoặc ngày xuất hiện nhiều lần) nên không xác định chắc chắn được ô cần điền. Hãy điền thủ công trên Confluence.`;

  it("fails closed when the date sits in a colspan title header above the date row", () => {
    const storage =
      `<table><tbody><tr><th colspan="4">Sprint <time datetime="2026-10-12" /> – <time datetime="2026-10-16" /></th></tr>` +
      `<tr><th><br /></th><th>Role</th><th><time datetime="2026-10-12" /></th><th><time datetime="2026-10-13" /></th></tr>` +
      `<tr><td><p>${mention(ME, "Cao PV")}</p></td><td>BE</td><td>MINE12</td><td>MINE13</td></tr></tbody></table>`;
    const e = catchErr(() => locateDailyCell(storage, "2026-10-12", ME));
    expect(e.code).toBe("layout");
    expect(e.message).toBe(AMBIGUOUS("2026-10-12"));
  });

  it("fails closed when the matching date header cell spans several columns", () => {
    const storage =
      `<table><tbody><tr><th><br /></th><th>Role</th><th colspan="2"><time datetime="2026-10-08" /></th></tr>` +
      `<tr><td><p>${mention(ME, "Cao PV")}</p></td><td>BE</td><td>M1</td><td>M2</td></tr></tbody></table>`;
    const e = catchErr(() => locateDailyCell(storage, "2026-10-08", ME));
    expect(e.code).toBe("layout");
    expect(e.message).toBe(AMBIGUOUS("2026-10-08"));
  });

  it("fails closed when the date is in the first header cell (target would be the name cell)", () => {
    const storage =
      `<table><tbody><tr><th>Daily <time datetime="2026-10-08" /></th><th>Role</th><th>Ghi chú</th></tr>` +
      `<tr><td><p>${mention(ME, "Cao PV")}</p></td><td>BE</td><td>NOTE</td></tr></tbody></table>`;
    const e = catchErr(() => locateDailyCell(storage, "2026-10-08", ME));
    expect(e.code).toBe("layout");
    expect(e.message).toBe(AMBIGUOUS("2026-10-08"));
  });

  it("fails closed when the date appears in more than one header cell", () => {
    const storage =
      `<table><tbody><tr><th><br /></th><th>Role</th><th><time datetime="2026-10-08" /></th><th><time datetime="2026-10-08" /> (bù)</th></tr>` +
      `<tr><td><p>${mention(ME, "Cao PV")}</p></td><td>BE</td><td>M1</td><td>M2</td></tr></tbody></table>`;
    const e = catchErr(() => locateDailyCell(storage, "2026-10-08", ME));
    expect(e.code).toBe("layout");
    expect(e.message).toBe(AMBIGUOUS("2026-10-08"));
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
