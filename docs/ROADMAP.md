# Validation and roadmap

[简体中文](ROADMAP.zh-CN.md)

## Current preview

WebAgy 1.0 includes 12 tools, local Skills, snapshots, per-folder read-only permissions, and ngrok or Cloudflare Tunnel. The interface defaults to English and remembers the selected language. See [agent tools](AGENT_TOOLS.md) and [release changes](../CHANGELOG.md).

0.4.2 adds optional startup file access, create-only writes with parent folders, concise model guidance and a single result payload. Isolated tests cover 27 file/MCP checks and seven startup scenarios. A response-size benchmark sends no Gemini messages; it is not a quota or creative-quality experiment. See the [usage guide](USAGE.md) and [actual hosted CI runs](https://github.com/nexora-dev9/WebAgy/actions).

Evidence from the current Windows installation includes real MCP fixture tests, a public-endpoint ping/tool listing, an earlier genuine Gemini approved write/read-back, and human confirmation of the folder picker. Local package, installer and UI checks are separate from hosted CI and another-PC testing.

## Known limits

The app targets Windows x64. Confirmations depend on the Gemini app configuration. Cloudflare support is covered locally with mocked clients, and live routes depend on each user's network and hostname. The desktop entry is unsigned.

## Iteration directions

- Test clean installs on independent Windows machines.
- Include and expand a reproducible UI regression harness.
- Prototype Cloudflare/stable HTTPS adapters and genuinely verify Gemini behavior.
- Improve first-run guidance and provider diagnostics without expanding default file authority.
- Evaluate account-bound authorization and stronger OS isolation as separate designs.
- Consider packaging/signing and other platforms after native validation.

These are directions, not delivery dates or promises. A usable, bounded first preview is preferred over claiming unfinished integrations.
