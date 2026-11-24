# 注册式 Google Connected App：关闭逐次写入确认

WebAgy 目前的普通自定义 MCP 接入方式，仍会由 Gemini 对每次写入要求人工确认。要配置免逐次确认，必须走 Google Connected Apps Platform 的注册式应用流程；这不是在原有自定义应用设置里打开 Always allow。

## 1. 先确认 Google 账户权限

打开 [Google Connected Console](https://connected.google.com/console)。该平台目前处于预览阶段，可能需要先申请预览权限，并接受 Connected Apps 条款。若账户没有创建应用的权限，需要先解决平台准入问题。

不要删除现有 Gemini 自定义应用。先把注册式应用完成预览测试，再决定是否停用旧应用。

## 2. WebAgy 端准备

1. 更新并启动 WebAgy 0.4.4。
2. 保持当前 ngrok 固定 HTTPS 域名和隧道在线。
3. 在连接设置的“注册式 Connected App”卡片中复制域名验证地址。
4. 在 Connected Console 创建 MCP Connected App 后，下载 Google 提供的 google-connected-apps.json。
5. 把该 JSON 文件全文粘贴到 WebAgy 的验证框并保存。
6. 回到 Connected Console，对刚才的域名验证地址执行 Verify domain。

验证文件会由 WebAgy 在以下标准路径提供：

    https://你的域名/.well-known/google-connected-apps

ngrok 流量策略只额外放行注册式 OAuth MCP 端点、旧带密钥端点、OAuth 元数据/令牌路由，以及域名验证、隐私政策、服务条款和帮助页；本地设置面板及其他路径不会向公网开放。

## 3. Connected Console 应用信息

建议使用以下描述和示例，必要时按 Console 的分类要求调整：

**Description**

Read, create, and edit UTF-8 text files in a user-selected Windows workspace.

**Icon**

上传 app-icon-512.png（512 × 512 PNG）。

应用类别创建后不能修改，创建时请谨慎选择。

**Capabilities**

- Inspect the selected workspace and its access mode.
- Browse folders and read UTF-8 text files.
- Create and edit text files within the selected folder.

**Example prompts**

- @WebAgy inspect the selected workspace and summarize its folders.
- @WebAgy create a new README in the selected project folder.
- Use WebAgy to update the notes in my selected workspace.

**Public URLs**

- Terms of Service: 你的 HTTPS 域名加 /terms
- Privacy Policy: 你的 HTTPS 域名加 /privacy
- Help: 你的 HTTPS 域名加 /help

MCP endpoint 使用 WebAgy 面板 OAuth 区域显示的 **注册式应用 MCP endpoint**，即 HTTPS 域名加 /mcp，由机器到机器 OAuth 保护。不要使用连接设置区域中旧的普通自定义应用地址；它带 URL 密钥并保留旧确认方式。Connected Console 的认证步骤选择 **Yes → Machine-to-machine OAuth Client Credentials**。在 WebAgy 中生成 OAuth 凭据，再把 Client ID 和 Client Secret 填入 Console。Token endpoint 通过 /.well-known/oauth-authorization-server 自动发现；若 Console 要求手动填写，使用 WebAgy 显示的地址，Authorization endpoint 留空。

Client Secret 使用当前 Windows 用户的 DPAPI 加密保存在本机，生成后仅显示一次。若遗失，重新生成一组并同步更新 Connected Console。先保持“强制要求公网 MCP 使用 OAuth”关闭，等注册式应用测试成功后再开启；开启后旧普通自定义应用将无法继续调用公网 MCP。

## 4. 关闭写入工具的逐次确认

完成工具同步后，在 Connected Console 的 Tools 区域逐个检查工具：

| 工具 | User confirmation required |
| --- | --- |
| workspace_info | 关闭 |
| list_files | 关闭 |
| read_file | 关闭 |
| write_file | **关闭** |
| edit_file | **关闭** |
| create_directory | **关闭** |

写入工具的 MCP 注解仍如实保留 destructiveHint。Google Console 会因此默认勾选确认选项；应在 Console 中按本次明确的配置目标手动取消，而不是修改注解伪装成只读。

保存后，把自己的 Gmail 账户加入测试者，在 Gemini 中连接注册式 WebAgy，验证读取、创建和编辑是否不再逐次弹出 Allow。Google 仍可能对某些特殊操作应用独立安全确认。

## 5. 测试和发布

先用仅对测试者开放的预览版本完成端到端测试。Google 文档要求应用经过审核后才能公开发布；预览可用性、审核结果和地区开放范围由 Google 决定。

当前 ngrok 域名是否能通过 Google 的域名验证，需要在 Console 中实际验证。若 Google 不接受该域名，需改用可验证控制权的自有 HTTPS 域名，并相应调整 WebAgy 的域名校验与隧道配置；不要通过关闭域名验证来绕过。

## 官方依据

- [Connected Apps Platform：注册、测试和发布](https://developers.google.com/connected-apps/gpc/perform-the-steps)
- [Connected Apps Platform：使用前提](https://developers.google.com/connected-apps/gpc/prerequisites)
- [Gemini：连接和管理自定义应用](https://support.google.com/gemini/answer/17209137)

普通自定义 MCP 应用与 Connected Apps Platform 注册应用是两条不同的接入路径。前者的写操作仍需人工确认；本指南描述的是后者的逐工具确认配置。
