# jira-server-mcp

MCP server (stdio) cho **Jira Server 8.x** đăng nhập bằng username/password (Basic Auth). Cho phép Claude Code hoặc MCP client khác tìm kiếm, đọc và thao tác issue, comment, worklog, link, attachment, board và sprint bằng tài khoản Jira của chính bạn.

Đã kiểm tra với Jira Server 8.5.19 (`https://pm.gem-corp.tech`).

## Yêu cầu

- Node.js ≥ 20
- Tài khoản Jira Server/Data Center đăng nhập được bằng username/password

## Cài đặt

### Cách A — chạy qua `npx` từ git

Thêm vào `.mcp.json` của project hoặc `~/.claude.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "npx",
      "args": ["-y", "git+https://<git-nội-bộ>/jira-mcp.git"],
      "env": {
        "JIRA_BASE_URL": "https://pm.gem-corp.tech",
        "JIRA_USERNAME": "<username>",
        "JIRA_PASSWORD": "<password>"
      }
    }
  }
}
```

### Cách B — clone và build

```bash
git clone https://<git-nội-bộ>/jira-mcp.git
cd jira-mcp && npm ci && npm run build
```

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": ["/đường/dẫn/jira-mcp/dist/index.js"],
      "env": {
        "JIRA_BASE_URL": "https://pm.gem-corp.tech",
        "JIRA_USERNAME": "<username>",
        "JIRA_PASSWORD": "<password>"
      }
    }
  }
}
```

Hoặc dùng lệnh: `claude mcp add jira -e JIRA_BASE_URL=https://pm.gem-corp.tech -e JIRA_USERNAME=<u> -e JIRA_PASSWORD=<p> -- node /đường/dẫn/jira-mcp/dist/index.js`

## Cấu hình

| Biến | Bắt buộc | Mặc định | Ý nghĩa |
|---|---|---|---|
| `JIRA_BASE_URL` | ✓ | | URL Jira, vd `https://pm.gem-corp.tech` |
| `JIRA_USERNAME` | ✓ | | username Jira |
| `JIRA_PASSWORD` | ✓ | | mật khẩu Jira |
| `JIRA_READ_ONLY` | | `false` | `true` → chỉ bật các tool đọc |
| `JIRA_INSECURE_TLS` | | `false` | `true` → bỏ kiểm tra chứng chỉ TLS (chỉ dùng với CA nội bộ) |
| `JIRA_TIMEOUT_MS` | | `30000` | timeout mỗi request |

Khi khởi động, server gọi `/rest/api/2/myself` để kiểm tra đăng nhập (sai thì thoát ngay với thông báo lỗi), và chỉ bật tool agile nếu Jira có Jira Software.

## ⚠️ Bảo mật

- Mật khẩu nằm dạng plain text trong file cấu hình MCP. **Không commit** `.mcp.json`, `~/.claude.json` hay `.env` chứa mật khẩu lên git.
- Nhập sai mật khẩu nhiều lần, Jira sẽ yêu cầu CAPTCHA và mọi request API đều bị từ chối. Khi đó hãy đăng nhập Jira trên trình duyệt một lần để mở khoá.
- Server không retry khi lỗi xác thực, và không gửi thông tin đăng nhập tới host khác `JIRA_BASE_URL`.

## Danh sách tool

**Đọc:** `jira_search` (JQL), `jira_get_issue`, `jira_get_comments`, `jira_get_worklogs`, `jira_get_transitions`, `jira_list_projects`, `jira_get_create_meta`, `jira_search_fields`, `jira_search_users`, `jira_list_link_types`, `jira_download_attachment`

**Ghi** (tắt khi `JIRA_READ_ONLY=true`): `jira_create_issue`, `jira_update_issue`, `jira_assign_issue`, `jira_transition_issue`, `jira_add_comment`, `jira_update_comment`, `jira_add_worklog`, `jira_link_issues`, `jira_upload_attachment`

**Agile** (chỉ khi có Jira Software): `jira_list_boards`, `jira_list_sprints`, `jira_get_sprint_issues`, `jira_move_issues_to_sprint`*, `jira_create_sprint`*, `jira_update_sprint`* (* = ghi)

Lưu ý Jira Server: user định danh bằng `name` (username); description/comment dùng wiki markup (`*đậm*`, `{code}…{code}`); custom field truyền qua `customFields` theo id (tra bằng `jira_search_fields`).

Không hỗ trợ xoá (issue, comment, worklog, attachment, sprint) — hãy làm trên giao diện web.

## Phát triển

```bash
npm test                 # unit + tool tests (mock HTTP, không gọi Jira thật)
npm run build
cp .env.example .env     # điền thông tin đăng nhập
npm run smoke            # chỉ gọi tool đọc trên Jira thật
npx @modelcontextprotocol/inspector node dist/index.js   # thử tool bằng giao diện
```
