# Logwork & Daily — Plugin Design Spec

- **Ngày:** 2026-10-08
- **Trạng thái:** Chờ review
- **Mục tiêu:** Khi Claude làm task lấy từ Jira, tự ghi logwork (task, giờ bắt đầu và kết thúc, việc đã làm), đề xuất worklog Jira, và cuối ngày điền trang daily meeting trên Confluence theo mẫu Agile của team. Toàn bộ được đóng gói thành Claude Code plugin cùng MCP server hiện có.

## 1. Bối cảnh & quyết định đã chốt

| Mục | Quyết định |
|---|---|
| Phân phối | Repo trở thành Claude Code plugin `gem-jira` và đồng thời là marketplace `gem-tools` |
| Ghi trang daily | Tool MCP riêng `confluence_fill_daily` (thay ô một cách cố định, có test), không để model tự sửa XHTML |
| Logwork local | `./logwork/` trong repo đang làm việc |
| Worklog Jira | Có, nhưng **luôn hỏi người dùng trước** khi gọi `jira_add_worklog` |
| Điền daily | Chạy **cuối ngày**, điền vào ô của **ngày làm việc kế tiếp**. A = việc đã làm hôm nay, B = việc dở dang + issue In Progress, C = vướng mắc |

### Trang daily thực tế

Ví dụ: `https://conf.gem-corp.tech/pages/viewpage.action?pageId=212026868`, trang "Sprint 1 - Daily meetings (12/10 - 16/10)", space `HJAEP1`. Mỗi sprint có một trang, nội dung là một bảng:

- Hàng tiêu đề: `<th>` rỗng, `Role`, rồi mỗi cột một ngày dưới dạng `<th>…<time datetime="YYYY-MM-DD" />…</th>`.
- Hàng `Template`: cho thấy mẫu nội dung một ô:
  ```html
  <p><strong>A. <strong>Yesterday Task:</strong></strong></p><ol><li>Task Name (Link task Jira)</li>…</ol>
  <p><strong>B. Today Task:</strong></p><ol>…</ol>
  <p><strong>C. Problems:</strong></p>
  ```
- Mỗi thành viên một hàng: ô đầu chứa mention `<ac:link><ri:user ri:userkey="…" />…</ac:link>` (có thể bọc trong `<div class="content-wrapper"><p>`), ô thứ hai là role, sau đó là một ô cho mỗi ngày (ô trống là `<td colspan="1"><br /></td>`).
- `userKey` của người dùng lấy qua `GET /rest/api/user/current`, vd `caopv` có userKey `2c96808381c39bab0181cc0d4ad00000`.

## 2. Đóng gói plugin

```
jira_gem_mcp/
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── skills/logwork/SKILL.md
├── dist/                 ← được commit
└── src/, test/, docs/ …
```

### 2.1 `.claude-plugin/plugin.json`

- `name: "gem-jira"`, `version` bằng `package.json`, `description`, `repository`.
- `userConfig`:

| Key | type | Mặc định | sensitive | Ý nghĩa |
|---|---|---|---|---|
| `jira_base_url` | string | `https://pm.gem-corp.tech` | | URL Jira |
| `confluence_base_url` | string | `https://conf.gem-corp.tech` | | URL Confluence |
| `username` | string | — | | Username dùng chung cho Jira và Confluence |
| `password` | string | — | ✓ | Mật khẩu (lưu trong secure storage) |

### 2.2 MCP server (khai báo `mcpServers` ngay trong `plugin.json`)

