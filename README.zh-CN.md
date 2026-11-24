# WebAgy

[English](README.md) · [下载 Windows 版](https://github.com/nexora-dev9/WebAgy/releases) · [MIT 许可证](LICENSE)

WebAgy 让 **Gemini 网页版**连接你授权的 Windows 文件夹。在 **Chat（对话）**或 **Task（任务）**里选择 **@WebAgy**，就能让 Gemini 读写、搜索和整理本地文件，也可以读取 `SKILL.md` 和它的附属资料。它使用 Gemini 官网的原生自定义应用和 MCP，沿用符合条件的官网账号，无需另买模型 API。

![WebAgy 中文工作区，演示数据](docs/assets/workspace-zh-CN.png)

## 开始使用

1. 到 [GitHub Releases](https://github.com/nexora-dev9/WebAgy/releases) 下载 Windows x64 ZIP，完整解压后打开 `Start-WebAgy.cmd`。便携包包含 Node.js 和运行依赖。源码安装需要 Node.js 22.13 或更新版本、Windows PowerShell 5.1 和 .NET Framework C# 编译器。详见[安装指南](docs/SETUP.zh-CN.md)。
2. 在**工作区**选择文件夹，选「仅查看」或「查看与编辑」，准备好后启用文件工具。
3. 在**连接设置**里用自己的域名和令牌配置 ngrok，也可选择 Cloudflare Tunnel。Quick 提供临时地址，Named 使用你自己的域名与隧道令牌。隧道在线后复制私人 MCP 地址。详见[隧道选择](docs/NETWORKING.zh-CN.md)。
4. 打开 [Gemini → Connected Apps](https://gemini.google.com/customize/connectors?hl=en)，添加私人地址，名称可填 WebAgy。确认应用能发现 **12 项工具**，包括 `read_skill`。账号、地区、历史记录与英文界面要求以 [Google 官方说明](https://support.google.com/gemini/answer/17209137?hl=en-12)为准。
5. 新开 **Chat** 或 **Task**，输入 `@` 后从菜单选择应用。第一次可以让 Gemini 在测试目录新建一个小文本文件并读回。出现写入确认时先检查内容，再点击 **Allow**，最后核对实际文件和「操作记录」。

新安装默认**英文**。在 **Preferences → Language → 简体中文** 可以切换。软件会在本机保存选择，下次打开继续使用上次的语言，托盘和 WebAgy 的文件夹选择提示也会跟着切换。Gemini 网页版的语言由它自己的设置控制。

`http://127.0.0.1:3008/` 是你自己电脑上的控制面板。Gemini 使用「连接设置」显示的私人 HTTPS MCP 地址，请把完整地址当成密码保管。

## 1.0 的功能

| 能力 | 说明 |
| --- | --- |
| 本地读写 | 搜索和读取大文本、文档、表格及图片，创建或编辑 UTF-8 文本，也能整理文件。 |
| 多目录授权 | 相对路径以主目录为基准，也可用授权范围内的绝对路径。可把单独目录及其子目录锁为只读。 |
| 本地 Skills | 在界面选取 Skill 目录。Gemini 先通过 `workspace_info` 看技能摘要，再使用 `read_skill` 读取说明或资料。脚本以文本形式返回，命令执行需单独授权。 |
| 快照与操作记录 | 查看实际的文件工具结果和命令退出码，还原符合条件的编辑前版本。只读权限同样约束恢复操作。 |
| 可选的构建与测试 | 可单独允许 PowerShell。软件检查命令的启动目录，命令继承当前 Windows 用户的权限。 |
| 隧道选择 | 支持 ngrok 和 Cloudflare Tunnel（`cloudflared`）。用自己的账户配置，也可在偏好设置里设为自动连接。 |

如果你想让 **Gemini 网页版直接修改本地文件、连接本地工作区，或像编程智能体一样使用本地 Skills**，可以从这个流程开始。更多细节见[工具参数](docs/AGENT_TOOLS.zh-CN.md)、[支持的文件格式](docs/READING.zh-CN.md)和[安全与数据说明](SECURITY.md)。

普通 Gemini 自定义应用会要求确认写入。注册式 Connected App 可在 Google Connected Console 中逐工具配置确认。命令和删除权限较大，建议保留对应确认。详见[注册指南](docs/CONNECTED_APPS_PLATFORM.zh-CN.md)。

## 其他指南

- [排错手册](docs/TROUBLESHOOTING.zh-CN.md)处理暂停、工具没更新、隧道错误和连上却没有落盘等问题。
- [额度与使用技巧](docs/USAGE.zh-CN.md)说明如何减少来回调用和重复读文件。
- [让智能体协助安装](docs/AI_SETUP.zh-CN.md)提供可直接转交的安装说明。
- [更新记录](CHANGELOG.md)和[参与开发](CONTRIBUTING.zh-CN.md)介绍版本改动和测试。

WebAgy 前身为 ArgonDesk，是独立开发的 MIT 开源 Windows 项目。分享时使用干净的源码或发布包，已使用的安装目录、账户凭据、私人隧道地址、历史、快照和工作文件都留在自己电脑。
