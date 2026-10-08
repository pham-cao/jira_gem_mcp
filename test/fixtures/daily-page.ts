// Anonymised storage modelled on a real sprint daily-meeting page (spec §1). Names and userkeys are fake.
export const ME = "me-key";

const user = (key: string, name: string): string =>
  `<div class="content-wrapper"><p><ac:link><ri:user ri:userkey="${key}" /><ac:plain-text-link-body><![CDATA[${name}]]></ac:plain-text-link-body></ac:link></p></div>`;

const dateTh = (d: string): string => `<th colspan="1"><div class="content-wrapper"><p><time datetime="${d}" />&nbsp;</p></div></th>`;

const filled = (a: string, b: string): string =>
  `<td colspan="1"><p><strong>A. Yesterday Task:</strong></p><ol><li>${a}</li></ol><p><strong>B. Today Task:</strong></p><ol><li>${b}</li></ol><p><strong>C. Problems:</strong></p></td>`;

// Nested table inside a teammate's 2026-10-07 cell; its <time> must not create a column, its <tr>/<td> must not shift counting.
export const NESTED_TABLE =
  `<table class="wrapped"><colgroup><col /><col /></colgroup><tbody><tr><th>Mốc</th><th>Ngày</th></tr>` +
  `<tr><td>Demo</td><td><div class="content-wrapper"><p><time datetime="2026-10-11" />&nbsp;</p></div></td></tr></tbody></table>`;

export const DAILY_PAGE =
  `<p>Daily meeting sprint 1.</p>` +
  `<table class="wrapped relative-table" style="width: 98.5%;"><colgroup><col style="width: 12%;" /><col style="width: 4%;" /><col style="width: 28%;" /><col style="width: 28%;" /><col style="width: 28%;" /></colgroup><tbody>` +
  `<tr><th><br /></th><th colspan="1">Role</th>${dateTh("2026-10-07")}${dateTh("2026-10-08")}${dateTh("2026-10-09")}</tr>` +
  `<tr><td>Template</td><td colspan="1"><br /></td>` +
  `<td colspan="1"><p><strong>A. <strong>Yesterday Task:</strong></strong></p><ol><li>Task Name (Link task Jira)</li></ol><p><strong>B. Today Task:</strong></p><ol><li>Task Name (Link task Jira)</li></ol><p><strong>C. Problems:</strong></p></td>` +
  `<td colspan="1"><br /></td><td colspan="1"><br /></td></tr>` +
  // Teammate whose 2026-10-08 cell @-mentions me.
  `<tr><td>${user("mate-a-key", "Nguyen Van A")}</td><td colspan="1">FE</td>${filled("Dựng màn hình login", "Fix CSS")}` +
  `<td colspan="1"><div class="content-wrapper"><p>Pair with <ac:link><ri:user ri:userkey="${ME}" /><ac:plain-text-link-body><![CDATA[Cao PV]]></ac:plain-text-link-body></ac:link></p></div></td>` +
  `<td colspan="1"><br /></td></tr>` +
  // Teammate whose 2026-10-07 cell holds a nested table.
  `<tr><td>${user("mate-b-key", "Tran Thi B")}</td><td colspan="1">QA</td>` +
  `<td colspan="1"><div class="content-wrapper"><p>Kế hoạch:</p>${NESTED_TABLE}</div></td>` +
  `<td colspan="1">&nbsp;</td><td colspan="1"><br /></td></tr>` +
  // My row.
  `<tr><td>${user(ME, "Cao PV")}</td><td colspan="1">BE</td>${filled("Thiết kế API", "Viết test")}` +
  `<td colspan="1"><br /></td><td colspan="1" /></tr>` +
  `</tbody></table><p><br /></p>`;
