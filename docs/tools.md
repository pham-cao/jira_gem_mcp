# Danh sách tool của jira-server-mcp

Tài liệu tham khảo cho 26 tool Jira, cùng 14 tool Confluence (xem [mục 9](#9-confluence)) khi đặt `CONFLUENCE_BASE_URL`. Thông thường bạn **không cần gọi tool trực tiếp**: chỉ cần mô tả yêu cầu bằng lời, Claude sẽ tự chọn tool và tham số. Tài liệu này giúp bạn biết MCP làm được gì, giới hạn ở đâu, và đọc hiểu kết quả.

Cài đặt và kết nối với client: xem [integration.md](integration.md).

## Mục lục

| Nhóm | Tool | Loại |
|---|---|---|
| [Tìm kiếm & đọc issue](#1-tìm-kiếm--đọc-issue) | [`jira_search`](#jira_search), [`jira_get_issue`](#jira_get_issue), [`jira_get_transitions`](#jira_get_transitions) | đọc |
| [Tạo & cập nhật issue](#2-tạo--cập-nhật-issue) | [`jira_create_issue`](#jira_create_issue), [`jira_update_issue`](#jira_update_issue), [`jira_assign_issue`](#jira_assign_issue), [`jira_transition_issue`](#jira_transition_issue) | ghi |
| [Comment](#3-comment) | [`jira_get_comments`](#jira_get_comments) | đọc |
| | [`jira_add_comment`](#jira_add_comment), [`jira_update_comment`](#jira_update_comment) | ghi |
| [Worklog](#4-worklog) | [`jira_get_worklogs`](#jira_get_worklogs) | đọc |
| | [`jira_add_worklog`](#jira_add_worklog) | ghi |
| [Liên kết issue](#5-liên-kết-issue) | [`jira_list_link_types`](#jira_list_link_types) | đọc |
| | [`jira_link_issues`](#jira_link_issues) | ghi |
| [File đính kèm](#6-file-đính-kèm) | [`jira_download_attachment`](#jira_download_attachment) | đọc Jira, ghi file local |
| | [`jira_upload_attachment`](#jira_upload_attachment) | ghi |
| [Metadata](#7-metadata) | [`jira_list_projects`](#jira_list_projects), [`jira_get_create_meta`](#jira_get_create_meta), [`jira_search_fields`](#jira_search_fields), [`jira_search_users`](#jira_search_users) | đọc |
| [Agile: board & sprint](#8-agile-board--sprint) | [`jira_list_boards`](#jira_list_boards), [`jira_list_sprints`](#jira_list_sprints), [`jira_get_sprint_issues`](#jira_get_sprint_issues) | đọc |
| | [`jira_move_issues_to_sprint`](#jira_move_issues_to_sprint), [`jira_create_sprint`](#jira_create_sprint), [`jira_update_sprint`](#jira_update_sprint) | ghi |
| [Confluence](#9-confluence) | [`confluence_search`](#confluence_search), [`confluence_get_page`](#confluence_get_page), [`confluence_get_page_children`](#confluence_get_page_children), [`confluence_list_spaces`](#confluence_list_spaces), [`confluence_get_comments`](#confluence_get_comments), [`confluence_get_labels`](#confluence_get_labels), [`confluence_list_attachments`](#confluence_list_attachments) | đọc |
| | [`confluence_download_attachment`](#confluence_download_attachment) | đọc Confluence, ghi file local |
| | [`confluence_create_page`](#confluence_create_page), [`confluence_update_page`](#confluence_update_page), [`confluence_add_comment`](#confluence_add_comment), [`confluence_add_labels`](#confluence_add_labels), [`confluence_upload_attachment`](#confluence_upload_attachment), [`confluence_fill_daily`](#confluence_fill_daily) | ghi |

- **Tool ghi** không xuất hiện khi bật `JIRA_READ_ONLY=true`. Khi đó còn 14 tool đọc.
- **Tool agile** chỉ xuất hiện khi Jira có Jira Software. Server tự kiểm tra lúc khởi động.
- **Tool Confluence** chỉ xuất hiện khi đặt `CONFLUENCE_BASE_URL`. Khi bật `JIRA_READ_ONLY=true`, còn thêm 8 tool đọc Confluence (kể cả `confluence_download_attachment`).
- **Không có tool xoá** (issue, comment, worklog, attachment, sprint, trang Confluence). Hãy xoá trên giao diện web.

## Quy ước chung

**Issue key**: không phân biệt hoa thường và bỏ khoảng trắng thừa. `" tdisgsai-1 "` được hiểu là `TDISGSAI-1`.

**User**: Jira Server định danh user bằng **username** (`name`), không phải email hay accountId. Dùng [`jira_search_users`](#jira_search_users) để tìm username. Trong kết quả, user được rút gọn thành:

```json
{ "name": "caopv", "displayName": "Phạm Văn Cao" }
```

**Định dạng văn bản**: description và comment dùng **wiki markup** của Jira, không phải Markdown:

| Hiển thị | Wiki markup |
|---|---|
| **đậm** | `*đậm*` |
| _nghiêng_ | `_nghiêng_` |
| `code` | `{{code}}` |
| khối code | `{code:java}…{code}` |
| link | `[tiêu đề\|https://…]` |
| danh sách | `* mục` / `# mục có số` |
| tiêu đề | `h2. Tiêu đề` |

**Phân trang**: tool trả danh sách có dạng:

```json
{ "items": [ … ], "total": 719, "startAt": 0, "maxResults": 20, "hasMore": true }
```

Muốn lấy trang tiếp, tăng `startAt` thêm `maxResults`. Một số API agile không trả tổng số, khi đó `total` là `null` và chỉ dựa vào `hasMore`.

**Rút gọn kết quả**: để tiết kiệm token, kết quả bỏ các trường kỹ thuật (`self`, `avatarUrls`, `expand`, `iconUrl`):
- status, priority, issuetype và resolution chỉ còn tên.
- Field dạng object (select list, version, component) chỉ còn `name`/`value`.
- Description và comment dài hơn 10.000 ký tự bị cắt, kèm đánh dấu `…[truncated]`.

**Lỗi**: tool trả thông báo tiếng Việt dễ hiểu (đánh dấu `isError`) để Claude tự sửa và thử lại. Ví dụ:

```
Yêu cầu không hợp lệ (400):
- customfield_10006: Number value expected
Gợi ý: dùng jira_get_create_meta hoặc jira_search_fields để kiểm tra field.
```

Bảng đầy đủ các thông báo lỗi: xem [integration.md › Xử lý sự cố](integration.md#10-xử-lý-sự-cố).

---

## 1. Tìm kiếm & đọc issue

### `jira_search`

Tìm issue bằng JQL. → `POST /rest/api/2/search`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `jql` | string | ✓ | | Câu truy vấn JQL |
| `fields` | string[] | | `summary, status, assignee, issuetype, priority, updated` | Danh sách field cần lấy (id). Field bạn yêu cầu luôn được trả về, ở dạng rút gọn |
| `maxResults` | integer | | 20 | 1–100 |
| `startAt` | integer | | 0 | Vị trí bắt đầu (phân trang) |

Kết quả:

```json
{
  "items": [
    {
      "key": "TDISGSAI-145",
      "url": "https://pm.gem-corp.tech/browse/TDISGSAI-145",
      "summary": "…",
      "status": "Backlog",
      "issuetype": "Task",
      "priority": "Medium",
      "assignee": { "name": "caopv", "displayName": "Phạm Văn Cao" },
      "updated": "2026-10-08T13:14:32.660+0700"
    }
  ],
  "total": 107, "startAt": 0, "maxResults": 20, "hasMore": true
}
```

JQL thường dùng:

| Mục đích | JQL |
|---|---|
| Việc của tôi chưa xong | `assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC` |
| Sprint đang chạy của project | `project = TDISGSAI AND sprint in openSprints()` |
| Bug mở tạo trong 7 ngày | `project = TDISGSAI AND issuetype = Bug AND created >= -7d AND statusCategory != Done` |
| Tìm theo nội dung | `project = TDISGSAI AND text ~ "dữ liệu train"` |
| Có label | `labels = data` |
| Cập nhật hôm nay | `updated >= startOfDay()` |

Ví dụ yêu cầu: *"Tìm các bug chưa đóng trong TDISGSAI tạo tuần này"*.

### `jira_get_issue`

Xem chi tiết một issue. → `GET /rest/api/2/issue/{key}`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueKey` | string | ✓ | Ví dụ `TDISGSAI-145` |
| `expand` | `("changelog" \| "renderedFields")[]` | | `changelog`: lịch sử thay đổi (50 mục gần nhất). `renderedFields`: description dạng HTML |

Kết quả gồm các trường sau (chỉ có khi issue có giá trị):

| Trường | Nội dung |
|---|---|
| `key`, `url`, `summary` | |
| `status`, `issuetype`, `priority`, `resolution` | tên |
| `assignee`, `reporter` | `{name, displayName}` |
| `description` | wiki markup |
| `labels`, `components`, `fixVersions` | mảng tên |
| `created`, `updated`, `duedate` | |
| `parent` | `{key, summary}` (với sub-task) |
| `subtasks` | `[{key, summary, status}]` |
| `issuelinks` | `[{type, direction, key, summary, status}]`. Ví dụ `type: "blocks", direction: "outward"` nghĩa là *issue này blocks issue kia* |
| `attachments` | `[{id, filename, size, mimeType}]`. Dùng `id` cho [`jira_download_attachment`](#jira_download_attachment) |
| `timetracking` | `{originalEstimate, remainingEstimate, timeSpent}` |
| `sprint` | `[{id, name, state}]` |
| `comments` | 10 comment **mới nhất**. `commentsTotal` cho biết tổng số. Xem hết bằng [`jira_get_comments`](#jira_get_comments) |
| `changelog` | (khi `expand: ["changelog"]`) `[{author, created, items: [{field, from, to}]}]` |
| `renderedDescription` | (khi `expand: ["renderedFields"]`) HTML |
| `customfield_*` | các custom field có giá trị, ở dạng rút gọn |

Ví dụ yêu cầu: *"Tóm tắt TDISGSAI-145"*, *"Ai chuyển TDISGSAI-145 sang Closed?"* (Claude sẽ dùng `expand: changelog`).

### `jira_get_transitions`

Liệt kê các bước chuyển trạng thái **hiện có** cho một issue. Chúng phụ thuộc vào workflow và trạng thái hiện tại. → `GET /rest/api/2/issue/{key}/transitions`

| Tham số | Kiểu | Bắt buộc |
|---|---|---|
| `issueKey` | string | ✓ |

```json
[
  { "id": "411", "name": "In Progress", "to": "In Progress" },
  { "id": "121", "name": "Done", "to": "Closed" }
]
```

Lưu ý: tên transition (`name`) có thể khác tên trạng thái đích (`to`). Ví dụ ở TDISGSAI, transition **Done** đưa issue về trạng thái **Closed**.

---

## 2. Tạo & cập nhật issue

### `jira_create_issue`

Tạo issue mới. → `POST /rest/api/2/issue`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `projectKey` | string | ✓ | Ví dụ `TDISGSAI` |
| `issueType` | string | ✓ | Tên loại issue: `Task`, `Bug`, `Story`, `Sub-task`… |
| `summary` | string | ✓ | Tiêu đề |
| `description` | string | | Wiki markup |
| `assignee` | string \| null | | Username |
| `priority` | string | | Tên priority, ví dụ `High` |
| `labels` | string[] | | |
| `parentKey` | string | | Issue cha. **Bắt buộc** với Sub-task / QA Sub-Task / Sprint bug |
| `customFields` | object | | Giá trị custom field theo id, gửi nguyên văn cho Jira |

Kết quả: `{ "key": "TDISGSAI-148", "url": "https://pm.gem-corp.tech/browse/TDISGSAI-148" }`

Cách truyền `customFields` phụ thuộc kiểu field:

| Kiểu field | Ví dụ |
|---|---|
| Số (Story Points) | `{"customfield_10006": 5}` |
| Text | `{"customfield_123": "nội dung"}` |
| Select list | `{"customfield_123": {"value": "Prod"}}` |
| Multi-select | `{"customfield_123": [{"value": "A"}, {"value": "B"}]}` |
| User picker | `{"customfield_123": {"name": "caopv"}}` |
| Ngày | `{"customfield_123": "2026-10-20"}` |
| Epic Link | `{"customfield_XXXXX": "TDISGSAI-10"}` |

Mẹo: một số loại issue có field bắt buộc riêng (ở TDISGSAI, **Bug** cần `customfield_12501` và `customfield_11500`; **Epic** cần `customfield_10003`). Claude nên chạy [`jira_get_create_meta`](#jira_get_create_meta) trước để biết.

Ví dụ yêu cầu: *"Tạo Task trong TDISGSAI 'Chuẩn hoá dữ liệu', assign cho tôi, 3 story points"*.

### `jira_update_issue`

Sửa field của issue. **Chỉ những field được truyền** mới thay đổi. → `PUT /rest/api/2/issue/{key}`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueKey` | string | ✓ | |
| `summary`, `description`, `assignee`, `priority`, `labels`, `parentKey`, `customFields` | | | Như [`jira_create_issue`](#jira_create_issue). Phải có ít nhất một field |

- `labels` **thay thế toàn bộ** danh sách label hiện có. Muốn thêm một label, Claude cần đọc label cũ trước.
- Kết quả: `{key, url}`.

### `jira_assign_issue`

Gán người xử lý. → `PUT /rest/api/2/issue/{key}/assignee`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueKey` | string | ✓ | |
| `assignee` | string \| null | ✓ | Username. Truyền `null` để bỏ gán |

Kết quả: `{ "ok": true }`

### `jira_transition_issue`

Chuyển trạng thái issue theo workflow. → `GET` rồi `POST /rest/api/2/issue/{key}/transitions`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueKey` | string | ✓ | |
| `transition` | string | ✓ | **ID hoặc tên** transition. Tên không phân biệt hoa thường: `"in progress"` khớp `In Progress` |
| `comment` | string | | Comment kèm theo |
| `resolution` | string | | Tên resolution, ví dụ `Done`, `Won't Do` |
| `fields` | object | | Field khác mà màn hình transition yêu cầu |

Kết quả: `{ "key": "TDISGSAI-146", "url": "…", "status": "Closed" }`

Nếu tên không khớp, tool báo lỗi kèm danh sách transition hợp lệ, và Claude có thể chọn lại:

```
Không có transition "Finish" cho TDISGSAI-146. Các transition hợp lệ: Done (121), Hold (201), In Progress (411), …
```

---

## 3. Comment

### `jira_get_comments`

Lấy comment của issue, cũ nhất trước. → `GET /rest/api/2/issue/{key}/comment`

| Tham số | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `issueKey` | string | ✓ | |
| `startAt` | integer | | 0 |
| `maxResults` | integer | | 50 (tối đa 100) |

Kết quả: phân trang với `items: [{id, author, body, created, updated}]`.

### `jira_add_comment`

Thêm comment. → `POST /rest/api/2/issue/{key}/comment`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueKey` | string | ✓ | |
| `body` | string | ✓ | Wiki markup. Mention người khác bằng `[~username]` |

Kết quả: `{ "id": "235619", "url": "https://pm.gem-corp.tech/browse/TDISGSAI-146?focusedCommentId=235619" }`

### `jira_update_comment`

Sửa nội dung một comment. Bạn cần có quyền sửa comment đó (thường là comment của chính mình). → `PUT /rest/api/2/issue/{key}/comment/{id}`

| Tham số | Kiểu | Bắt buộc |
|---|---|---|
| `issueKey` | string | ✓ |
| `commentId` | string | ✓ |
| `body` | string | ✓ |

Kết quả: `{ "id": "235619" }`

---

## 4. Worklog

### `jira_get_worklogs`

Lấy toàn bộ worklog của issue. → `GET /rest/api/2/issue/{key}/worklog`

| Tham số | Kiểu | Bắt buộc |
|---|---|---|
| `issueKey` | string | ✓ |

Kết quả: `items: [{id, author, timeSpent, timeSpentSeconds, started, comment}]`.

### `jira_add_worklog`

Log thời gian làm việc. → `POST /rest/api/2/issue/{key}/worklog`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueKey` | string | ✓ | |
| `timeSpent` | string | ✓ | Định dạng Jira: `30m`, `2h`, `2h 30m`, `1d` (1d = số giờ/ngày cấu hình trên Jira, thường là 8h) |
| `started` | string | | Thời điểm bắt đầu, ISO-8601, ví dụ `2026-10-08T09:00:00+07:00`. Mặc định là **bây giờ**. Không ghi múi giờ thì hiểu theo giờ máy bạn |
| `comment` | string | | Ghi chú |
| `adjustEstimate` | `auto` \| `leave` \| `new` \| `manual` | | Cách cập nhật Remaining Estimate. Mặc định của Jira là `auto` (trừ đi timeSpent) |
| `newEstimate` | string | khi `adjustEstimate=new` | Remaining Estimate mới, ví dụ `1d` |
| `reduceBy` | string | khi `adjustEstimate=manual` | Lượng giảm, ví dụ `2h` |

Kết quả: `{ "id": "…", "timeSpent": "2h 30m", "started": "2026-10-08T09:00:00.000+0700" }`

Ví dụ yêu cầu: *"Log 2h30m vào TDISGSAI-145 lúc 9h sáng nay, ghi chú 'review dataset'"*.

---

## 5. Liên kết issue

### `jira_list_link_types`

Liệt kê các loại liên kết. → `GET /rest/api/2/issueLinkType`

```json
[{ "id": "10000", "name": "Blocks", "inward": "is blocked by", "outward": "blocks" }]
```

### `jira_link_issues`

Liên kết hai issue. → `POST /rest/api/2/issueLink`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `type` | string | ✓ | Tên loại link (`name` từ [`jira_list_link_types`](#jira_list_link_types)), ví dụ `Blocks`, `Relates`, `Duplicate` |
| `inwardIssue` | string | ✓ | Xem chiều bên dưới |
| `outwardIssue` | string | ✓ | Xem chiều bên dưới |
| `comment` | string | | Comment thêm vào issue |

> ⚠️ **Chiều liên kết trên Jira 8.5 ngược với trực giác.** `inwardIssue` nhận động từ *outward*. Với `type: "Blocks", inwardIssue: "A", outwardIssue: "B"`, kết quả là **A blocks B** (B is blocked by A). Điều này đã được kiểm tra trên `pm.gem-corp.tech`.

Kết quả: `{ "ok": true }`

---

## 6. File đính kèm

### `jira_upload_attachment`

Đính kèm một file trên máy bạn vào issue. → `POST /rest/api/2/issue/{key}/attachments`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `issueKey` | string | ✓ | |
| `filePath` | string | ✓ | Đường dẫn file trên máy chạy MCP. Nên dùng đường dẫn tuyệt đối |

- Giới hạn **10MB** mỗi file. Tên file có dấu tiếng Việt vẫn giữ nguyên.
- Kết quả: `[{ "id": "203102", "filename": "report.txt", "size": 18 }]`

### `jira_download_attachment`

Tải file đính kèm về máy. → `GET /rest/api/2/attachment/{id}` rồi tải nội dung

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `attachmentId` | string | ✓ | | Lấy từ `attachments[].id` của [`jira_get_issue`](#jira_get_issue) |
| `destPath` | string | ✓ | | File đích, hoặc **thư mục đã tồn tại** (khi đó giữ tên file gốc). Thư mục cha chưa có sẽ được tạo |
| `overwrite` | boolean | | `false` | Mặc định không ghi đè file đã có |

- Kết quả: `{ "path": "/home/caopv/Downloads/report.txt", "size": 18, "mimeType": "text/plain" }`
- Vì lý do bảo mật, tool từ chối tải nếu URL file nằm ở host khác `JIRA_BASE_URL`, để không gửi mật khẩu ra ngoài.
- Tool này có trong chế độ chỉ đọc (vì chỉ đọc từ Jira), nhưng vẫn **ghi file ra máy bạn**. Vì vậy client sẽ hỏi xác nhận trước khi chạy.

---

## 7. Metadata

### `jira_list_projects`

Liệt kê các project bạn xem được. → `GET /rest/api/2/project`. Không có tham số.

```json
[{ "id": "12345", "key": "TDISGSAI", "name": "…" }]
```

### `jira_get_create_meta`

Xem loại issue và field (bắt buộc hay không, giá trị hợp lệ) khi tạo issue trong một project. → `GET /rest/api/2/issue/createmeta`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `projectKey` | string | ✓ | |
| `issueType` | string | | Lọc theo tên loại issue. Nên dùng, vì toàn bộ project có thể rất dài |

```json
[{
  "issueType": "Bug",
  "fields": [
    { "id": "summary", "name": "Summary", "required": true },
    { "id": "priority", "name": "Priority", "required": false, "allowedValues": ["Highest", "High", "Medium", "Low"] },
    { "id": "customfield_12501", "name": "…", "required": true, "allowedValues": ["…"] }
  ]
}]
```

`allowedValues` được giới hạn 50 giá trị đầu.

### `jira_search_fields`

Tra id của field theo tên, ví dụ "Story Points" → `customfield_10006`. → `GET /rest/api/2/field` (cache trong phiên)

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `query` | string | | Lọc theo tên hoặc id, không phân biệt hoa thường. Bỏ trống để lấy tất cả |

```json
[{ "id": "customfield_10006", "name": "Story Points", "custom": true, "type": "number" }]
```

Một số field hay dùng trên `pm.gem-corp.tech`: **Sprint** = `customfield_10000`, **Story Points** = `customfield_10006`.

### `jira_search_users`

Tìm user theo username, tên hiển thị hoặc email. → `GET /rest/api/2/user/search`

| Tham số | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `query` | string | ✓ | |
| `maxResults` | integer | | 20 (tối đa 100) |

```json
[{ "name": "caopv", "displayName": "Phạm Văn Cao", "emailAddress": "caopv@…", "active": true }]
```

Dùng `name` cho `assignee` và các field kiểu user.

---

## 8. Agile: board & sprint

Các tool này dùng `/rest/agile/1.0` và chỉ có khi Jira cài Jira Software. ID của board và sprint là **số**.

### `jira_list_boards`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `projectKey` | string | | | Lọc theo project |
| `name` | string | | | Lọc theo tên board (chứa chuỗi) |
| `type` | `scrum` \| `kanban` | | | |
| `startAt` | integer | | 0 | |
| `maxResults` | integer | | 50 | tối đa 100 |

```json
{ "items": [{ "id": 3306, "name": "Main Board", "type": "scrum" }], "total": null, "startAt": 0, "maxResults": 50, "hasMore": false }
```

### `jira_list_sprints`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `boardId` | integer | ✓ | | |
| `state` | string | | `active,future` | Ghép bằng dấu phẩy các giá trị `future`, `active`, `closed` |
| `startAt` | integer | | 0 | |
| `maxResults` | integer | | 50 | tối đa 100 |

Kết quả: `items: [{id, name, state, startDate, endDate, goal, boardId}]`.

### `jira_get_sprint_issues`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `sprintId` | integer | ✓ | | |
| `jql` | string | | | Lọc thêm, ví dụ `assignee = currentUser()` |
| `startAt` | integer | | 0 | |
| `maxResults` | integer | | 20 | tối đa 100 |

Kết quả: phân trang các issue rút gọn, giống [`jira_search`](#jira_search).

### `jira_move_issues_to_sprint`

Đưa issue vào sprint. Issue sẽ được chuyển khỏi sprint cũ nếu có.

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `sprintId` | integer | ✓ | Sprint đích (active hoặc future) |
| `issueKeys` | string[] | ✓ | 1–50 issue key |

Kết quả: `{ "ok": true }`. Muốn đưa issue về backlog, hãy làm trên giao diện board.

### `jira_create_sprint`

Tạo sprint mới (trạng thái `future`) trên board.

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `boardId` | integer | ✓ | |
| `name` | string | ✓ | |
| `startDate`, `endDate` | string | | ISO-8601, ví dụ `2026-10-20T09:00:00+07:00` |
| `goal` | string | | |

Kết quả: `{id, name, state, startDate, endDate, goal, boardId}`.

### `jira_update_sprint`

Sửa sprint, hoặc start/close sprint. Chỉ gửi những thuộc tính được truyền.

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `sprintId` | integer | ✓ | |
| `name` | string | | |
| `state` | `active` \| `closed` | | `active` = **start sprint** (cần có `startDate` và `endDate`). `closed` = **complete sprint** |
| `startDate`, `endDate` | string | | ISO-8601 |
| `goal` | string | | |

> ⚠️ Khi close sprint qua API, Jira **không** hỏi chuyển issue chưa xong đi đâu như trên giao diện. Nên complete sprint trên web nếu sprint còn issue dở dang.

---

## 9. Confluence

Chỉ có khi đặt `CONFLUENCE_BASE_URL`. Dùng chung tài khoản Jira, trừ khi đặt `CONFLUENCE_USERNAME`/`CONFLUENCE_PASSWORD`.

**Quy ước:**
- `pageId`, `parentId`, `parentCommentId` phải là chuỗi số (vd `"208764902"`). `attachmentId` nhận đúng id Confluence trả về (vd `"att208765001"`) hoặc chỉ phần số.
- Body trang và comment mặc định là **Markdown** (`format: "markdown"`), server tự chuyển sang storage XHTML khi ghi và ngược lại khi đọc. `format: "storage"` dùng XHTML thô của Confluence (cần khi muốn macro). HTML thô trong Markdown bị escape.
- Danh sách trả dạng `{ "items": [ … ], "start": 0, "limit": 25, "size": 25, "total": 120, "hasMore": true }`. Muốn lấy trang tiếp, tăng `start` thêm `limit`. `total` vắng nếu Confluence không trả.
- Tham số phân trang chung: `limit` (mặc định 25, 1–100), `start` (mặc định 0).
- Lỗi 409 và xung đột `version` trả thông báo tiếng Việt hướng dẫn đọc lại trang, xem [integration.md › Xử lý sự cố](integration.md#10-xử-lý-sự-cố).

### Đọc

### `confluence_search`

Tìm nội dung bằng CQL. → `GET /rest/api/content/search`

| Tham số | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `cql` | string | ✓ | |
| `limit` | integer | | 25 (tối đa 100) |
| `start` | integer | | 0 |

Ví dụ: `{ "cql": "type = page AND space = DEV AND text ~ \"deploy\" ORDER BY lastmodified DESC", "limit": 10 }`

Kết quả: phân trang với `items: [{id, type, title, space, version, lastModified, url}]`.

### `confluence_get_page`

Đọc một trang theo `pageId`, hoặc theo `spaceKey` + `title`. → `GET /rest/api/content/{id}` (hoặc `GET /rest/api/content?spaceKey=&title=`)

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `pageId` | string | | | Dùng cái này, hoặc cặp `spaceKey` + `title` |
| `spaceKey` | string | | | |
| `title` | string | | | Tiêu đề chính xác |
| `format` | `markdown` \| `storage` | | `markdown` | Định dạng body trả về |
| `maxChars` | integer | | 50000 | Body dài hơn bị cắt |

Ví dụ: `{ "pageId": "208764902", "maxChars": 2000 }`

Kết quả: `{ id, type, title, space, version, lastModified, url, ancestors: [{id, title}], body, truncated }`. Khi bị cắt có thêm `totalChars` và `warning`: không dùng body đã cắt để ghi lại trang (sẽ mất phần bị cắt). Giữ lại `version` nếu định sửa trang.

### `confluence_get_page_children`

Liệt kê trang con trực tiếp. → `GET /rest/api/content/{id}/child/page`

| Tham số | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `pageId` | string | ✓ | |
| `limit` | integer | | 25 (tối đa 100) |
| `start` | integer | | 0 |

Ví dụ: `{ "pageId": "208764902" }`. Kết quả cùng dạng `confluence_search`.

### `confluence_list_spaces`

Liệt kê space. → `GET /rest/api/space`

| Tham số | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `type` | `global` \| `personal` | | tất cả |
| `limit` | integer | | 25 (tối đa 100) |
| `start` | integer | | 0 |

Ví dụ: `{ "type": "global", "limit": 5 }`. Kết quả: phân trang với `items: [{key, name, type, url}]`.

### `confluence_get_comments`

Lấy comment của trang (mọi cấp), body đã chuyển sang Markdown. Comment trả lời có `parentId`. → `GET /rest/api/content/{id}/child/comment`

| Tham số | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `pageId` | string | ✓ | |
| `limit` | integer | | 25 (tối đa 100) |
| `start` | integer | | 0 |

Ví dụ: `{ "pageId": "208764902" }`. Kết quả: phân trang với `items: [{id, author, created, parentId, body}]`.

### `confluence_get_labels`

Liệt kê label của trang. → `GET /rest/api/content/{id}/label`

| Tham số | Kiểu | Bắt buộc |
|---|---|---|
| `pageId` | string | ✓ |

Ví dụ: `{ "pageId": "208764902" }`. Kết quả: `[{ "name": "release", "prefix": "global" }]`

### `confluence_list_attachments`

Liệt kê file đính kèm của trang. → `GET /rest/api/content/{id}/child/attachment`

| Tham số | Kiểu | Bắt buộc | Mặc định |
|---|---|---|---|
| `pageId` | string | ✓ | |
| `limit` | integer | | 25 (tối đa 100) |
| `start` | integer | | 0 |

Kết quả: phân trang với `items: [{id, title, mediaType, fileSize, version}]`, `id` dạng `"att208765001"`. Dùng nguyên `id` cho `confluence_download_attachment`.

### `confluence_download_attachment`

Tải file đính kèm về máy. → `GET /rest/api/content/{id}` rồi tải theo `_links.download`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `attachmentId` | string | ✓ | | Lấy từ `items[].id` của [`confluence_list_attachments`](#confluence_list_attachments), vd `"att208765001"` (hoặc `"208765001"`) |
| `destPath` | string | ✓ | | Đường dẫn tuyệt đối của file đích, hoặc thư mục (khi đó dùng title của attachment làm tên file) |
| `overwrite` | boolean | | `false` | Mặc định không ghi đè file đã có |

Ví dụ: `{ "attachmentId": "att208765001", "destPath": "/home/caopv/Downloads/" }`

- Cùng quy tắc với [`jira_download_attachment`](#jira_download_attachment): từ chối tải nếu URL ở host khác `CONFLUENCE_BASE_URL`, để không gửi mật khẩu ra ngoài.
- Có trong chế độ chỉ đọc (chỉ đọc từ Confluence) nhưng vẫn **ghi file ra máy bạn**, nên client sẽ hỏi xác nhận. Đọc kỹ `destPath` trước khi duyệt.

### Ghi

Các tool dưới đây **không** xuất hiện khi `JIRA_READ_ONLY=true`.

### `confluence_create_page`

Tạo trang. → `POST /rest/api/content`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `spaceKey` | string | ✓ | | |
| `title` | string | ✓ | | |
| `body` | string | ✓ | | Markdown, hoặc XHTML nếu `format: "storage"` |
| `parentId` | string | | | Trang cha. Bỏ trống thì tạo ở gốc space |
| `format` | `markdown` \| `storage` | | `markdown` | |

Ví dụ: `{ "spaceKey": "DEV", "title": "Biên bản họp 08/10", "parentId": "12345", "body": "## Action item\n\n| Việc | Người |\n|---|---|\n| Deploy | An |" }`

Kết quả: `{ "id": "208770001", "title": "Biên bản họp 08/10", "version": 1, "url": "https://conf.gem-corp.tech/pages/viewpage.action?pageId=208770001" }`

### `confluence_update_page`

Sửa body và/hoặc tiêu đề. → `GET /rest/api/content/{id}` rồi `PUT /rest/api/content/{id}`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `pageId` | string | ✓ | | |
| `body` | string | | | Nội dung mới (thay toàn bộ body). Bỏ trống thì giữ body cũ |
| `title` | string | | | Bỏ trống thì giữ tiêu đề cũ |
| `version` | integer | | | Version bạn đã đọc. Nếu khác version hiện tại, tool báo lỗi xung đột và **không ghi** |
| `format` | `markdown` \| `storage` | | `markdown` | |
| `minorEdit` | boolean | | `false` | Đánh dấu là sửa nhỏ |
| `allowLossyMarkdown` | boolean | | `false` | Cho phép ghi đè bằng Markdown dù trang hiện tại có nội dung Markdown không giữ được |

Phải có ít nhất `body` hoặc `title`. Ví dụ: `{ "pageId": "208770001", "version": 3, "body": "Nội dung mới" }`

Kết quả: `{ id, title, version, url }` với `version` đã tăng.

> ⚠️ `body` thay toàn bộ nội dung trang. Markdown không giữ được macro (trừ code/noformat), ảnh, link tới trang khác, mention, gộp ô hay style của bảng. Nếu trang hiện tại có các phần này, ghi bằng Markdown sẽ bị **từ chối** (không ghi gì) trừ khi truyền `allowLossyMarkdown: true`. Cách đúng: đọc bằng `format: "storage"` rồi ghi lại bằng `format: "storage"`. Không ghi lại body đọc được với `truncated: true`.
>
> Sửa được cả blog post (tìm qua CQL): tool giữ nguyên `type` hiện có của nội dung.

### `confluence_add_comment`

Thêm comment vào trang. → `POST /rest/api/content` (`type: comment`)

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageId` | string | ✓ | |
| `body` | string | ✓ | Markdown |
| `parentCommentId` | string | | Có thì trả lời comment đó |

Ví dụ: `{ "pageId": "208764902", "body": "Đã cập nhật theo góp ý." }`. Kết quả: `{id, author, created, parentId, body}` của comment vừa tạo.

### `confluence_add_labels`

Thêm label (prefix `global`) vào trang. → `POST /rest/api/content/{id}/label`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageId` | string | ✓ | |
| `labels` | string[] | ✓ | Ít nhất 1 label |

Ví dụ: `{ "pageId": "208764902", "labels": ["release", "q4"] }`. Kết quả: danh sách `{name, prefix}` do Confluence trả về.

### `confluence_upload_attachment`

Đính kèm file trên máy bạn vào trang. → `POST /rest/api/content/{id}/child/attachment`

| Tham số | Kiểu | Bắt buộc | Mô tả |
|---|---|---|---|
| `pageId` | string | ✓ | |
| `filePath` | string | ✓ | Đường dẫn tuyệt đối của file trên máy chạy MCP |
| `comment` | string | | Ghi chú cho attachment |

Ví dụ: `{ "pageId": "208764902", "filePath": "/home/caopv/report.pdf", "comment": "Báo cáo Q4" }`

- Giới hạn **10MB** mỗi file.
- Kết quả: `{id, title, mediaType, fileSize, version}` của attachment.
- Tool đọc file local bất kỳ: đọc kỹ `filePath` trước khi duyệt.

### `confluence_fill_daily`

Điền ô của **chính bạn** cho một ngày trong trang daily meeting của team (các mục A. Yesterday Task / B. Today Task / C. Problems). Tool đọc trang, tìm cột ngày và hàng của bạn (nhận diện theo user key), chỉ thay nội dung đúng ô đó. → `GET` + `PUT /rest/api/content/{id}`

| Tham số | Kiểu | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|---|
| `pageId` | string | ✓ | | Trang daily (chuỗi số) |
| `date` | string | ✓ | | Ngày của cột, dạng `YYYY-MM-DD` |
| `yesterday` | `{text, issueKey?}[]` | | `[]` | Mục A. `issueKey` (nếu có) hiển thị thành link tới issue Jira |
| `today` | `{text, issueKey?}[]` | | `[]` | Mục B, cùng dạng với `yesterday` |
| `problems` | string[] | | `[]` | Mục C |
| `preview` | boolean | | `true` | `true`: chỉ xem trước, **không ghi**. `false`: ghi lên trang |
| `overwrite` | boolean | | `false` | Cho phép ghi đè ô đã có nội dung |

Quy trình dùng: gọi với `preview: true`, đọc `before`/`after`, và chỉ gọi lại với `preview: false` khi người dùng đã xác nhận.

Ví dụ: `{ "pageId": "212026868", "date": "2026-10-09", "today": [{ "text": "Làm API refresh token", "issueKey": "ABC-123" }], "preview": true }`

Kết quả: `{preview, date, row, before, after, version, url}`
- `row`: nhãn hàng của bạn trên trang; `before`/`after`: nội dung ô (storage XHTML) trước và sau khi điền; `version`: version hiện tại của trang (khi `preview: false` là version mới sau khi ghi); `url`: link trang.
- Mục A và B rỗng được điền dấu `—`; mục C rỗng chỉ có tiêu đề.
- Nếu trang bị người khác sửa giữa lúc đọc và ghi (409), tool đọc lại và làm lại một lần, kể cả bước kiểm tra ghi đè.

Các lỗi:

| Tình huống | Thông báo |
|---|---|
| Không có cột cho `date` | `Trang daily không có cột cho ngày <date>. Các ngày hiện có: …. Có thể đã sang sprint/tuần mới — hãy cung cấp link trang daily mới.` |
| Không có hàng của bạn | `Không tìm thấy hàng của bạn (userKey …) trong bảng daily. Hãy nhờ người quản lý trang thêm bạn vào bảng.` |
| Bảng có ô gộp nhiều hàng | `Bảng daily có ô gộp nhiều hàng (rowspan) nên không xác định chắc chắn được ô cần điền. Hãy điền thủ công trên Confluence.` |
| Ô đã có nội dung, `overwrite: false` | `Ô ngày <date> của bạn đã có nội dung. Xem "before" và gọi lại với overwrite: true nếu muốn ghi đè.` kèm nội dung hiện tại |

- Tool không tự thêm cột ngày hoặc hàng thành viên vào trang.

---

## Phụ lục: tham chiếu nhanh REST endpoint

| Tool | Method | Endpoint |
|---|---|---|
| `jira_search` | POST | `/rest/api/2/search` |
| `jira_get_issue` | GET | `/rest/api/2/issue/{key}` |
| `jira_get_transitions` | GET | `/rest/api/2/issue/{key}/transitions` |
| `jira_create_issue` | POST | `/rest/api/2/issue` |
| `jira_update_issue` | PUT | `/rest/api/2/issue/{key}` |
| `jira_assign_issue` | PUT | `/rest/api/2/issue/{key}/assignee` |
| `jira_transition_issue` | POST | `/rest/api/2/issue/{key}/transitions` |
| `jira_get_comments` | GET | `/rest/api/2/issue/{key}/comment` |
| `jira_add_comment` | POST | `/rest/api/2/issue/{key}/comment` |
| `jira_update_comment` | PUT | `/rest/api/2/issue/{key}/comment/{id}` |
| `jira_get_worklogs` | GET | `/rest/api/2/issue/{key}/worklog` |
| `jira_add_worklog` | POST | `/rest/api/2/issue/{key}/worklog` |
| `jira_list_link_types` | GET | `/rest/api/2/issueLinkType` |
| `jira_link_issues` | POST | `/rest/api/2/issueLink` |
| `jira_upload_attachment` | POST | `/rest/api/2/issue/{key}/attachments` |
| `jira_download_attachment` | GET | `/rest/api/2/attachment/{id}` + URL nội dung |
| `jira_list_projects` | GET | `/rest/api/2/project` |
| `jira_get_create_meta` | GET | `/rest/api/2/issue/createmeta` |
| `jira_search_fields` | GET | `/rest/api/2/field` |
| `jira_search_users` | GET | `/rest/api/2/user/search` |
| `jira_list_boards` | GET | `/rest/agile/1.0/board` |
| `jira_list_sprints` | GET | `/rest/agile/1.0/board/{id}/sprint` |
| `jira_get_sprint_issues` | GET | `/rest/agile/1.0/sprint/{id}/issue` |
| `jira_move_issues_to_sprint` | POST | `/rest/agile/1.0/sprint/{id}/issue` |
| `jira_create_sprint` | POST | `/rest/agile/1.0/sprint` |
| `jira_update_sprint` | POST | `/rest/agile/1.0/sprint/{id}` |
| `confluence_search` | GET | `/rest/api/content/search` |
| `confluence_get_page` | GET | `/rest/api/content/{id}` hoặc `/rest/api/content?spaceKey=&title=` |
| `confluence_get_page_children` | GET | `/rest/api/content/{id}/child/page` |
| `confluence_list_spaces` | GET | `/rest/api/space` |
| `confluence_get_comments` | GET | `/rest/api/content/{id}/child/comment` |
| `confluence_get_labels` | GET | `/rest/api/content/{id}/label` |
| `confluence_list_attachments` | GET | `/rest/api/content/{id}/child/attachment` |
| `confluence_download_attachment` | GET | `/rest/api/content/{id}` + `_links.download` |
| `confluence_create_page` | POST | `/rest/api/content` |
| `confluence_update_page` | GET + PUT | `/rest/api/content/{id}` |
| `confluence_add_comment` | POST | `/rest/api/content` (`type: comment`) |
| `confluence_add_labels` | POST | `/rest/api/content/{id}/label` |
| `confluence_upload_attachment` | POST | `/rest/api/content/{id}/child/attachment` |
| `confluence_fill_daily` | GET + PUT | `/rest/api/content/{id}` (và `/rest/api/user/current`) |
