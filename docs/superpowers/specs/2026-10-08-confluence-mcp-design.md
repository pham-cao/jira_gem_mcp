# Confluence trong jira-server-mcp — Design Spec

- **Ngày:** 2026-10-08
- **Trạng thái:** Chờ review
- **Mục tiêu:** Thêm các tool Confluence vào MCP server hiện có, để Claude tìm, đọc, tạo, sửa trang, comment, label và attachment trên Confluence nội bộ của GEM, dùng chung tài khoản với Jira.

## 1. Bối cảnh & ràng buộc

| Mục | Giá trị |
|---|---|
| Confluence | Confluence Server **6.11.0**, `https://conf.gem-corp.tech` |
| Xác thực | Basic Auth, cùng username/password với Jira (PAT không có ở 6.11) |
| REST API | `/rest/api` (content, space, search CQL, label, attachment) |
| Truy cập ẩn danh | `GET /rest/api/space` trả 200 khi không đăng nhập → phải kiểm tra user không phải anonymous |
| Đóng gói | Cùng process, cùng repo, cùng mục `.mcp.json` với Jira |
| Định dạng nội dung | Claude đọc/viết **Markdown**; server chuyển đổi ↔ storage XHTML. Vẫn cho phép storage thô |

Quyết định đã chốt:
- Confluence là tuỳ chọn: chỉ bật khi có `CONFLUENCE_BASE_URL`. Jira vẫn bắt buộc (không có chế độ chỉ Confluence).
- Không có tool xoá, di chuyển trang, phân quyền hay blog post (blog post vẫn tìm được qua CQL).

## 2. Kiến trúc

```
src/
  http/
    client.ts        HttpClient: auth Basic, GET retry, timeout, giải thích body không phải JSON, getBinary (chặn khác origin)
    errors.ts        HttpError (service: "Jira" | "Confluence"), parse lỗi cả 2 dạng, formatError
  jira/
    client.ts        JiraClient = HttpClient với service "Jira" (giữ API cũ)
    errors.ts        giữ JiraError làm alias/subclass của HttpError để code & test cũ không đổi
  confluence/
    convert.ts       markdownToStorage, storageToMarkdown
    format.ts        slimPage, slimSpace, slimComment, slimAttachment, pageUrl
  tools/
    define.ts        ToolContext có thêm `confluence?: HttpClient`
    confluence/
      pages.ts       search, get_page, get_page_children, list_spaces, create_page, update_page
      comments.ts    get_comments, add_comment
      labels.ts      get_labels, add_labels
      attachments.ts list_attachments, download_attachment, upload_attachment
  server.ts          startupChecks kiểm tra thêm Confluence; createServer đăng ký nhóm confluence nếu có client
  index.ts           tạo HttpClient Confluence khi có cấu hình; log "confluence: on|off"
```

Nguyên tắc refactor: tách phần dùng chung ra `src/http/` nhưng **không đổi hành vi Jira**; toàn bộ test Jira hiện có phải pass mà không sửa nội dung kiểm tra (chỉ được sửa import nếu bắt buộc).

Logic tải attachment (kiểm tra origin, `basename`, không ghi đè nếu thiếu `overwrite`, tạo file) được tách thành helper dùng chung cho cả Jira và Confluence.

## 3. Cấu hình

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `CONFLUENCE_BASE_URL` | | — | URL Confluence, vd `https://conf.gem-corp.tech`. Có → bật tool Confluence |
| `CONFLUENCE_USERNAME` | | `JIRA_USERNAME` | Chỉ cần khi khác tài khoản Jira |
| `CONFLUENCE_PASSWORD` | | `JIRA_PASSWORD` | Chỉ cần khi khác mật khẩu Jira |

`JIRA_READ_ONLY`, `JIRA_INSECURE_TLS`, `JIRA_TIMEOUT_MS` áp dụng cho cả Confluence (giữ tên để không phá cấu hình cũ).

`Config` có thêm `confluence?: { baseUrl; username; password }`. `CONFLUENCE_BASE_URL` được validate như `JIRA_BASE_URL` (http(s), bỏ `/` cuối). Đặt `CONFLUENCE_USERNAME`/`CONFLUENCE_PASSWORD` mà không có `CONFLUENCE_BASE_URL` → lỗi cấu hình.

## 4. Khởi động

