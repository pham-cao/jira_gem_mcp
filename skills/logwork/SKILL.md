---
name: logwork
description: Ghi logwork cục bộ khi làm task Jira, đề xuất worklog Jira và điền daily meeting trên Confluence. Dùng khi người dùng giao task Jira (key dạng ABC-123 hoặc link /browse/ABC-123), nói "bắt đầu task", "xong task", "làm task", "logwork", "log work", "log giờ", "ghi worklog", "điền daily", "fill daily", "daily meeting", "daily standup", hoặc khi bắt đầu hay kết thúc một task Jira.
argument-hint: "[start <ISSUE> | stop | daily]"
---

# Logwork và Daily (gem-jira)

Các tool trong skill này được gọi theo tên ngắn (`jira_get_issue`, `jira_search`, `jira_add_worklog`, `confluence_search`, `confluence_fill_daily`). Tên đầy đủ trong Claude Code có tiền tố mcp, ví dụ `mcp__plugin_gem-jira_jira__jira_get_issue`; dùng đúng tool có hậu tố tương ứng.

## Quy tắc an toàn (đọc trước)

- KHÔNG BAO GIỜ gọi `jira_add_worklog` hoặc `confluence_fill_daily` với `preview: false` khi người dùng chưa đồng ý rõ ràng trong lượt hội thoại hiện tại.
- KHÔNG ước lượng giờ. Mọi mốc giờ lấy bằng lệnh `date` tại thời điểm xảy ra (xem "Lấy giờ").
- Chỉ đề xuất worklog cho các phiên chưa log. Không log trùng.
- Không tự đổi trạng thái issue Jira, không tự thêm cột ngày hay hàng thành viên vào trang daily.
- Gặp lỗi tool thì báo nguyên văn cho người dùng, không tự thử vòng vo.

## Khi nào dùng

- Người dùng giao task Jira: key `[A-Z][A-Z0-9_]*-\d+` hoặc link `.../browse/KEY` -> chạy "Bắt đầu task".
- Người dùng nói xong task, dừng, nghỉ, chuyển task khác -> chạy "Kết thúc task".
- Người dùng nói điền daily, cuối ngày -> chạy "Điền daily".
- Đối số: `start KEY` = bắt đầu task KEY; `stop` = kết thúc task đang mở; `daily` = điền daily.

## File logwork

Thư mục `./logwork/` trong repo đang làm việc.

Lần đầu tạo `./logwork/`: nếu đang trong git repo thì thêm dòng `logwork/` vào `.git/info/exclude` khi chưa có:

```bash
mkdir -p logwork
if git rev-parse --git-dir >/dev/null 2>&1; then
  ex="$(git rev-parse --git-path info/exclude)"
  mkdir -p "$(dirname "$ex")"
  if ! grep -qxF 'logwork/' "$ex" 2>/dev/null; then
    [ -s "$ex" ] && [ -n "$(tail -c1 "$ex")" ] && echo >> "$ex"
    echo 'logwork/' >> "$ex"
  fi
fi
```

### `./logwork/YYYY-MM-DD.md` (ngày theo giờ máy)

Mỗi task một mục. Phiên đang mở ghi `HH:MM–…`.

```markdown
## ABC-123 — Làm API refresh token
- Phiên: 09:05–10:40 (1h35m) [worklog 10234] · 13:30–15:00 (1h30m) · 15:10–…
- Trạng thái: in-progress
- Đã làm:
  - ✓ Hoàn thành endpoint refresh token
  - Đang review PR #12
- Vướng mắc:
- Jira worklog: chờ xác nhận
```

- `Trạng thái:` một trong `in-progress | done | blocked`.
- `Đã làm:` gạch đầu dòng, viết theo kết quả đạt được.
- Phiên đã log được đánh dấu ngay trên dòng `Phiên:` bằng `[worklog {id}]` (đã log) hoặc `[bỏ qua]` (người dùng chọn bỏ qua). Phiên CHƯA log = phiên không có dấu nào (kể cả phiên đang mở). Các phiên ngăn cách bằng ` · `.
- Dòng "Đã làm" đã đưa vào một worklog được thêm tiền tố `✓ ` (khi đánh dấu phiên). Dòng không có `✓` là dòng chưa log.
- `Jira worklog:` chỉ là dòng tóm tắt: `chờ xác nhận` khi còn phiên chưa đánh dấu, `đã log hết` khi mọi phiên đều có `[worklog …]` hoặc `[bỏ qua]` và có ít nhất một `[worklog …]`, `bỏ qua` khi mọi phiên đều `[bỏ qua]`. Nguồn sự thật là dấu trên từng phiên, không phải dòng này.

