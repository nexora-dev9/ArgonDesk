# Security / 安全说明

## English

ArgonDesk exposes eleven tools: ten folder-scoped file tools and an independently authorized command runner. Read-only access, paused state, workspace IDs and command/file-management grants are enforced by the server, independently of tool annotations. New grants default off until chosen; startup preferences persist the user's choices.

Requests must use relative paths and the current workspace ID. Folder/permission changes rotate the ID and pause access. Restarting rotates the ID and defaults to paused. The optional startup file-access preference enables the saved root and permission on launch; a missing, replaced or invalid root remains paused. With this option on, a manual pause lasts for the current run. It is off until explicitly chosen. Absolute paths, parent traversal, NTFS streams, device/trailing aliases, symbolic links, junctions and hard links are rejected. A root replaced by a junction is rejected too.

This is a file-tool boundary, not an operating-system sandbox. run_command validates relative cwd but runs arbitrary PowerShell as the current Windows user: it can read/write outside the root, access the network and start programs. It does not elevate privileges. Its starting environment omits ArgonDesk/Codex-specific variables, which is not secret isolation: commands still have current-user access to local state. Use an isolated account/container/VM for strict isolation. Do not enable commands for an untrusted model/task. File tools do not guarantee protection against concurrent filesystem tampering by another local process.

move_path/delete_path additionally require edit mode and file-management permission. They reject the root, overlapping move paths and linked descendants. Overwrites retain the previous target before moving and attempt recycling it afterward; failed recycling leaves a named backup. Default deletion uses IFileOperation with recycling/undo flags and a progress callback rejecting non-recycle deletion. There is no permanent-delete fallback; to_trash=false explicitly authorizes permanent deletion. PowerShell uses a Windows Job Object assigned before spawning the shell; timeouts, pause, workspace changes, permission revocation and service exit terminate its process tree. Output retains bounded heads/tails; commands and exit codes enter history.

The dashboard listens on loopback, checks Host/Origin and requires CSRF for mutations. ngrok forwards the registered OAuth MCP endpoint, the legacy capability-key endpoint, OAuth metadata/token routes and the exact domain-verification/privacy/terms/help paths; the local dashboard and other paths remain private. The registered endpoint requires a valid bearer token. The legacy endpoint contains a random path key and can be disabled after the registered app is tested. Google-account-bound user OAuth is not implemented.

Requested file contents and command output travel through ngrok to Google. History stores operation metadata, including commands and search queries, but not file bodies or stdout/stderr. Avoid embedding credentials in commands; those strings enter local history. Local state can contain real paths, keys, encrypted tokens, the optional public domain-verification token and logs. Never publish `.local/`, a used installation folder, private URLs or browser state.

Tokens use current-user Windows DPAPI. This does not protect against software with the same user's authority. The registered Connected App uses machine-to-machine OAuth Client Credentials; its client secret is DPAPI-encrypted at rest and short-lived bearer tokens are not logged. The legacy custom-app endpoint remains compatible until the user enables Require OAuth on the public MCP endpoint. A registered Connected App can expose per-tool confirmation settings; if you disable confirmation for write tools, they can run without a per-call prompt while ArgonDesk's folder, workspace-ID and read/edit checks remain enforced. Google may still apply separate safeguards. ArgonDesk does not auto-click Allow or disguise write tools as read-only. Inspect changes and keep recoverable copies.

For sensitive reports, use GitHub private vulnerability reporting if enabled, or contact the maintainer through the project profile. Do not post tokens, real URLs, personal paths or file contents in public issues. Use synthetic reproductions. Rotate an exposed connection key locally, then update its URL in Gemini.

## 简体中文

ArgonDesk 提供 11 项工具：10 项限制在目录内的文件工具及 1 项独立授权的命令工具。只读、暂停、工作区编号和命令/整理权限由服务端检查，不依赖模型或注解自律。新增权限在用户选择前默认关闭，自动启动设置会保存用户的选择。

请求必须使用相对路径和当前编号。切换目录或权限会更换编号并暂停；重启也更换编号，默认暂停。只有主动开启“启动时自动启用文件工具”，才会在启动时按保存的目录和权限启用；目录失效、被替换或权限无效时保持暂停。开启该项后，手动暂停只对本次运行有效。拒绝绝对路径、父目录穿越、NTFS 附加流、设备名和尾部别名、符号链接、目录联接点及硬链接；根目录被替换成联接点时也会拒绝访问。

