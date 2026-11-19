# First installation and native Gemini connection

[简体中文](SETUP.zh-CN.md) · [Overview](../README.md)

## 1. Confirm the prerequisites

Use Windows 10/11 x64, Edge, Windows PowerShell 5.1 and .NET Framework 4.x. You also need a Gemini account eligible for custom Connected Apps and your own ngrok account. No model API key is used.

Google's [current requirements](https://support.google.com/gemini/answer/17209137) include personal-account, age/location, activity and English-interface conditions. Verify the actual feature in your account before investing time in tunnel setup. A subscription alone does not guarantee access.

## 2. Prepare ArgonDesk

For a Windows release ZIP, fully extract it into a writable directory such as D:\\Apps\\ArgonDesk. Double-click Start-ArgonDesk.cmd. On first run it downloads the official ngrok client, verifies its signature and opens the desktop entry. It never installs a system service. Later you can open ArgonDesk.exe directly.

For source: install Node.js 22+, open PowerShell in the source root, then run:

    .\Setup.ps1
    .\Build.ps1
    .\Start-ArgonDesk.cmd

Setup installs locked npm dependencies and the official connection client. Build uses the Windows .NET C# compiler. Do not run a ZIP without extracting it or copy only the EXE.

If script policy or signature checks fail, inspect the actual error and your Windows policy. Do not disable security controls or substitute an unverified executable.

## 3. Configure your tunnel

In your own [ngrok dashboard](https://dashboard.ngrok.com/), obtain the assigned HTTPS development domain and Authtoken. In Connection, enter those two values, save and start.

The token field is write-only; blank preserves a saved token. DPAPI ties saved credentials to the current Windows user. Optional auto-connect reconnects the tunnel on launch, but does not automatically enable file access.

Wait for the tunnel status. If it fails, use [Networking](NETWORKING.md) and [Troubleshooting](TROUBLESHOOTING.md). TUN is not a universal prerequisite.

## 4. Register the custom app

Copy the private MCP URL from ArgonDesk. Open [Gemini Connected Apps](https://gemini.google.com/customize/connectors?hl=en), add a custom app, paste the URL and name it ArgonDesk. Follow the current site prompts. Refresh afterward and inspect the app's eleven tools. See [agent tools](AGENT_TOOLS.md) for optional command/file-management grants.

Treat the complete URL as a password. Do not post it in an issue or paste it into unrelated AI chats. The local panel is not the URL to register; localhost cannot be reached directly by Google's servers.

The custom-app route requires manual confirmation for each write. To configure no per-write prompt, use the registered Connected Apps Platform route described in the [registration guide](CONNECTED_APPS_PLATFORM.md).

For the registered route, copy the separate **Registered-app MCP endpoint** from ArgonDesk's OAuth card, generate OAuth credentials there, and choose **Yes → Machine-to-machine OAuth Client Credentials** in Connected Console. Do not use the legacy private URL as the registered endpoint.

## 5. Select the folder

Choose an existing task folder, set Read only or Read and edit, then enable access. Prefer a new disposable folder for the first check. Changing the folder/permission pauses requests and changes the workspace ID. Re-enable locally and have the model query workspace_info again. The MCP URL stays the same.

## 6. Verify a real task

The verified website path was English UI → Task → Argon. It is a tested path, not a permanent model requirement. Type @ and select the registered app from the menu.

Ask Gemini to inspect the workspace, create a small uniquely named text file, and read it back. A manually added custom app shows Allow for writes; a registered Connected App follows the per-tool confirmation settings configured in Connected Console. Verify the actual file and a successful tool entry in Activity.

Tunnel online, MCP handshake and tools/list alone do not prove model file access. A printed function-call code block is not an executed tool request. If the task cannot call tools, preserve the evidence and use a fresh native-app task rather than the old Insert workflow.

## 7. Daily use and shutdown

Open ArgonDesk, check the tunnel, choose the folder and enable access. Switching folders needs no app re-registration. Use Preferences to change the local UI language; the website language is separate.

Closing the window leaves the service in the tray. Use the power button or tray Stop service and quit to end both file service and tunnel. Restarting defaults to paused; Preferences can opt into startup access with the saved folder and permission. Invalid roots remain paused. Before replacing files for an update, stop the old instance; retain private state locally and never include it in a bug report or source commit.
