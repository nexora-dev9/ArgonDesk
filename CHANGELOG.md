# Changelog / 更新记录

## 0.4.6 — Search, organization and commands / 检索、整理与命令

- Added find_files/search_text with dependency-directory exclusions, bounded results and worker-isolated regex timeouts.
- Added guarded move_path/delete_path, default Windows recycling with no permanent fallback, and retained backups for overwrite moves.
- Added separately authorized PowerShell run_command with checked cwd, process-tree timeouts/cancellation, bounded head/tail output and exit codes. Commands use current-user permissions, not an OS filesystem sandbox.
- Added bilingual permission/startup controls and restoration when reopening an existing backend. New installations still require explicit grants.
- Normalized CRLF/LF matching in edit_file while preserving the original newline style and atomic batch behavior.
- Activity now includes new tool calls, validation refusals, command/target, status, duration and exit code. Added native helper build/package support and integration tests.

- 新增文件/文本搜索，默认忽略依赖和构建目录，正则在独立线程限时执行。
- 新增工作区内移动和删除，默认回收且拒绝永久删除回退；覆盖移动保留可恢复旧目标。
- 新增独立授权的 PowerShell 命令、进程树超时/取消、有界输出及退出码；命令是当前用户权限，不是文件系统沙箱。
- 增加双语权限与自动启动设置，重新打开已有后台时也恢复已选选项；新安装不自动授予额外权限。
- edit_file 兼容 LF/CRLF 并保留原风格，记录新增工具、参数拒绝、耗时、状态和退出码。

## 0.4.5 — Document and large-file reading / 文档与大文件读取

- Removed the 2 MiB read limit for text; bounded responses and file-bound cursors support large logs/CSV and long single lines.
- Extended the existing read_file tool with local DOCX/PDF/PPTX/XLSX/OpenDocument/RTF/EPUB extraction, embedded images, image/PDF-page previews, NPY/NPZ data and bounded raw-byte fallback.
- Added directory pagination so entries after 500 remain reachable. list_files now returns { entries, total_entries, next_offset } rather than a bare array.
- Kept the six-tool surface, scoped folder guards, read-only mode, OAuth configuration and the 2 MiB text-write limit. Pausing/switching also invalidates in-flight document results.
- Added local and real MCP reading checks. Gemini's handling of image tool results still requires website-side acceptance testing.

- 大文本读取不再受 2 MiB 文件大小限制；通过有界响应和绑定文件的游标续读 CSV、日志及超长单行。
- 在原 read_file 工具中增加本地文档提取、内嵌插图、图片与 PDF 页面预览、NumPy 数组及原始字节读取。
- 目录超过 500 项可继续分页；list_files 改为返回 entries、total_entries、next_offset 对象，客户端需相应读取 entries。
- 保留六项工具、目录与只读限制、OAuth 配置和 2 MiB 文本写入限制。暂停/切换会拒绝返回尚未完成的旧文档读取。
- 增加本地与真实 MCP 检查；官网是否消费图像型工具结果仍需官网端验收。

## 0.4.4 — Machine-to-machine OAuth / 机器到机器 OAuth

- Added a separate public /mcp endpoint protected by OAuth Client Credentials; the legacy keyed endpoint remains compatible until explicitly retired.
- Added OAuth authorization-server and protected-resource metadata, Basic/Post client authentication, one-hour signed bearer tokens and DPAPI-encrypted client-secret storage.
- Added one-time credential generation/copy controls and a migration switch that can require OAuth on the legacy public endpoint after the registered app is verified.
- Added integration tests for OAuth token exchange, bearer enforcement and legacy compatibility.

- 新增独立的公网 /mcp 注册式端点，使用 OAuth Client Credentials；旧带密钥端点在用户主动关闭前保持兼容。
- 增加 OAuth 元数据、Basic/Post 客户端认证、1 小时签名 Bearer token，以及 DPAPI 加密的 Client Secret 保存。
- 增加一次性凭据生成/复制入口，并提供注册式应用验证完成后关闭旧端点的开关。
- 增加 OAuth 换取令牌、Bearer 校验和旧端点兼容性集成测试。