1. Kiểm tra Jira như hiện tại.
2. Nếu có Confluence: `GET /rest/api/user/current`. Nếu lỗi, hoặc `type === "anonymous"` → thoát với thông báo "Đăng nhập Confluence thất bại (sai username/password hoặc tài khoản bị khoá/CAPTCHA)".
3. Log: `connected as <name>, agile tools: on|off, confluence: on|off, read-only: on|off`.

Confluence lỗi khi khởi động thì server **thoát** (không tự tắt Confluence một cách im lặng), giống cách Jira đang xử lý.

## 5. Danh sách tool

Tiền tố `confluence_`. ✎ = tool ghi, không đăng ký khi `JIRA_READ_ONLY=true`. Đường dẫn `…` = `/rest/api/content`.

### 5.1 Đọc

| Tool | API | Tham số / kết quả |
|---|---|---|
| `confluence_search` | `GET …/search?cql=&limit=&start=&expand=space,version` | `cql` (bắt buộc), `limit` (mặc định 25, tối đa 100), `start`. Trả `{ total, start, limit, results: [{ id, type, title, space, lastModified, url, excerpt? }] }` |
| `confluence_get_page` | `GET …/{id}?expand=body.storage,version,space,ancestors` hoặc `GET …?spaceKey=&title=&expand=…` | `pageId` **hoặc** (`spaceKey` + `title`); `format`: `markdown` (mặc định) \| `storage`; `maxChars` (mặc định 50000). Trả `{ id, title, space, version, url, ancestors: [{id,title}], body, truncated }` |
| `confluence_get_page_children` | `GET …/{id}/child/page` | `pageId`, `limit`, `start` |
| `confluence_list_spaces` | `GET /rest/api/space` | `type?` (`global` \| `personal`), `limit`, `start` |
| `confluence_get_comments` | `GET …/{id}/child/comment?expand=body.storage,version&depth=all` | `pageId`, `limit`, `start`. Body chuyển sang Markdown; có `parentId` nếu là trả lời |
| `confluence_get_labels` | `GET …/{id}/label` | `pageId` |
| `confluence_list_attachments` | `GET …/{id}/child/attachment` | `pageId`, `limit`, `start`. Trả id, title, mediaType, fileSize, version |
| `confluence_download_attachment` | `_links.download` (tương đối, ghép với base URL) | `attachmentId`, `destPath`, `overwrite?`. `readOnlyHint: false`. Cùng quy tắc với Jira (xem §2) |

### 5.2 Ghi ✎

| Tool | API | Ghi chú |
|---|---|---|
| `confluence_create_page` | `POST …` | `spaceKey`, `title`, `body`, `parentId?`, `format` (`markdown` \| `storage`). Trả `{ id, title, version, url }` |
| `confluence_update_page` | `GET …/{id}?expand=version` rồi `PUT …/{id}` | `pageId`, `body?`, `title?`, `version?`, `format`, `minorEdit?`. Phải có ít nhất `body` hoặc `title`. Gửi `version.number = current + 1`. Có `version` mà khác version hiện tại → lỗi xung đột, không gửi PUT. Thiếu `title` → giữ title cũ; thiếu `body` → giữ body cũ (lấy storage hiện tại) |
| `confluence_add_comment` | `POST …` (`type: comment`, `container: {id, type: page}`, `ancestors` khi trả lời) | `pageId`, `body` (Markdown), `parentCommentId?` |
| `confluence_add_labels` | `POST …/{id}/label` | `pageId`, `labels: string[]` (prefix `global`) |
| `confluence_upload_attachment` | `POST …/{id}/child/attachment` (multipart, `X-Atlassian-Token: no-check`) | `pageId`, `filePath`, `comment?` |

Tất cả id (`pageId`, `attachmentId`, `parentId`, `parentCommentId`) được validate là chuỗi số (`/^\d+$/`) trước khi ghép vào path.

URL trang = `baseUrl + _links.webui`.

## 6. Chuyển đổi định dạng (`src/confluence/convert.ts`)

Dependency mới: `marked`, `turndown`, `turndown-plugin-gfm` (thuần JS).

### 6.1 `markdownToStorage(md)`

- `marked` với GFM (bảng, gạch ngang, task list hiển thị như list thường).
- HTML thô trong Markdown bị escape thành text (không truyền qua) để tránh XHTML hỏng; muốn macro/HTML dùng `format: "storage"`.
- Hậu xử lý:
  - `<pre><code class="language-x">…</code></pre>` → `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">x</ac:parameter><ac:plain-text-body><![CDATA[…]]></ac:plain-text-body></ac:structured-macro>`. Nội dung code được unescape HTML entity; `]]>` tách thành `]]]]><![CDATA[>`.
  - Thẻ rỗng `<br>`, `<hr>`, `<img …>` → dạng tự đóng.