### `./logwork/config.json`

```json
{ "dailyPageUrl": "https://conf.gem-corp.tech/pages/viewpage.action?pageId=212026868", "dailyPageId": "212026868" }
```

## Lấy giờ

Luôn chạy lệnh, không đoán:

```bash
date +%H:%M      # giờ hiện tại, để ghi phiên
date +%F         # ngày hôm nay, tên file logwork
date +%FT%H:%M:%S%:z   # thời điểm hiện tại (ISO); chỉ để tham khảo múi giờ, KHÔNG dùng trực tiếp làm started
date +%:z       # múi giờ máy, ví dụ +07:00
```

Ngày làm việc kế tiếp (bỏ thứ 7 và chủ nhật), dùng cho daily:

```bash
d=$(date -d tomorrow +%F); while [ $(date -d "$d" +%u) -gt 5 ]; do d=$(date -d "$d +1 day" +%F); done; echo "$d"
```

`started` = giờ BẮT ĐẦU của phiên (không phải giờ hiện tại): ghép ngày của file logwork + `HH:MM` đã ghi của phiên + `date +%:z`, ví dụ `2026-10-08T09:05:00+07:00` (lấy múi giờ bằng `date +%:z`).

## Bắt đầu task

1. Lấy key: từ tin nhắn, từ link `.../browse/KEY`, hoặc từ đối số `start KEY`.
2. Gọi `jira_get_issue` với `issueKey: KEY` để lấy summary và trạng thái. Lỗi (không thấy issue) thì báo người dùng và dừng.
3. Đọc `./logwork/$(date +%F).md` (tạo nếu chưa có). Nếu đang có phiên mở (`HH:MM–…`) của task khác thì đóng phiên đó trước bằng giờ `date +%H:%M`, tính lại `(XhYm)`.
4. Thêm mục `## KEY — {summary}` mới, hoặc thêm phiên mới vào mục đã có trong ngày, với giờ bắt đầu từ `date +%H:%M`. Trạng thái `in-progress`. Khi thêm phiên vào mục đã có: giữ nguyên mọi dấu `[worklog …]`/`[bỏ qua]` và các dòng `Đã làm`, chỉ nối thêm ` · HH:MM–…` và đặt dòng `Jira worklog:` thành `chờ xác nhận` (mục mới cũng ghi `chờ xác nhận`).
5. Thông báo ngắn đúng một dòng: `Logwork: bắt đầu {KEY} lúc {HH:MM}`.

Trong lúc làm task, khi hoàn thành một kết quả đáng kể thì thêm vào `Đã làm:`; khi bị chặn thì ghi `Vướng mắc:` và đặt trạng thái `blocked`.

## Kết thúc task và đề xuất worklog

1. Khi task xong hoặc người dùng bảo dừng: lấy giờ bằng `date +%H:%M`, đóng phiên mở (`HH:MM–HH:MM (XhYm)`), cập nhật `Trạng thái`, `Đã làm`, `Vướng mắc`.
2. Đề xuất worklog (chỉ tính phiên của task trong ngày CHƯA được log):
   - thời lượng = tổng các phiên chưa có dấu `[worklog …]`/`[bỏ qua]`, làm tròn LÊN bội số của 15 phút, tối thiểu `15m`. Ví dụ 1h35m -> `1h 45m`; 7m -> `15m`; 2h00m -> `2h`;
   - `started` = giờ bắt đầu của phiên đầu tiên chưa log, định dạng ISO-8601 có múi giờ (xem "Lấy giờ");
   - `comment` = chỉ các dòng "Đã làm" chưa có `✓`, nối bằng xuống dòng.
3. HỎI người dùng, nêu rõ KEY, `timeSpent`, `started`, `comment`; chọn: đồng ý / sửa giờ / bỏ qua.
4. Chỉ khi được đồng ý mới gọi `jira_add_worklog`:
   `{ issueKey, timeSpent, started, comment }` (`timeSpent` dạng `"1h 45m"`, `started` dạng ISO-8601 như `2026-10-08T09:05:00+07:00`).
   Rồi thêm ` [worklog {id}]` (id trả về) vào MỌI phiên mà worklog đã bao gồm, thêm tiền tố `✓ ` vào các dòng "Đã làm" đã dùng làm comment, và cập nhật dòng tóm tắt `Jira worklog:`. Người dùng bỏ qua thì thêm ` [bỏ qua]` vào các phiên đó (để không đề xuất lại) và cập nhật dòng tóm tắt.