## 0.4.3 — Registered Connected Apps / 注册式应用接入

- Added a separate registered-app MCP endpoint protected by machine-to-machine OAuth Client Credentials, including metadata discovery and a token endpoint.
- Added DPAPI-encrypted OAuth client-secret storage, one-time credential display and an optional switch to retire the legacy keyed endpoint after migration.
- Added the Google domain-verification challenge and narrowly scoped public privacy, terms and help pages; the ngrok policy exposes only exact MCP/OAuth/registration paths.
- Added local dashboard controls for verification data and OAuth credentials, plus a guide for per-tool confirmation settings.
- Kept write-tool annotations honest and preserved folder, workspace-ID, read-only and paused-state enforcement.

- 增加独立的注册式 MCP endpoint，使用机器到机器 OAuth Client Credentials，并提供元数据发现和令牌端点。
- OAuth Client Secret 使用 DPAPI 加密保存，生成后仅显示一次；新应用迁移完成后可强制关闭旧带密钥端点。
- 增加 Google 域名验证端点及严格限路径开放的隐私政策、服务条款和帮助页；ngrok 仅放行 MCP/OAuth/注册所需路径。
- 本地面板增加验证数据和 OAuth 凭据管理入口，并补充逐工具关闭写入确认的注册指南。
- 保留写入工具真实注解及目录、工作区编号、只读和暂停状态检查。

## 0.4.2 — Leaner file tasks / 减少多余调用

- Added opt-in startup file access, saved permissions, fresh startup IDs and fail-closed root validation.
- Added create-only writes and parent-folder creation, enabling a two-call new-file path without unrelated directory inspection.
- Identified the MCP server as ArgonDesk and added concise guidance preserving detail, actual animation and interactivity.
- Removed duplicate structured copies from successful results; canonical JSON text remains in content[0].text.
- Added bilingual usage/quality guidance and startup regression checks. Payload reduction is measured locally; Google quota and creative quality improvements are not claimed as verified.

- 新增可选的启动自动启用、沿用保存权限、重启更新编号及目录失效时暂停。
- 增加不覆盖的新建模式和父目录创建，简单任务可以两次调用落盘。
- MCP 名称与软件统一，指导模型保留细节、真实动画和交互。
- 去掉成功结果中重复的 structuredContent 正文，保留 content[0].text 的 JSON。
- 增加双语额度/质量说明与启动回归检查。响应体积的本地改善不等于已证明节省 Google 额度或提高创作质量。

## 0.4.1 — Open-source preview / 开源预览

- Formalized the ArgonDesk name and MIT license.
- Added first-run startup and signature-checked ngrok installation; public packages exclude its binary.
- Added detailed bilingual installation, networking, troubleshooting, AI-assisted setup and contribution guides.
- Added Windows CI definition and release checks. Hosted CI results must be verified after publication.
- Preserved the six tools and directory permissions from 0.4.0.

- 正式命名 ArgonDesk，自己的代码采用 MIT。
- 增加首次启动与签名验证安装，公开包不包含 ngrok 客户端。
- 完善双语安装、网络、排错、智能体协助安装和贡献文档。
- 增加 Windows CI 定义与发布检查；上线后的实际 CI 结果仍需核对。
- 兼容 0.4.0 的六项工具与目录权限。

## 0.4.0 — Local validation / 本地验证

Simplified the workspace, added Chinese/English preferences, repaired picker ownership, improved tunnel recovery and added up to 50 replacements per edit_file call. The picker foreground behavior was manually confirmed on the current Windows installation.

精简工作区、中英文切换、修复选择器层级、完善隧道恢复、增加同文件最多 50 处替换。本机使用者已确认文件夹弹窗置顶正常。