### 6.2 `storageToMarkdown(xhtml)`

`turndown` + plugin GFM, thêm rule:

| Storage | Markdown |
|---|---|
| macro `code` / `noformat` | khối ```` ```lang ```` |
| macro `info` / `note` / `warning` / `tip` | `> **Info:** …` (tên tương ứng) |
| macro `jira` | khoá issue (vd `ABC-123`) |
| `ac:link` → `ri:page` | `[tiêu đề trang]` |
| `ac:image` / `ri:attachment` | `![tên file]` |
| macro khác | `[macro: <tên>]` + nội dung rich-text-body nếu có |

Namespace `ac:`/`ri:` được xử lý bằng cách parse như HTML (tên thẻ giữ nguyên `ac:structured-macro`).

### 6.3 Cắt bớt

`confluence_get_page` cắt **sau khi** chuyển đổi, theo `maxChars`, và trả `truncated: true` kèm tổng độ dài.

## 7. Xử lý lỗi

- `HttpError` có thêm `service`; thông báo bắt đầu bằng tên dịch vụ (`Confluence 404 GET /rest/api/content/123`).
- Parse body lỗi cả 2 dạng: Jira (`errorMessages`, `errors`) và Confluence (`message`, `data.errors[].message.translation`).
- CAPTCHA: Jira dùng `X-Authentication-Denied-Reason`; Confluence dùng `X-Seraph-LoginReason: AUTHENTICATION_DENIED` → gợi ý "đăng nhập web một lần để mở khoá".
- Gợi ý riêng cho Confluence:
  - 404: không có trang hoặc không có quyền xem.
  - 409 (update): trang vừa bị sửa, hãy đọc lại để lấy version mới.
  - 400 (ghi): kèm message của Confluence; thường do storage XHTML không hợp lệ.
- Xung đột version phát hiện phía server (§5.2) trả lỗi cùng nội dung gợi ý như 409.

## 8. Kiểm thử

vitest + msw, theo cách repo đang làm. Không gọi Confluence thật trong `npm test`.

- `test/confluence-convert.test.ts`: code block (có/không language, chứa `]]>`), bảng, list lồng nhau, link, ảnh, HTML thô bị escape, tiếng Việt; storage → md với từng macro ở §6.2 và macro lạ; round-trip md → storage → md ổn định cho đoạn văn, heading, list, bảng, code.
- `test/confluence-pages.test.ts`, `-comments`, `-labels`, `-attachments`: path/query/body gửi đi; update tăng version, giữ title/body cũ, lỗi xung đột; id không phải số bị từ chối; download khác origin bị chặn; read-only ẩn tool ghi.
- `test/config.test.ts`: mặc định dùng lại tài khoản Jira; ghi đè bằng biến riêng; biến Confluence thiếu base URL → lỗi.
- `test/server.test.ts`: có/không `CONFLUENCE_BASE_URL`; startup lỗi khi user anonymous.
- `test/errors.test.ts`: parse lỗi dạng Confluence, CAPTCHA của Confluence.
- `scripts/smoke.ts`: nếu `.env` có `CONFLUENCE_BASE_URL`, gọi `confluence_list_spaces`, `confluence_search`, `confluence_get_page` (trang đầu tiên tìm được).

## 9. Tài liệu

- `README.md`: biến cấu hình mới, ví dụ `.mcp.json` có `CONFLUENCE_BASE_URL`, danh sách tool Confluence, cảnh báo bảo mật cho download/upload attachment Confluence.
- `docs/integration.md`: thêm biến vào các ví dụ client, prompt mẫu cho Confluence, mục xử lý sự cố (anonymous, CAPTCHA, 409).
- `docs/tools.md`: mục Confluence với tham số và ví dụ từng tool.

## 10. Tiêu chí hoàn thành

- `npm test` và `npm run build` pass; test Jira cũ không phải sửa nội dung kiểm tra.
- Không có `CONFLUENCE_BASE_URL` → danh sách tool và hành vi giống hệt bản hiện tại.
- `npm run smoke` với `conf.gem-corp.tech` thật: list spaces, search, đọc một trang thành công.
- Thử thủ công trên một space test: tạo trang bằng Markdown (có code block và bảng), sửa trang, comment, label, upload/download attachment.
