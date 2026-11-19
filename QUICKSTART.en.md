# Daily workflow · 0.4.6

[简体中文](使用说明.md) · [Full guide](README.md)

1. For a new installation, open Start-ArgonDesk.cmd once to prepare the official tunnel client. Afterward use ArgonDesk.exe or a shortcut.
2. Check the HTTPS status, choose a folder and permission, then enable file access.
3. Start a fresh task in the English Gemini website. The previously verified path was Task → Argon. Type @ and select your registered app from the menu.
4. Describe what should be done in the current workspace. Review and approve the website's Allow card for writes.
5. Check Activity and the actual files.

Use **gear → Preferences** for language, tunnel/file autostart and separate file-management/command grants. Opening restores opted-in startup settings. Folder/access changes still pause immediately. Commands run as the current Windows user and can access other folders; they are not filesystem-sandboxed. Clean installs require explicit grants. Restarting refreshes the workspace ID, not the private URL. See [tool parameters and builds/tests](docs/AGENT_TOOLS.md).

For a new file, ask for one workspace lookup followed by a complete create-only write. If animation is required, explicitly request actual playback. See [usage and quality](docs/USAGE.md).

For initial setup, save your own ngrok development domain and token in Connection, then register the private URL as a custom Gemini app. Optional auto-connect restores the tunnel on launch. No old browser extension, green overlay or long Insert prompt is required.

**A manually added custom MCP app requires manual write confirmation.** A registered Connected App can configure per-tool confirmation in Google Connected Console; see the registration guide in docs.

“HTTPS online” is connection state; “Tool activity” requires an actual successful remote tool call. A handshake or a code block is not proof of file access.

Closing the panel leaves the service in the tray. Use the power button or Stop service and quit to stop it. Reload the panel after an update.

TUN depends on your network and is not a universal requirement. Routing rules determine which traffic uses a proxy. ArgonDesk does not change network settings. See the full guide for installation, boundaries and troubleshooting.
