# Networking and tunnel choices

[简体中文](NETWORKING.zh-CN.md)

A native Gemini custom app needs a reachable HTTPS MCP endpoint. It cannot directly reach your PC's localhost. A tunnel carries the request to the local server; folder permissions remain enforced by WebAgy.

## Current support

| Route | Status in this release | Requirements and tradeoffs |
| --- | --- | --- |
| ngrok assigned development domain | Integrated and tested | Your account/token; app-managed process and status; provider quotas |
| Cloudflare Named Tunnel | Integrated | Your Cloudflare hostname and tunnel token, with the service routed to `http://127.0.0.1:3008` |
| Cloudflare Quick Tunnel | Integrated for testing | No Cloudflare account required; a new temporary hostname can require reconnecting the app in Gemini |
| Your HTTPS reverse proxy or server + reverse forwarding | Advanced design option | Maintain TLS, access restriction, forwarding and lifecycle yourself |
| Local browser extension bridge | A different architecture | Can avoid a public MCP endpoint but needs extension-mediated tool execution/compatibility |

Select the provider in **Connection**. The dashboard can install the signed official `cloudflared` client. Choose **Quick** to obtain a temporary address, or **Named** and enter your routed HTTPS hostname and tunnel token. Use the WebAgy MCP URL for the current session.

[Cloudflare Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) describes temporary addresses, no uptime guarantee and no SSE support. Use Named or ngrok when you need a stable MCP address. Local automated tests cover the Cloudflare lifecycle with a mock; verify real Gemini writes with your own provider and account.

WebCodex's provider-specific connection workflow is a useful reference, not a drop-in transport implementation for this app.

## TUN does not mean global proxy

If ordinary routing can reach ngrok reliably, no TUN is required. A browser's proxy/residential exit does not automatically apply to a separate ngrok process. Some ngrok plans reject explicit agent proxy settings.

TUN captures traffic through a virtual adapter. The active routing rules determine proxy versus direct access. A reviewed process rule can send only this installation's ngrok process through a reachable exit while domestic traffic goes direct. Check rule matches; do not infer all traffic is proxied from the TUN switch alone.

WebAgy does not change proxies, routing, DNS or Clash. Back up and inspect existing settings before a network change. Exact process-path rules may break when the installation moves. Do not copy a stranger's entire proxy configuration or switch everything to a global proxy to diagnose one process.

## Quotas and fewer requests

Google model quotas, ngrok quotas and local UI polling are different things. Check [provider usage](https://dashboard.ngrok.com/usage) and [current plan limits](https://ngrok.com/docs/pricing-limits/free-plan-limits); local counters cover only this run. A tool action can use several protocol requests.

Batch edits to one file can reduce calls and related write confirmations. Read only the relevant line range and avoid repeated full-file reads. UI polling is loopback-only and pauses while hidden. WebAgy cannot restore a model quota, eliminate the provider's own heartbeat traffic or promise a fixed saving.

## Evidence before “connected”

1. Agent/session readiness indicates a local tunnel state.
2. A successful request through the private public endpoint proves that route worked at that moment.
3. A real Gemini tool call proves website-to-tool use.
4. A user-approved write and read-back proves the complete editing path.

These are different claims. A short successful check does not establish long-running uptime.