Không dùng `.mcp.json` ở gốc repo: file đó cũng là cấu hình MCP cấp project cho ai mở Claude Code trong repo này, với `${CLAUDE_PLUGIN_ROOT}` không được thay.

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "${user_config.jira_base_url}",
        "CONFLUENCE_BASE_URL": "${user_config.confluence_base_url}",
        "JIRA_USERNAME": "${user_config.username}",
        "JIRA_PASSWORD": "${user_config.password}"
      }
    }
  }
}
```

Code server không cần đổi gì cho phần cấu hình.

### 2.3 `.claude-plugin/marketplace.json`

`{ "name": "gem-tools", "owner": { "name": "pham-cao" }, "plugins": [{ "name": "gem-jira", "source": ".", "description": … }] }`.

Cài đặt:
```
/plugin marketplace add pham-cao/jira_gem_mcp
/plugin install gem-jira@gem-tools
```

### 2.4 Build artefact

- Plugin cài từ git không chạy `prepare`/build, nhưng có tự cài `node_modules` dựa trên `package-lock.json` (lockfileVersion ≥ 2). Vì vậy **`dist/` được commit**: bỏ dòng `dist` khỏi `.gitignore`.
- Script `npm run release-check`: chạy `npm run build && npm test`, rồi `git diff --exit-code -- dist` để báo lỗi khi `dist/` lệch với source.
- `claude plugin validate .` phải pass.

### 2.5 Chuyển đổi trên máy đang dùng

Người đang cài MCP `jira` thủ công (`~/.claude.json`) cần gỡ (`claude mcp remove jira -s user`) sau khi cài plugin, để tránh tool trùng tên. README ghi rõ bước này. Cách cài thủ công (`npx`, `claude mcp add`) vẫn được giữ cho client khác.

## 3. Tool `confluence_fill_daily` ✎

File: `src/tools/confluence/daily.ts`. Logic thuần (không gọi HTTP) nằm ở `src/confluence/daily.ts`. Tool ghi: ẩn khi `JIRA_READ_ONLY=true`.

### 3.1 Input

| Tham số | Kiểu | Mặc định | Ghi chú |
|---|---|---|---|
| `pageId` | numericId | — | |
| `date` | `YYYY-MM-DD` | — | Ngày của cột cần điền |
| `yesterday` | `{ text: string; issueKey?: string }[]` | `[]` | Mục A |
| `today` | `{ text: string; issueKey?: string }[]` | `[]` | Mục B |
| `problems` | `string[]` | `[]` | Mục C |
| `preview` | boolean | `true` | `true` → không ghi, chỉ trả kết quả xem trước |
| `overwrite` | boolean | `false` | Ô đã có nội dung → từ chối, trừ khi `true` |

`issueKey` được validate bằng `/^[A-Z][A-Z0-9_]*-\d+$/` (sau khi trim và viết hoa).

### 3.2 Xử lý

1. `GET /rest/api/content/{pageId}?expand=body.storage,version` và `GET /rest/api/user/current`, lấy `userKey`.
2. Duyệt từng `<table>` theo thứ tự. Bảng đầu tiên có hàng chứa `<time datetime="{date}"` là bảng đích. Chỉ số cột được tính có cộng dồn `colspan`.
3. Hàng đích là hàng có ô đầu chứa `ri:userkey="{userKey}"`.
4. Sinh nội dung ô theo đúng mẫu của trang:
   ```html
   <p><strong>A. Yesterday Task:</strong></p><ol><li>{text} (<a href="{jira}/browse/{KEY}">{KEY}</a>)</li></ol>
   <p><strong>B. Today Task:</strong></p><ol>…</ol>
   <p><strong>C. Problems:</strong></p><ol><li>{problem}</li></ol>
   ```
   - Mục không có item: A/B ghi `<ol><li>—</li></ol>`, C bỏ danh sách (giống mẫu).
   - Thiếu `issueKey` thì không có phần link.
   - Mọi text được escape XML (`&`, `<`, `>`, `"`).
   - `{jira}` là `ctx.client.baseUrl` (JiraClient sẵn có).
5. Ô được coi là trống khi nội dung bên trong, sau khi bỏ thẻ, `<br />` và `&nbsp;`, chỉ còn khoảng trắng.
6. Chỉ thay **phần bên trong** thẻ `<td …>` đích; thẻ mở, các thuộc tính và phần còn lại của trang giữ nguyên **từng byte**. Việc tìm ô dùng bộ quét thẻ có đếm độ sâu `<table>`, nên bảng lồng trong ô không làm lệch hàng hay cột.
7. Ghi: `PUT /rest/api/content/{pageId}` với `{ id, type, title, version: { number: current + 1 }, body: { storage: { value, representation: "storage" } } }`. Gặp `HttpError` 409 thì đọc lại trang và làm lại từ bước 2 **một lần**.

