---
name: logdailymeeting
description: Điền daily meeting trên Confluence (A. Today Task / B. Problems) cho ngày hôm nay từ logwork cục bộ và task Jira đang làm. Dùng khi người dùng nói "điền daily", "fill daily", "log daily", "daily meeting", "daily standup", hoặc đồng ý đưa task Jira vừa nhận lên daily.
argument-hint: "[<ISSUE>]"
---

# Daily meeting (gem-jira)

Các tool trong skill này được gọi theo tên ngắn (`jira_search`, `confluence_search`, `confluence_fill_daily`). Tên đầy đủ trong Claude Code có tiền tố mcp, ví dụ `mcp__plugin_gem-jira_jira__confluence_fill_daily`; dùng đúng tool có hậu tố tương ứng.

Skill này đọc dữ liệu do skill `logwork` ghi trong `./logwork/` (định dạng file xem skill `logwork`, mục "File logwork"). Skill này không ghi phiên và không ghi worklog.

## Quy tắc an toàn (đọc trước)

- KHÔNG BAO GIỜ gọi `confluence_fill_daily` với `preview: false` khi người dùng chưa đồng ý rõ ràng trong lượt hội thoại hiện tại.
- Không tự thêm cột ngày hay hàng thành viên vào trang daily.
- Chỉ dùng `overwrite: true` khi người dùng đã đồng ý ghi đè ô đã có nội dung.
- Gặp lỗi tool thì báo nguyên văn cho người dùng, không tự thử vòng vo.

## Nội dung ô daily

Ô của bạn ở cột NGÀY HÔM NAY có hai mục:

- **A. Today Task:** các task sẽ làm và đang làm trong hôm nay.
- **B. Problems:** các vấn đề đang gặp trong ngày.

Task Jira được ghi bằng Jira issue macro, giống hệt khi dán URL issue vào trình soạn thảo Confluence (hiện thành ô "Jira | KEY" kèm trạng thái), không kèm summary. Ví dụ (dạng dễ đọc):

```
A. Today Task:
  1. https://pm.gem-corp.tech/browse/ABC-123
B. Problems:
  1. Chờ KH cấp tài khoản test SSO
```

Tool tự dựng macro từ `issueKey`, nên task Jira chỉ cần truyền `{ issueKey: KEY }`; không tự nhét URL hay macro vào `text`. Việc không có issue Jira thì truyền `{ text: <mô tả ngắn> }`.

## Cấu hình: `./logwork/config.json`

```json
{ "dailyPageUrl": "https://conf.gem-corp.tech/pages/viewpage.action?pageId=212026868", "dailyPageId": "212026868" }
```

Giữ nguyên các trường khác khi ghi file (ví dụ `jiraProject` của skill `logwork`).

## Lấy ngày

Luôn chạy lệnh, không đoán:

```bash
node -e 'const d=new Date();console.log(d.toLocaleDateString("sv-SE"))'   # hôm nay YYYY-MM-DD: cột daily và tên file logwork
```

## Điền daily

Chạy khi người dùng bảo điền daily, hoặc khi skill `logwork` vừa nhận task và người dùng đồng ý đưa task đó lên daily (khi đó KEY được truyền vào làm đối số).

1. `date` = hôm nay (lệnh ở "Lấy ngày").
2. Kiểm tra logwork cục bộ và lọc task:
   - Ứng viên = hợp của, khử trùng theo key: key của mọi task trong `./logwork/YYYY-MM-DD.md` hôm nay (lấy từ tiêu đề mục `## KEY — {summary}`), KEY được truyền vào (nếu có), và key người dùng tự nêu. KHÔNG tự kéo thêm task Jira đang mở hay In Progress của người dùng.
   - Không có file logwork hôm nay và không có key nào thì báo người dùng, hỏi có task nào muốn đưa lên không.
   - Gọi MỘT lần `jira_search` với `jql: key in (KEY1, KEY2, ...)` để lấy `summary`, `issuetype`, `status` của các ứng viên.
   - Chỉ giữ task có loại issue (`issuetype`, so không phân biệt hoa thường) là **Task**, **Sub-task** (kể cả tên `Subtask`, `Task-subtask`), **Bug**, **QA** hoặc **Problem**. Loại bỏ task có loại **Backlog** hoặc trạng thái **Backlog**, và mọi loại khác (Story, Epic…).
   - Báo ngắn một dòng các task bị loại và lý do, ví dụ `Không đưa lên daily: ABC-9 (Backlog), ABC-12 (Epic)`.
