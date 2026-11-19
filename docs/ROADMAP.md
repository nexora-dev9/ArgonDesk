# Validation and roadmap

[简体中文](ROADMAP.zh-CN.md)

## Current preview

Implemented: eleven workspace tools, read-only/edit selection, independent command/file-management grants, pause and workspace IDs, path/link guards, native MCP JSON results, ngrok process management, startup restoration, bilingual UI/tray, audited duration/exit codes and batched CRLF/LF-compatible replacements. Commands use current-user permissions, not an OS filesystem sandbox. See [agent tools](AGENT_TOOLS.md).

0.4.2 adds optional startup file access, create-only writes with parent folders, concise model guidance and a single result payload. Isolated tests cover 27 file/MCP checks and seven startup scenarios. A response-size benchmark sends no Gemini messages; it is not a quota or creative-quality experiment. See the [usage guide](USAGE.md) and [actual hosted CI runs](https://github.com/nexora-dev9/ArgonDesk/actions).

Evidence from the current Windows installation includes real MCP fixture tests, a public-endpoint ping/tool listing, an earlier genuine Gemini approved write/read-back, and human confirmation of the folder picker. Local package, installer and UI checks are separate from hosted CI and another-PC testing.

## Known limits

Windows x64 only. No full computer control, direct binary editing, multi-workspace concurrency, Google-bound user OAuth or OS isolation for arbitrary shell commands. Confirmation settings depend on the Gemini app configuration. The integrated provider is ngrok. No long-term uptime or all-account/model compatibility claim is made. The desktop entry is unsigned.

## Iteration directions

- Test clean installs on independent Windows machines.
- Include and expand a reproducible UI regression harness.
- Prototype Cloudflare/stable HTTPS adapters and genuinely verify Gemini behavior.
- Improve first-run guidance and provider diagnostics without expanding default file authority.
- Evaluate account-bound authorization and stronger OS isolation as separate designs.
- Consider packaging/signing and other platforms after native validation.

These are directions, not delivery dates or promises. A usable, bounded first preview is preferred over claiming unfinished integrations.
