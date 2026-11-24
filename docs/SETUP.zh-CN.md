# 从零安装并接入 Gemini 官网

[English](SETUP.md) · [项目说明](../README.zh-CN.md)

## 1. 确认条件

需要 Windows 10/11 x64、Edge、Windows PowerShell 5.1、.NET Framework 4.x，以及能使用自定义 Connected Apps 的 Gemini 账户和自己的 ngrok 账户。不需要模型 API Key。

Google 的[当前要求](https://support.google.com/gemini/answer/17209137)涉及个人账户、年龄与地区、活动记录和英文界面。先确认自己的账户确实有该功能，再配置隧道；买了订阅不等于一定开放。

## 2. 准备软件

下载 Windows ZIP 后，完整解压到可写目录，例如 D:\\Apps\\WebAgy。首次双击 Start-WebAgy.cmd：它会从官方站点取得 ngrok 客户端、验证签名，再打开桌面入口，不安装系统服务。准备好后可以直接使用 WebAgy.exe。

源码方式先安装 Node.js 22+，在源码根目录打开 PowerShell，运行：

    .\Setup.ps1
    .\Build.ps1
    .\Start-WebAgy.cmd

Setup 安装锁定的 npm 依赖与官方连接客户端；Build 调用 Windows 自带的 .NET C# 编译器。不要在 ZIP 内直接运行，也不要只复制 EXE。

遇到执行策略或签名错误时，请查看实际错误和本机策略，不要关闭安全检查或换成未验证的 EXE。

## 3. 配置隧道

在「连接设置」选提供方。ngrok 使用自己 [ngrok 控制台](https://dashboard.ngrok.com/)分配的 HTTPS 开发域名和 Authtoken。Cloudflare 可用免账号 Quick，或填写自己 Named Tunnel 的域名与令牌。保存后启动，详见[网络说明](NETWORKING.zh-CN.md)。

令牌不回显；已保存后留空可保留原值。DPAPI 把凭据与当前 Windows 用户关联。启动时自动连接只恢复隧道，不会自动启用文件权限。

等待连接结果；失败时查看[网络说明](NETWORKING.zh-CN.md)和[排错手册](TROUBLESHOOTING.zh-CN.md)。TUN 不是所有电脑的前提条件。

## 4. 添加官网原生应用

普通接入：复制工作台中的私人 MCP URL。打开 [Gemini Connected Apps](https://gemini.google.com/customize/connectors?hl=en)，添加自定义应用，填写该地址并命名 WebAgy。完成后确认发现 12 项工具，包括 `read_skill`。写操作仍需逐次 Allow。

若希望免去逐次 Allow，需使用 Google Connected Apps Platform 注册式应用，而不是普通自定义应用。按[注册式 Connected App 指南](CONNECTED_APPS_PLATFORM.zh-CN.md)完成预览准入、域名验证、工具同步和逐工具确认配置。

完整 URL 相当于密码，不要贴公开 Issue，也不要发到无关对话。本机设置面板地址不是要注册的 MCP 地址；Google 服务器不能直接连接你的 localhost。

## 5. 选择工作目录

选择本次任务目录、只读或读写，再启用访问。首次建议用空白测试目录。切换目录或权限会暂停并更新工作区编号；本地重新启用，让模型重新查询 workspace_info。MCP URL 不变。

## 6. 验证真正执行

在英文官网新开 Chat 或 Task，输入 @ 后从菜单点选 WebAgy。功能是否开放以账号界面为准。

让 Gemini 查询工作区、新建一个名称唯一的小文本文件，再读回。普通自定义应用会显示 Allow；注册式 Connected App 则按 Console 中的逐工具确认设置执行。最后在磁盘和“操作记录”核对结果。

隧道在线、握手和工具列表不等于模型真的读写文件。黑色调用代码块也不等于执行。无法调用时，保留证据，另开原生应用任务，不要继续混用旧 Insert 流程。

## 7. 日常与退出

打开工作台，查看连接、选择文件夹并启用。换目录不用重新注册应用。新安装默认英文，在 **Preferences → Language → 简体中文** 切换，软件会记住选择。官网语言独立设置。

关窗口后后台留在托盘；电源按钮或托盘“停止服务并退出”会停止文件服务与隧道。重启默认暂停；“偏好设置”可单独开启按保存目录和权限自动启用，目录失效时仍暂停。更新前先停止旧实例；个人状态只留在本机，不要加入问题报告或源码提交。
