# Troubleshooting

[简体中文](TROUBLESHOOTING.zh-CN.md)

## I cannot find custom apps

Confirm the [official account requirements](https://support.google.com/gemini/answer/17209137) and use the English website. A local UI language change does not change Gemini. The feature may be unavailable for your account; the workbench cannot unlock it.

## @WebAgy stays ordinary text

Type @, then choose the app from the site's menu. Use the name you registered; manual spelling and font color do not prove a connection. Refresh after adding the app. An old Insert conversation may need a new task.

## Gemini prints a black function-call block and stops

That is text, not proof of execution. Native calls should produce real tool cards/results and a new Activity entry. Remove the old extension workflow from this task; use a fresh native custom-app task. The verified path was English Task with Argon; availability can change.

## It keeps asking Allow

For a manually added custom MCP app, Gemini requires manual confirmation for every write. To remove per-write prompts, use the registered Connected Apps Platform route and clear User confirmation required for write_file, edit_file and create_directory in Connected Console. See the [registration guide](CONNECTED_APPS_PLATFORM.md). WebAgy does not auto-click or disguise write tools as read-only.

## Tunnel connecting / online but files do not change

Inspect Connection → Advanced events and the current error. Verify domain/token and network reachability. Reconnection and successful public responses clear stale errors; a real persistent error still needs diagnosis. Do not assume an enabled TUN guarantees reachability.

If the tunnel is online, check file access is enabled, the correct folder/permission is selected and the task uses the current workspace ID. Handshakes and tool discovery are separate from successful remote file calls. Review failed Activity entries.

## TUN and domestic sites

TUN alone does not imply global proxy. Inspect rules and actual connection matches. A browser proxy does not automatically route the ngrok process. WebAgy changes none of those settings. See [Networking](NETWORKING.md).

## First-run download or signature failure

Start-WebAgy.cmd runs Install-Tunnel.ps1 when the client is absent. It needs access to the official download and certificate validation. Inspect the error, download source and Windows policy. Do not skip signature verification. Public ZIPs intentionally do not contain ngrok.

For a source build, install Node.js 22+, run Setup.ps1 and Build.ps1. Keep all extracted files together. If port 3008 is occupied, identify its owner rather than killing every Node process.

## A request is denied after switching folders

That is expected: access paused and the ID changed. Enable the new folder locally, then query workspace_info again. Read-only mode rejects writes even if Gemini asks for them. Never broaden the folder to work around a denied path.

## Unsupported paths or files

Use ordinary UTF-8 files up to 2 MiB and relative paths. Parent traversal, absolute paths, device names, NTFS streams and links are blocked. read_file supports up to 1000 lines per request. Exact replacements must match once. If any batch replacement fails, reread the relevant section; no replacement in that batch is written.

## Quota exhausted / connection key exposed

Model and tunnel quotas are separate; the workbench cannot reset them. Check the actual provider dashboard. For an exposed private URL, rotate the key locally and update the URL in Gemini. Do not share raw state or logs in an issue.

## What to include in an issue

App/Windows versions, the failing step, expected/observed behavior, sanitized error codes and a synthetic reproduction. Exclude private URLs, tokens, email addresses, real paths, browser data and personal file contents.
