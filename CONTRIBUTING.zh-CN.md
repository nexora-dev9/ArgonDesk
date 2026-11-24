# 参与开发

[English](CONTRIBUTING.md)

WebAgy 是采用 MIT 许可证的预览项目。欢迎精确修复、可复现报告、说明改进和经过验证的接入。大改动前请查看[路线图](docs/ROADMAP.zh-CN.md)。

开发环境为 Windows x64、Node.js 22+、PowerShell 5.1、.NET Framework 4.x 和 Edge。先运行 `npm ci --ignore-scripts`，再运行 `npm test`。`.\Build.ps1` 编译桌面入口；`.\Setup.ps1` 还会下载并验证 ngrok 客户端。

检查入口：
- `npm test`：虚构样例中的真实 MCP 握手和文件操作、越界拒绝、批量失败。
- `node tests/tunnel.mjs`：域名与当前用户的 DPAPI。
- `node tests/tunnel-lifecycle.mjs`：编译模拟客户端，不连接外网，不需要真实账户。
- `.\Pack.ps1`：发布白名单与私密状态排除检查。

测试只写 `.local/tests`。DPAPI 加解密需使用同一个 Windows 用户；不要降低凭据保护来绕过失败。

先读相关代码，让每处改动对应具体问题。保留默认暂停、只读强制检查、编号更新、路径限制、本机设置面板和真实连接状态，验证实际行为。

新增隧道时，区分文档研究、协议测试和真正从 Gemini 官网确认写入、读回的验证。能转发 HTTP 不等于支持完整官网流程。

PR 说明触发条件、修改后行为、检查和未验证项。使用虚构文件与演示截图，排除令牌、真实路径、私人 URL 和个人对话。

公开包包含 Node.js 与运行依赖，不包含 ngrok；由 `Start-WebAgy.cmd` 从官方安装签名有效的客户端。构建时保留匹配 Node 版本的许可证。源码不提交 `dist/`、`.local/`、`node_modules/` 和生成的 EXE。

贡献采用 MIT；第三方内容保留来源与许可。不要复制其他项目的界面素材，不把服务客户端声明为本项目代码。
