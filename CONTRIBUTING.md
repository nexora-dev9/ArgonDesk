# Contributing

[简体中文](CONTRIBUTING.zh-CN.md)

WebAgy is an MIT-licensed preview. Focused fixes, reproducible reports, documentation and narrowly tested integrations are welcome. See the [roadmap](docs/ROADMAP.md) before proposing a large change.

Use Windows x64, Node.js 22+, PowerShell 5.1, .NET Framework 4.x and Edge. Run `npm ci --ignore-scripts`, then `npm test`. Build the desktop entry with `.\Build.ps1`; `.\Setup.ps1` also downloads and verifies the ngrok client.

Checks:
- `npm test`: synthetic fixtures, real MCP handshake and file operations, denied escapes and batch failures.
- `node tests/tunnel.mjs`: domain validation and current-user DPAPI.
- `node tests/tunnel-lifecycle.mjs`: compiled mock client; no external connection or real account.
- `.\Pack.ps1`: release allowlist and private-state checks.

Tests write to `.local/tests`. Use the same Windows user for DPAPI protect/unprotect. Do not weaken credential protection to bypass a test failure.

Read the relevant code first. Tie each change to a concrete problem. Preserve default pause, read-only enforcement, ID rotation, path guards, local-only settings and truthful connection status. Test actual behavior.

For a tunnel provider, distinguish documentation research, protocol checks and a real Gemini confirmation/write/read-back test. Forwarding HTTP alone does not establish full support.

A PR should explain the trigger, resulting behavior, checks and unverified limits. Use synthetic files and demonstration screenshots. Exclude credentials, real paths, private URLs and personal conversations.

Public packages include Node.js/runtime dependencies, but not ngrok; `Start-WebAgy.cmd` downloads the signed client from the official source. Build with the intended Node version and retain its matching license. Generated `dist/`, `.local/`, `node_modules/` and EXEs stay out of source commits.

Contributions use MIT. Retain third-party provenance and licenses. Do not copy another project's UI assets or claim ownership of service clients.
