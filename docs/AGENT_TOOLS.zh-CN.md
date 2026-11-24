# 检索、文件整理与构建测试 · 1.0.0

[English](AGENT_TOOLS.md) · [返回说明](../README.zh-CN.md)

先调用 `workspace_info`，复用它返回的 `workspace_id`。所有工具均要求文件访问已启用。相对路径以主目录为基准，绝对路径须位于已授权目录内。禁止 `..`、NTFS 附加流、设备别名和链接。只读锁覆盖子目录、文件整理和快照恢复。切换目录、改变权限或重启后，重新取得编号。

| 工具 | 参数（除 workspace_id 外） | 默认与结果 |
| --- | --- | --- |
| `find_files` | `pattern`, `path="."`, `max_results=200` | 文件名片段或 glob，例如 `**/*.{py,js}`。返回 `results[{path,size}]`，上限可设 1–1000 |
| `search_text` | `query`, `path="."`, `regex=false`, `case_sensitive=false`, `max_results=100` | 返回 `results[{path,line_number,column,text,line_truncated}]`；行列从 1 开始 |
| `move_path` | `src`, `dst`, `overwrite=false` | 移动文件或整个目录，补齐父目录；不默认覆盖，禁止源目标互为祖先 |
| `delete_path` | `path`, `to_trash=true` | 默认通过 Windows Shell 回收站 API 删除；无法回收时失败，不退化为永久删除。`false` 明确表示永久删除 |
| `run_command` | `command`, `cwd="."`, `timeout_sec=120` | PowerShell 5.1；超时允许 1–600 秒，命令不超过 8000 字符。返回 `exit_code/stdout/stderr` 及耗时、截断/超时/取消标志 |
| `read_skill` | `name`，可选 `resource_path` | 读取已发现的本地 Skill 并列出资料，或读取其中一项相对路径的文本资料 |

检索默认忽略 `node_modules`、`.venv`、`.git`、`__pycache__`、`dist`、`build`，不跟随链接。`find_files` 搜索文件，不返回目录；无通配符时按文件名片段匹配。含斜杠的模式相对工作区根目录匹配，`path` 仅缩小遍历范围；文件名匹配不区分大小写。检索文本不解析 Office/PDF 等二进制正文；用 `read_file` 读取这些文档。文本可超过 2 MiB，采用流式读取。单行超过 65,536 字符会跳过并计数，匹配行预览至多 1000 字符；单次扫描有 100,000 文件、约 8 秒和响应大小预算，异常正则在独立线程中最多运行 10 秒。请检查 `truncated` 和跳过计数，再缩小 `path` 或改用 `read_file` 续读。

覆盖移动不会直接删除旧目标：先保留旧目标，移动成功后尝试回收旧副本；若回收失败，结果中的 `previous_target_backup` 指向保留位置。普通移动的目标默认不得存在。跨文件系统重命名可能失败；不自动退化为复制后删除。

## 开关在哪里

主界面左下角或右上角齿轮 → **偏好设置**：

- **打开时自动连接隧道**：使用「连接设置」中保存的提供方和配置。
- **启动时自动启用文件工具**：打开软件时恢复当前目录与已保存权限。
- **允许 AI 移动和删除文件**：控制 `move_path/delete_path`。
- **允许 AI 执行工作区命令**：控制 `run_command`。

后两项还需要主界面选择“查看与编辑”并启用文件工具；默认不替新用户授予。勾选自动启用不会当场解除暂停；下次从桌面/托盘打开即恢复，也可直接点主界面的启用按钮。手动停止隧道会同时关闭其自动连接选项，需重新勾选才能自动恢复。

**命令权限是当前 Windows 用户的执行权限。** cwd 虽受目录检查，命令内容仍可读写其他文件夹、联网或调用外部程序；这不是文件系统沙箱，也不会提权。若要求强隔离，应在独立受限账户、容器或虚拟机中运行。暂停、切换目录、关闭命令开关或停止服务，会结束正在运行的命令及其子进程。每次命令的 stdout/stderr 各保留约 16 KiB，过长内容保留头尾，中间标明截断；超时退出码 124，主动取消 130。非零退出会作为 MCP 错误返回，同时保留详细 JSON 结果。

操作记录显示工具、路径/命令、成功/失败/拒绝/超时、耗时及退出码，最近保留 100 条。记录检索词和命令，不保存文件正文或 stdout/stderr；命令中不要直接放令牌或密码。

## 构建测试示例

在官网新任务中选择应用后可说：

> 在当前工作区找到前端入口，按我的要求修改；用 edit_file 合并替换，保留换行。然后在正确子目录运行 npm test 和 npm run build。只报告实际退出码和必要错误，不重复读取所有文件。

`edit_file` 对 CRLF/LF 归一化后唯一匹配，替换写回保留原文件的换行风格和未修改部分的字节内容；批量替换仍是全部匹配成功才写入。文本写入/编辑大小上限仍为 2 MiB，不代表可直接编辑 Office 等二进制包。

源码版运行 `Build.ps1` 生成桌面入口和工作区助手。MCP 工具发现应显示 12 项。官网仍显示旧列表时，刷新应用，或到 [Gemini Developer Mode](https://developers.google.com/connected-apps/mcp/dev-mode/usage) 点 **Sync schema**。