这是文件工具的范围控制，不是操作系统沙箱。run_command 检查相对 cwd，但任意 PowerShell 命令以当前用户权限执行，可访问其他文件夹、网络及外部程序，不提权。初始环境移除工作台/Codex 专用变量，但这不等于凭据隔离，命令仍能以当前用户权限访问本机状态。严格隔离应使用独立受限账户、容器或虚拟机；不要为不可信模型/任务开启命令权限。文件工具也不能保证抵御其他本地进程并发篡改文件系统。

移动/删除还要求“查看与编辑”和独立整理权限，拒绝根目录、重叠移动及包含链接的目录树。覆盖移动先保留旧目标，成功后尝试回收；回收失败会保留备份。默认删除使用 IFileOperation 回收/撤销标志及拒绝非回收操作的回调，不退化为永久删除；to_trash=false 明确表示永久删除。命令助手在启动 PowerShell 前加入 Windows 作业对象，超时、暂停、换目录、关闭命令权限或服务退出会终止命令进程树。命令输出保留有界头尾，命令与退出码进入历史。

面板仅监听本机回环地址，检查 Host/Origin，修改需要 CSRF。ngrok 只额外转发注册式 OAuth MCP 端点、旧能力密钥端点、OAuth 元数据/令牌路由及域名验证、隐私政策、服务条款和帮助页；本地面板及其他路径不向公网开放。注册式端点必须携带有效 Bearer token；旧端点可在新应用测试完成后关闭。本版未实现绑定 Google 账户的用户委托 OAuth。

文件内容和命令输出经过 ngrok 传给 Google。历史记操作元数据（包括命令、检索词），不记文件正文或 stdout/stderr。避免把令牌写进命令，否则会进入本机历史。本机状态仍可能有真实路径、密钥、加密令牌、可公开的域名验证令牌和日志。不要公开 `.local/`、已使用的完整安装目录、私人 URL 或浏览器状态。

令牌使用当前 Windows 用户的 DPAPI 加密，不能防御拥有同一用户权限的软件。注册式 Connected App 使用机器到机器 OAuth Client Credentials；Client Secret 在本机通过 DPAPI 加密，短期 Bearer token 不写入日志。开启公网 OAuth 强制开关前，旧自定义应用仍保持兼容。注册式 Connected App 可逐工具配置确认；关闭写工具确认后，ArgonDesk 的目录、工作区编号及读写权限检查仍会执行，Google 也可能对特殊操作另行确认。工作台不自动点 Allow、不把写工具伪装成只读。请检查结果并为重要工作保留可恢复副本。

敏感问题可通过仓库已启用的 GitHub 私密漏洞报告，或项目资料中维护者的联系方式提交。公开 Issue 不要贴令牌、真实地址、个人路径和文件正文；请使用虚构样例复现。密钥泄漏后，在本地更换密钥，再到 Gemini 更新 URL。


## Document and binary reading / 文档与二进制读取

Document extraction runs locally in a worker with a 45-second timeout and a 384 MiB JavaScript heap limit. It does not enable OCR downloads, remote assets, macros, shell commands or pickle deserialization. Container/image input is capped at 256 MiB, ZIP entries at 10,000 and declared expansion at 512 MiB. Image previews are capped at 2 MiB. Text replies are paginated and in-memory parsed-text caching retains at most three files; extracted documents and images are not written to the workspace. A pause or folder change before an asynchronous result completes prevents that result from being returned. Unknown scientific binaries are raw data, not an interpreted physical model.

文档在本机独立工作线程中解析，45 秒超时，JavaScript 堆上限 384 MiB。不开启联网 OCR、远程资源、宏、终端执行或 pickle 反序列化。容器/图片输入限 256 MiB，ZIP 限 10,000 项、声明展开大小 512 MiB，预览图限 2 MiB。文本分段返回，仅在内存中缓存最多三份提取结果；不向工作区写入提取中间文件。异步读取完成前暂停或切换工作区，会拒绝返回旧结果。未知专业二进制返回原始数据，不代表已完成物理解析。
