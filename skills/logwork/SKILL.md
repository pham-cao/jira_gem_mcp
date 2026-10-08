---
name: logwork
description: Ghi logwork cục bộ khi làm task Jira, đề xuất worklog Jira và điền daily meeting trên Confluence. Dùng khi người dùng giao task Jira (key dạng ABC-123 hoặc link /browse/ABC-123), nói "bắt đầu task", "xong task", "làm task", "logwork", "log work", "log giờ", "ghi worklog", "điền daily", "fill daily", "daily meeting", "daily standup", hoặc khi bắt đầu hay kết thúc một task Jira.
argument-hint: "[start <ISSUE> | stop | daily]"
---

# Logwork và Daily (gem-jira)

Các tool trong skill này được gọi theo tên ngắn (`jira_get_issue`, `jira_search`, `jira_add_worklog`, `confluence_search`, `confluence_fill_daily`). Tên đầy đủ trong Claude Code có tiền tố mcp, ví dụ `mcp__plugin_gem-jira_jira__jira_get_issue`; dùng đúng tool có hậu tố tương ứng.

## Quy tắc an toàn (đọc trước)

- KHÔNG BAO GIỜ gọi `jira_add_worklog` hoặc `confluence_fill_daily` với `preview: false` khi người dùng chưa đồng ý rõ ràng trong lượt hội thoại hiện tại.
- KHÔNG ước lượng giờ. Mọi mốc giờ lấy bằng lệnh `node -e` tại thời điểm xảy ra (xem "Lấy giờ").
- Chỉ đề xuất worklog cho các phiên chưa log. Không log trùng.
- Không tự đổi trạng thái issue Jira, không tự thêm cột ngày hay hàng thành viên vào trang daily.
- Gặp lỗi tool thì báo nguyên văn cho người dùng, không tự thử vòng vo.

## Khi nào dùng

- Người dùng giao hoặc yêu cầu làm một issue Jira (key `[A-Z][A-Z0-9_]*-\d+` hoặc link `.../browse/KEY`), ví dụ "làm task ABC-123", "fix ABC-123", `/gem-jira:logwork start ABC-123` -> chạy "Bắt đầu task". Chỉ nhắc tới hoặc hỏi về một issue (xem thông tin, tra cứu) thì KHÔNG bắt đầu phiên; không chắc thì hỏi người dùng trước.
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

Luôn chạy lệnh, không đoán. Dùng `node -e` (chạy được cả Linux và macOS; plugin đã cần Node ≥ 20), theo giờ máy:

```bash
node -e 'const d=new Date();console.log(d.toLocaleDateString("sv-SE"))'   # ngày hôm nay YYYY-MM-DD, tên file logwork
node -e 'console.log(new Date().toTimeString().slice(0,5))'                # giờ hiện tại HH:MM, để ghi phiên
```

Ngày làm việc kế tiếp (bỏ thứ 7 và chủ nhật), dùng cho daily:

```bash
node -e 'const d=new Date();do d.setDate(d.getDate()+1);while([0,6].includes(d.getDay()));console.log(d.toLocaleDateString("sv-SE"))'
```

Lệnh này không biết ngày nghỉ lễ; bản preview daily có hiện `date`, nhắc người dùng sửa nếu ngày đó là ngày nghỉ.

`started` = giờ BẮT ĐẦU của phiên (không phải giờ hiện tại): ghép ngày của file logwork + `HH:MM` đã ghi của phiên, dạng `YYYY-MM-DDTHH:MM:00`, KHÔNG kèm múi giờ, ví dụ `2026-10-08T09:05:00`. Server hiểu chuỗi không có múi giờ là giờ máy (giờ địa phương).

Phiên kéo qua nửa đêm, hoặc chạy daily sau nửa đêm: dùng file của ngày bắt đầu làm việc (ví dụ vẫn là file hôm qua); đây là hạn chế đã biết.

## Bắt đầu task

1. Lấy key: từ tin nhắn, từ link `.../browse/KEY`, hoặc từ đối số `start KEY`.
2. Gọi `jira_get_issue` với `issueKey: KEY` để lấy summary và trạng thái. Lỗi (không thấy issue) thì báo người dùng và dừng.
3. Đọc `./logwork/YYYY-MM-DD.md` của hôm nay (tạo nếu chưa có). Nếu đang có phiên mở (`HH:MM–…`) của task khác thì đóng phiên đó trước bằng giờ hiện tại, tính lại `(XhYm)`. Nếu task vừa đóng còn phiên chưa đánh dấu thì chạy ngay bước 2–5 của "Kết thúc task và đề xuất worklog" cho task đó (vẫn HỎI trước, không tự log).
4. Thêm mục `## KEY — {summary}` mới, hoặc thêm phiên mới vào mục đã có trong ngày, với giờ bắt đầu là giờ hiện tại. Trạng thái `in-progress`. Khi thêm phiên vào mục đã có: giữ nguyên mọi dấu `[worklog …]`/`[bỏ qua]` và các dòng `Đã làm`, chỉ nối thêm ` · HH:MM–…` và đặt dòng `Jira worklog:` thành `chờ xác nhận` (mục mới cũng ghi `chờ xác nhận`).
5. Thông báo ngắn đúng một dòng: `Logwork: bắt đầu {KEY} lúc {HH:MM}`.

