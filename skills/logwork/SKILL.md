---
name: logwork
description: Ghi logwork cục bộ khi làm task Jira và đề xuất worklog Jira. Dùng khi người dùng giao task Jira (key dạng ABC-123 hoặc link /browse/ABC-123), nói "bắt đầu task", "xong task", "làm task", "logwork", "log work", "log giờ", "ghi worklog", hoặc khi bắt đầu hay kết thúc một task Jira. Điền daily meeting dùng skill logdailymeeting.
argument-hint: "[start <ISSUE> | stop]"
---

# Logwork (gem-jira)

Các tool trong skill này được gọi theo tên ngắn (`jira_get_issue`, `jira_list_projects`, `jira_add_worklog`). Tên đầy đủ trong Claude Code có tiền tố mcp, ví dụ `mcp__plugin_gem-jira_jira__jira_get_issue`; dùng đúng tool có hậu tố tương ứng.

## Quy tắc an toàn (đọc trước)

- KHÔNG BAO GIỜ gọi `jira_add_worklog` khi người dùng chưa đồng ý rõ ràng trong lượt hội thoại hiện tại.
- KHÔNG mở phiên logwork cho task nào khi người dùng chưa xác nhận đưa task đó vào logwork (xem bước 3 của "Bắt đầu task").
- KHÔNG ước lượng giờ. Mọi mốc giờ lấy bằng lệnh `node -e` tại thời điểm xảy ra (xem "Lấy giờ").
- Chỉ đề xuất worklog cho các phiên chưa log. Không log trùng.
- Không tự đổi trạng thái issue Jira.
- Gặp lỗi tool thì báo nguyên văn cho người dùng, không tự thử vòng vo.

## Khi nào dùng

- Người dùng giao hoặc yêu cầu làm một issue Jira (key `[A-Z][A-Z0-9_]*-\d+` hoặc link `.../browse/KEY`), ví dụ "làm task ABC-123", "fix ABC-123", `/gem-jira:logwork start ABC-123` -> chạy "Bắt đầu task". Chỉ nhắc tới hoặc hỏi về một issue (xem thông tin, tra cứu) thì KHÔNG bắt đầu phiên; không chắc thì hỏi người dùng trước.
- Người dùng nói xong task, dừng, nghỉ, chuyển task khác -> chạy "Kết thúc task".
- Người dùng nói điền daily: dùng skill `logdailymeeting`, không xử lý trong skill này.
- Đối số: `start KEY` = bắt đầu task KEY; `stop` = kết thúc task đang mở.

## Setup lần đầu: mã dự án Jira của repo

Chạy TRƯỚC mọi luồng (start, stop). Đọc `./logwork/config.json`; nếu chưa có trường `jiraProject`:

1. Hỏi người dùng: "Repo này thuộc dự án Jira nào (mã dự án, ví dụ ABC)?". Nếu đang bắt đầu task `KEY` thì gợi ý phần trước dấu `-` của KEY (ví dụ `ABC-123` -> `ABC`).
2. Viết hoa câu trả lời, rồi kiểm tra bằng `jira_list_projects`: mã phải trùng một `key` trong kết quả. Không trùng thì báo và hỏi lại.
3. Ghi `jiraProject` vào `./logwork/config.json` (giữ nguyên các trường khác; tạo file và thư mục nếu chưa có, kèm bước `.git/info/exclude` ở "File logwork").