### 3.3 Output

```json
{ "preview": true, "date": "2026-10-09", "row": "caopv", "before": "<br />", "after": "<p>…</p>", "url": "https://conf…/pages/viewpage.action?pageId=…", "version": 3 }
```

Khi `preview: false`, `version` là version mới sau khi ghi. `row` là `plain-text-link-body` của mention nếu có, nếu không thì là username.

### 3.4 Lỗi (copy cố định)

| Trường hợp | Thông báo |
|---|---|
| Không có cột ngày | `Trang daily không có cột cho ngày {date}. Các ngày hiện có: {d1, d2, …}. Có thể đã sang sprint/tuần mới — hãy cung cấp link trang daily mới.` |
| Không có hàng của người dùng | `Không tìm thấy hàng của bạn (userKey {key}) trong bảng daily. Hãy nhờ người quản lý trang thêm bạn vào bảng.` |
| Ô đã có nội dung, `overwrite` false | `Ô ngày {date} của bạn đã có nội dung. Xem "before" và gọi lại với overwrite: true nếu muốn ghi đè.` (trả `isError` kèm `before`) |
| Vẫn xung đột sau khi thử lại | Thông báo 409 sẵn có của `formatError` |

## 4. Skill `logwork`

File: `skills/logwork/SKILL.md`, viết bằng tiếng Việt.

Frontmatter:
- `name: logwork`
- `description`: kích hoạt khi người dùng giao task Jira (key dạng `ABC-123` hoặc link `/browse/`), khi bắt đầu hoặc kết thúc task, khi hỏi logwork, hoặc khi yêu cầu điền daily.
- `argument-hint: "[start <ISSUE> | stop | daily]"`

### 4.1 File logwork

- `./logwork/YYYY-MM-DD.md` (ngày theo giờ máy). Mỗi task là một mục `## {KEY} — {summary}` gồm:
  - `Phiên: HH:MM–HH:MM (XhYm)`; phiên đang mở ghi `HH:MM–…`.
  - `Trạng thái: in-progress | done | blocked`
  - `Đã làm:` danh sách gạch đầu dòng, viết theo kết quả đạt được.
  - `Vướng mắc:`
  - `Jira worklog: chờ xác nhận | đã log {d} (worklog {id}) | bỏ qua`
- `./logwork/config.json`: `{ "dailyPageUrl": string, "dailyPageId": string }`.
- Lần đầu tạo `./logwork/`, skill thêm dòng `logwork/` vào `.git/info/exclude` nếu đang ở trong git repo và dòng đó chưa có.
- Giờ luôn lấy bằng lệnh `date +%H:%M` hoặc `date +%F` tại thời điểm xảy ra, không để model ước lượng.

### 4.2 Quy trình bắt đầu task

1. Nhận key: từ key, từ link `…/browse/KEY`, hoặc từ đối số `start KEY`.
2. Gọi `jira_get_issue` để lấy summary và trạng thái.
3. Nếu đang có phiên mở của task khác thì đóng phiên đó trước (ghi giờ kết thúc).
4. Thêm mục mới, hoặc thêm phiên mới vào mục đã có trong ngày, với giờ bắt đầu.
5. Thông báo ngắn: `Logwork: bắt đầu {KEY} lúc {HH:MM}`.

### 4.3 Quy trình kết thúc task

1. Khi task xong hoặc người dùng bảo dừng: đóng phiên và cập nhật Trạng thái, Đã làm, Vướng mắc.
2. Đề xuất worklog:
   - thời lượng = tổng các phiên **của task trong ngày chưa được log**, làm tròn lên bội số 15 phút, tối thiểu 15m;
   - `started` = giờ bắt đầu phiên đầu tiên chưa log;
   - comment = các dòng "Đã làm".
3. Hỏi người dùng: đồng ý, sửa giờ, hoặc bỏ qua. Chỉ gọi `jira_add_worklog` khi được đồng ý, rồi ghi id worklog. Bỏ qua thì ghi `bỏ qua`.

### 4.4 Quy trình điền daily