5. Lỗi từ `jira_add_worklog` thì không đánh dấu phiên nào, báo lỗi, không tự thử lại.

## Điền daily

Daily điền vào ô của NGÀY LÀM VIỆC KẾ TIẾP, chạy vào cuối ngày.

1. `date` = ngày làm việc kế tiếp (lệnh ở "Lấy giờ").
2. Đọc `./logwork/$(date +%F).md` (hôm nay). Dựng:
   - **A (yesterday)** = mỗi task trong file hôm nay: `{ text: <summary của issue>, issueKey: KEY }` (`text` ngắn, là summary lấy từ tiêu đề mục `## KEY — {summary}`).
   - **B (today)** = các task trong file hôm nay có trạng thái `in-progress` hoặc `blocked` (`text` = summary của issue), hợp với kết quả `jira_search` với `jql: assignee = currentUser() AND status = "In Progress"`, khử trùng theo key. Mỗi phần tử `{ text, issueKey }`, với kết quả search cũng lấy `summary` làm `text`.
   - **C (problems)** = các dòng `Vướng mắc` khác rỗng, mảng chuỗi.
3. `pageId`: lấy `dailyPageId` trong `./logwork/config.json`. Chưa có thì hỏi người dùng link trang daily và trích số sau `pageId=` trong URL. Nếu người dùng chỉ đưa tên trang, gọi `confluence_search` với `cql: type=page AND title ~ "<tên>"`, cho người dùng chọn. Rồi ghi `config.json` với `dailyPageUrl` và `dailyPageId`.
4. Gọi `confluence_fill_daily` với `{ pageId, date, yesterday, today, problems, preview: true }` rồi hiện nội dung ô (`after`, dạng dễ đọc: A/B/C kèm các dòng) và `row`, `date` cho người dùng xem.
5. Xử lý lỗi (giữ nguyên văn thông báo của tool khi báo người dùng):
   - Lỗi `Trang daily không có cột cho ngày ...` (no-date): hỏi link trang daily mới, cập nhật `config.json`, gọi lại preview với `pageId` mới.
   - Lỗi `Không tìm thấy hàng của bạn ...` (no-row): báo người dùng nhờ người quản lý trang thêm hàng; dừng, không tự sửa trang.
   - Lỗi cấu trúc bảng (layout, ví dụ ô gộp rowspan): báo nguyên văn và dừng.
   - Lỗi `Ô ngày ... của bạn đã có nội dung` (already-filled): cho người dùng xem `before`, hỏi có ghi đè không. Chỉ khi đồng ý mới gọi lại với `overwrite: true`.
6. Khi người dùng xác nhận nội dung: gọi lại cùng tham số với `preview: false` (thêm `overwrite: true` chỉ nếu đã được đồng ý ở bước 5). Báo `url` của trang và `version` trả về.

## Phong cách Agile

Mỗi dòng ngắn gọn, không ghi thao tác kỹ thuật vụn vặt. Mục A/B của daily: `text` = summary ngắn của issue, key đi qua `issueKey` (không nhét key vào `text`). Phong cách viết theo kết quả đạt được áp dụng cho các dòng "Đã làm" (worklog comment) và các dòng vướng mắc (mục C).

Tốt:
- Hoàn thành API refresh token
- Đang review PR #12, còn phần xử lý lỗi
- Chốt phương án cache với team, bắt đầu triển khai

Không tốt:
- Sửa file auth.ts dòng 120, thêm if, chạy lại test
- ABC-123 (lặp lại tên task, không nói kết quả)
- Làm task hôm nay

## Tóm tắt luồng

- start: `jira_get_issue` -> ghi phiên mới vào `./logwork/` -> `Logwork: bắt đầu {KEY} lúc {HH:MM}`.
- stop: đóng phiên -> đề xuất worklog -> hỏi -> (đồng ý) `jira_add_worklog`.
- daily: dựng A/B/C -> `confluence_fill_daily` preview -> hỏi -> `preview: false`.