Đã có `jiraProject` thì không hỏi lại. Người dùng muốn đổi dự án thì cập nhật trường này.

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
{ "jiraProject": "ABC", "dailyPageUrl": "https://conf.gem-corp.tech/pages/viewpage.action?pageId=212026868", "dailyPageId": "212026868" }
```

- `jiraProject`: mã dự án Jira của repo này (xem "Setup lần đầu"). Dùng để cảnh báo task khác dự án.
- `dailyPageUrl`, `dailyPageId`: do skill `logdailymeeting` quản lý; giữ nguyên khi ghi file.

## Lấy giờ

Luôn chạy lệnh, không đoán. Dùng `node -e` (chạy được cả Linux và macOS; plugin đã cần Node ≥ 20), theo giờ máy:

```bash
node -e 'const d=new Date();console.log(d.toLocaleDateString("sv-SE"))'   # ngày hôm nay YYYY-MM-DD, tên file logwork
node -e 'console.log(new Date().toTimeString().slice(0,5))'                # giờ hiện tại HH:MM, để ghi phiên
```

`started` = giờ BẮT ĐẦU của phiên (không phải giờ hiện tại): ghép ngày của file logwork + `HH:MM` đã ghi của phiên, dạng `YYYY-MM-DDTHH:MM:00`, KHÔNG kèm múi giờ, ví dụ `2026-10-08T09:05:00`. Server hiểu chuỗi không có múi giờ là giờ máy (giờ địa phương).

Phiên kéo qua nửa đêm: dùng file của ngày bắt đầu làm việc (ví dụ vẫn là file hôm qua); đây là hạn chế đã biết.

## Bắt đầu task

1. Lấy key: từ tin nhắn, từ link `.../browse/KEY`, hoặc từ đối số `start KEY`.
2. Gọi `jira_get_issue` với `issueKey: KEY` để lấy summary và trạng thái. Lỗi (không thấy issue) thì báo người dùng và dừng.
3. HỎI xác nhận trước khi ghi logwork: "Đưa task {KEY} ({summary}) vào logwork không?". Nếu phần dự án của KEY (trước dấu `-`) khác `jiraProject` thì nói thêm trong cùng câu hỏi: "Task này thuộc dự án X, không phải dự án của repo ({jiraProject})." Người dùng từ chối thì dừng, không ghi gì vào `./logwork/`, vẫn làm task bình thường nếu được yêu cầu. Chỉ bỏ qua câu hỏi này khi người dùng gọi thẳng lệnh `/gem-jira:logwork start KEY` và KEY cùng dự án với repo.
4. Sau khi người dùng xác nhận, lấy giờ hiện tại (giờ bắt đầu phiên là lúc xác nhận). Đọc `./logwork/YYYY-MM-DD.md` của hôm nay (tạo nếu chưa có). Nếu đang có phiên mở (`HH:MM–…`) của task khác thì đóng phiên đó trước bằng giờ hiện tại, tính lại `(XhYm)`. Nếu task vừa đóng còn phiên chưa đánh dấu thì chạy ngay bước 2–5 của "Kết thúc task và đề xuất worklog" cho task đó (vẫn HỎI trước, không tự log).
5. Thêm mục `## KEY — {summary}` mới, hoặc thêm phiên mới vào mục đã có trong ngày, với giờ bắt đầu là giờ hiện tại. Trạng thái `in-progress`. Khi thêm phiên vào mục đã có: giữ nguyên mọi dấu `[worklog …]`/`[bỏ qua]` và các dòng `Đã làm`, chỉ nối thêm ` · HH:MM–…` và đặt dòng `Jira worklog:` thành `chờ xác nhận` (mục mới cũng ghi `chờ xác nhận`).
6. Thông báo ngắn đúng một dòng: `Logwork: bắt đầu {KEY} lúc {HH:MM}`.
7. Nếu bước 5 vừa tạo mục MỚI cho task trong ngày (không phải thêm phiên vào mục đã có) và task thuộc loại được đưa lên daily (Task, Sub-task, Bug, QA, Problem; không phải Backlog, theo `issuetype`/`status` lấy ở bước 2), HỎI: "Điền {KEY} lên daily meeting hôm nay không?". Đồng ý thì chạy skill `logdailymeeting` với đối số `{KEY}`; từ chối thì thôi, không hỏi lại cho task này trong ngày.

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

## Phong cách Agile

Mỗi dòng ngắn gọn, không ghi thao tác kỹ thuật vụn vặt. Phong cách viết theo kết quả đạt được áp dụng cho các dòng "Đã làm" (worklog comment) và các dòng "Vướng mắc".

Tốt:
- Hoàn thành API refresh token
- Đang review PR #12, còn phần xử lý lỗi
- Chốt phương án cache với team, bắt đầu triển khai

Không tốt:
- Sửa file auth.ts dòng 120, thêm if, chạy lại test
- ABC-123 (lặp lại tên task, không nói kết quả)
- Làm task hôm nay

## Tóm tắt luồng

- setup (lần đầu): hỏi mã dự án Jira -> kiểm tra bằng `jira_list_projects` -> lưu `jiraProject` vào `config.json`.
- start: `jira_get_issue` -> hỏi xác nhận đưa task vào logwork (kèm cảnh báo nếu khác dự án) -> (đồng ý) ghi phiên mới vào `./logwork/` -> `Logwork: bắt đầu {KEY} lúc {HH:MM}` -> (task mới trong ngày) hỏi điền daily -> skill `logdailymeeting`.
- stop: đóng phiên -> đề xuất worklog -> hỏi -> (đồng ý) `jira_add_worklog`.