1. `date` = ngày làm việc kế tiếp sau hôm nay (bỏ qua thứ 7 và chủ nhật).
2. A = mỗi task trong file hôm nay: `{summary}` + `issueKey`.
3. B = các task hôm nay có trạng thái in-progress hoặc blocked, hợp với kết quả `jira_search` JQL `assignee = currentUser() AND status = "In Progress"`, khử trùng theo key.
4. C = các dòng "Vướng mắc" khác rỗng.
5. `pageId` lấy từ `config.json`; chưa có thì hỏi link và trích `pageId=` từ URL (hoặc dùng `confluence_search` theo tiêu đề nếu người dùng chỉ đưa tên trang), rồi lưu lại.
6. Gọi `confluence_fill_daily` với `preview: true` và cho người dùng xem nội dung ô.
   - Gặp lỗi không có cột ngày: hỏi link trang mới, cập nhật config, rồi thử lại.
   - Gặp lỗi ô đã có nội dung: hỏi có ghi đè không.
7. Người dùng xác nhận thì gọi lại với `preview: false` và báo link trang.

### 4.5 Phong cách nội dung

Mỗi dòng ngắn gọn, viết theo kết quả đạt được ("Hoàn thành API refresh token", "Đang review PR #12"), có key issue. Không ghi chi tiết thao tác kỹ thuật vụn vặt và không lặp lại tên task.

## 5. Kiểm thử

- `test/daily.test.ts`: test logic thuần trên fixture lấy từ cấu trúc trang thật (§1). Các ca:
  - tìm đúng ô, kể cả khi có `colspan` và khi mention bọc trong `div`/`p`;
  - các ô khác và phần ngoài bảng giữ nguyên từng byte;
  - không có cột ngày, không có hàng của người dùng;
  - ô trống `<br />` hoặc `&nbsp;`, ô đã có nội dung;
  - escape tiếng Việt và ký tự `<`, `&`;
  - có bảng lồng trong ô;
  - nội dung ô sinh ra đúng mẫu cho từng trường hợp item rỗng.
- `test/confluence-daily.test.ts` (msw): preview không ghi gì; ghi đúng body PUT với version + 1 và title giữ nguyên; 409 thì thử lại đúng một lần; tool bị ẩn khi read-only; issueKey không hợp lệ bị từ chối.
- `test/server.test.ts`: tổng số tool cập nhật thành 40 (read-only vẫn là 22).
- Plugin: `claude plugin validate .` pass. Thử cài cục bộ bằng `claude plugin marketplace add ./` rồi `claude plugin install gem-jira@gem-tools`; MCP kết nối được và skill hiện ra.
- Skill (thủ công, trên `TDISGSAI`): bắt đầu task, kết thúc task, đề xuất và log worklog, rồi chạy daily ở chế độ preview trên trang thật. Chỉ ghi thật khi người dùng cho phép.

## 6. Tài liệu

- README: mục "Cài dưới dạng plugin" đặt ở đầu phần Cài đặt; hướng dẫn gỡ MCP cài thủ công; mô tả skill logwork; thêm `confluence_fill_daily` vào bảng tool.
- `docs/tools.md`: mục `confluence_fill_daily`.
- `docs/integration.md`: thêm mục plugin.

## 7. Ngoài phạm vi

- Tự thêm hàng thành viên hoặc cột ngày vào trang daily.
- Gom logwork từ nhiều repo; daily chỉ đọc `./logwork/` của repo hiện tại.
- Tự chuyển trạng thái issue Jira khi bắt đầu hoặc kết thúc task.
- Hook tự động đo thời gian; giờ được ghi theo hướng dẫn trong skill.
- Ngày nghỉ lễ; chỉ bỏ qua thứ 7 và chủ nhật.

## 8. Tiêu chí hoàn thành

- `npm run release-check` pass và `dist/` khớp với source.
- `claude plugin validate .` pass; cài plugin từ marketplace cục bộ thành công.
- `confluence_fill_daily` preview trên trang thật 212026868 trả đúng hàng và ô (hoặc báo đúng lỗi "không có hàng" nếu chưa có hàng của bạn).
- Skill chạy trọn vòng start, stop, worklog (có xác nhận) và daily preview trên project `TDISGSAI`.
