# Third-party notices / 第三方声明

ArgonDesk's own code is licensed under MIT; see LICENSE. Its panel, folder guards, launch and connection management were written for this project. WebCodex's conversation-to-workspace workflow inspired the idea. No source code, UI assets or brand marks from WebCodex, MCP SuperAssistant, DWN.BRIDGE, AionUi, Gemini Nexus, Cherry Studio or LobeHub were copied.

本项目自己的代码采用 MIT。控制面板、目录范围限制、启动和连接管理由本项目编写；WebCodex 的聊天工作区方式是灵感来源之一，未复制上述项目源码、界面素材或标志。

| Dependency / 依赖 | Version / 版本 | License / 许可证 | Upstream / 来源 |
| --- | --- | --- | --- |
| MCP TypeScript SDK | 1.32.1 | MIT | https://github.com/modelcontextprotocol/typescript-sdk |
| Express | 4.22.3 | MIT | https://github.com/expressjs/express |
| Zod | 3.25.76 | MIT | https://github.com/colinhacks/zod |
| officeparser | 8.2.0 | MIT | https://github.com/harshankur/officeParser |
| PDF.js | 6.2.108 | Apache-2.0 | https://github.com/mozilla/pdf.js |
| @napi-rs/canvas | 1.1.0 | MIT | https://github.com/Brooooooklyn/canvas |
| sharp | 0.35.5 | Apache-2.0 | https://github.com/lovell/sharp |
| yauzl | 3.4.0 | MIT | https://github.com/thejoshwolfe/yauzl |
| fflate (test fixtures and transitive dependency) | 0.8.3 | MIT | https://github.com/101arrowz/fflate |

The Windows package includes Node.js 24.18.0 and runtime npm dependencies. Node's license and component notices are retained in licenses/Node.js.txt; source: https://raw.githubusercontent.com/nodejs/node/v24.18.0/LICENSE . Dependencies retain their own license files.

Windows 包包含 Node.js 24.18.0 及 npm 运行依赖，保留各自许可声明。源码包不包含这些运行二进制与依赖目录。

ngrok is a separate service/client under its own terms. Public ArgonDesk packages do not include ngrok.exe. Install-Tunnel.ps1 downloads the official client for the user's installation and verifies Authenticode before moving it into place. The MIT license for ArgonDesk does not relicense ngrok or grant rights to the service.

ngrok 使用自己的服务和客户端条款。公开包不包含 ngrok.exe，由用户首次启动时从官方取得并验证签名。本项目 MIT 许可证不重新授权 ngrok，也不授予服务使用权。

Google, Gemini, ngrok, WebCodex and other product names belong to their respective owners. ArgonDesk is independent and unofficial.
相关名称属于各自所有者，本项目独立开发，并非其官方产品。