Trong lúc làm task, khi hoàn thành một kết quả đáng kể thì thêm vào `Đã làm:`; khi bị chặn thì ghi `Vướng mắc:` và đặt trạng thái `blocked`.

## Kết thúc task và đề xuất worklog

1. Khi task xong hoặc người dùng bảo dừng: lấy giờ hiện tại (lệnh ở "Lấy giờ"), đóng phiên mở (`HH:MM–HH:MM (XhYm)`), cập nhật `Trạng thái`, `Đã làm`, `Vướng mắc`.
2. Đề xuất worklog (chỉ tính phiên của task trong ngày CHƯA được log):
   - thời lượng = tổng các phiên chưa có dấu `[worklog …]`/`[bỏ qua]`, làm tròn LÊN bội số của 15 phút, tối thiểu `15m`. Ví dụ 1h35m -> `1h 45m`; 7m -> `15m`; 2h00m -> `2h`;
   - `started` = giờ bắt đầu của phiên đầu tiên chưa log, dạng `YYYY-MM-DDTHH:MM:00` không múi giờ (xem "Lấy giờ");
   - `comment` = chỉ các dòng "Đã làm" chưa có `✓`, nối bằng xuống dòng.
3. HỎI người dùng, nêu rõ KEY, `timeSpent`, `started`, `comment`; chọn: đồng ý / sửa giờ / bỏ qua.
4. Chỉ khi được đồng ý mới gọi `jira_add_worklog`:
   `{ issueKey, timeSpent, started, comment }` (`timeSpent` dạng `"1h 45m"`, `started` dạng `2026-10-08T09:05:00`).
   Rồi thêm ` [worklog {id}]` (id trả về) vào MỌI phiên mà worklog đã bao gồm, thêm tiền tố `✓ ` vào các dòng "Đã làm" đã dùng làm comment, và cập nhật dòng tóm tắt `Jira worklog:`. Người dùng bỏ qua thì thêm ` [bỏ qua]` vào các phiên đó (để không đề xuất lại) và cập nhật dòng tóm tắt.
5. Lỗi từ `jira_add_worklog` thì không đánh dấu phiên nào, báo lỗi, không tự thử lại.

## Điền daily

Daily điền vào ô của NGÀY LÀM VIỆC KẾ TIẾP, chạy vào cuối ngày.

1. `date` = ngày làm việc kế tiếp (lệnh ở "Lấy giờ").
2. Đọc `./logwork/YYYY-MM-DD.md` của hôm nay. Nếu có task còn phiên chưa đánh dấu, liệt kê các task đó và đề nghị log trước (bước 2–5 của "Kết thúc task và đề xuất worklog", vẫn hỏi từng task); xong hoặc người dùng từ chối thì mới điền daily. Dựng:
   - **A (yesterday)** = mỗi task trong file hôm nay: `{ text: <summary của issue>, issueKey: KEY }` (`text` ngắn, là summary lấy từ tiêu đề mục `## KEY — {summary}`).
   - **B (today)** = các task trong file hôm nay có trạng thái `in-progress` hoặc `blocked` (`text` = summary của issue), hợp với kết quả `jira_search` với `jql: assignee = currentUser() AND status = "In Progress"`, khử trùng theo key. Mỗi phần tử `{ text, issueKey }`, với kết quả search cũng lấy `summary` làm `text`.
   - **C (problems)** = các dòng `Vướng mắc` khác rỗng, mảng chuỗi.
3. `pageId`: lấy `dailyPageId` trong `./logwork/config.json`. Chưa có thì hỏi người dùng link trang daily và trích số sau `pageId=` trong URL. Nếu người dùng chỉ đưa tên trang, gọi `confluence_search` với `cql: type=page AND title ~ "<tên>"`, cho người dùng chọn. Rồi ghi `config.json` với `dailyPageUrl` và `dailyPageId`.
4. Gọi `confluence_fill_daily` với `{ pageId, date, yesterday, today, problems, preview: true }` rồi hiện nội dung ô (`after`, dạng dễ đọc: A/B/C kèm các dòng) và `row`, `date` cho người dùng xem.
5. Xử lý lỗi (giữ nguyên văn thông báo của tool khi báo người dùng):
   - Lỗi `Trang daily không có cột cho ngày ...` (no-date): hỏi link trang daily mới, cập nhật `config.json`, gọi lại preview với `pageId` mới.
   - Lỗi `Không tìm thấy hàng của bạn ...` (no-row): báo người dùng nhờ người quản lý trang thêm hàng; dừng, không tự sửa trang.
   - Lỗi cấu trúc bảng (layout: ô gộp rowspan, hoặc cột ngày không rõ ràng): báo nguyên văn và dừng.
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
- daily: đề nghị log phiên còn sót -> dựng A/B/C -> `confluence_fill_daily` preview -> hỏi -> `preview: false`.