3. Form chọn task: dùng công cụ hỏi có lựa chọn của Claude Code (`AskUserQuestion`, `multiSelect: true`) để người dùng chọn task sẽ đưa lên daily.
   - Mỗi lựa chọn: `label` = KEY, `description` = `{summary} · {issuetype} · {status}`; KEY vừa được truyền vào thì thêm `(vừa nhận)` vào `description`.
   - Mỗi câu hỏi tối đa 4 lựa chọn: nhiều hơn 4 task thì chia thành nhiều câu hỏi trong cùng một lần hỏi (tối đa 4 câu, tức 16 task). Hơn 16 task thì liệt kê đánh số trong tin nhắn và hỏi người dùng gõ số.
   - Không còn task hợp lệ nào thì bỏ qua form, báo người dùng và hỏi có muốn điền chỉ mục B hoặc tự nêu việc khác không.
   - Người dùng có thể ghi thêm việc không có issue Jira qua ô nhập tự do ("Other"); đưa việc đó vào dưới dạng `{ text }`.
4. Dựng nội dung:
   - **today (mục A)** = các task người dùng đã chọn ở bước 3, theo thứ tự trong form. Task Jira là `{ issueKey }`, việc không có key là `{ text }`.
   - **problems (mục B)** = các dòng `Vướng mắc` khác rỗng trong file logwork hôm nay, cộng vấn đề người dùng nêu; mảng chuỗi.
5. `pageId`: lấy `dailyPageId` trong `config.json`. Chưa có thì hỏi người dùng link trang daily và trích số sau `pageId=` trong URL. Nếu người dùng chỉ đưa tên trang, gọi `confluence_search` với `cql: type=page AND title ~ "<tên>"`, cho người dùng chọn. Rồi ghi `dailyPageUrl` và `dailyPageId` vào `config.json`.
6. Gọi `confluence_fill_daily` với `{ pageId, date, today, problems, preview: true }` rồi hiện nội dung ô (`after`, dạng dễ đọc như ví dụ ở "Nội dung ô daily"; có thể ghi kèm summary bên cạnh mỗi issue trong lời nhắn để người dùng dễ nhận ra, nhưng summary không được ghi lên trang) và `row`, `date` cho người dùng xem. Người dùng muốn thêm, bớt task hay vấn đề thì sửa danh sách và gọi preview lại.
7. Xử lý lỗi (giữ nguyên văn thông báo của tool khi báo người dùng):
   - Lỗi `Trang daily không có cột cho ngày ...` (no-date): hỏi link trang daily mới, cập nhật `config.json`, gọi lại preview với `pageId` mới.
   - Lỗi `Không tìm thấy hàng của bạn ...` (no-row): báo người dùng nhờ người quản lý trang thêm hàng; dừng, không tự sửa trang.
   - Lỗi cấu trúc bảng (layout: ô gộp rowspan, hoặc cột ngày không rõ ràng): báo nguyên văn và dừng.
   - Lỗi `Ô ngày ... của bạn đã có nội dung` (already-filled): thường do đã điền trước đó trong ngày. Cho người dùng xem `before` cạnh danh sách mới, giữ lại trong danh sách mới các task và vấn đề có trong `before` mà người dùng muốn giữ, rồi hỏi có ghi đè không. Chỉ khi đồng ý mới gọi lại với `overwrite: true`.
8. Khi người dùng xác nhận nội dung: gọi lại cùng tham số với `preview: false` (thêm `overwrite: true` chỉ nếu đã được đồng ý ở bước 7). Báo `url` của trang và `version` trả về.

## Phong cách viết

Mục A: task Jira chỉ cần `issueKey`; việc không có key thì `text` ngắn gọn. Mục B viết theo vấn đề và ảnh hưởng, ngắn gọn, không ghi thao tác kỹ thuật vụn vặt.

Tốt:
- Chờ KH cấp tài khoản test SSO
- Môi trường staging lỗi DB, chưa deploy được

Không tốt:
- Lỗi
- Sửa file auth.ts dòng 120 nhưng test vẫn fail

## Tóm tắt luồng

đọc logwork hôm nay -> `jira_search` lọc loại issue (Task, Sub-task, Bug, QA, Problem; bỏ Backlog) -> form chọn task -> dựng A và B -> `confluence_fill_daily` preview cột hôm nay -> hỏi -> `preview: false`.
