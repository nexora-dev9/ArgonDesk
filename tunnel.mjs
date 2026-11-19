import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
function secret(mode, value) {
  return new Promise((resolve, reject) => {
    const child = spawn(powershell, ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./secret.ps1', import.meta.url)), '-Mode', mode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    child.stdout.on('data', chunk => output.push(chunk));
    child.stderr.resume();
    child.on('error', () => reject(new Error('无法调用 Windows 密钥保护。')));
    child.on('close', code => code === 0 ? resolve(Buffer.concat(output).toString('utf8').trim()) : reject(new Error('无法读取或保存此 Windows 用户的密钥。')));
    child.stdin.end(value);
  });
}
export const protectSecret = value => secret('Protect', value);
export const unprotectSecret = value => secret('Unprotect', value);
export function validateDomain(value) {
  const text = value.trim().replace(/\/$/, '');
  const url = new URL(text.includes('://') ? text : 'https://' + text);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port ||
      !/^[a-z0-9-]+\.ngrok(?:-free)?\.(?:app|dev|io)$/.test(url.hostname)) throw new Error('请输入 ngrok 账户中的 HTTPS 开发域名，不含路径或连接密钥。');
  return url.origin;
}
export function buildTrafficPolicy(config) {
  const allowedPaths = ['/mcp', `/mcp/${config.key}`, '/.well-known/google-connected-apps', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/oauth/token', '/privacy', '/terms', '/help'];
  const blockedExpression = allowedPaths.map(value => `req.url.path != '${value}'`).join(' && ');
  return { on_http_request: [{ expressions: [blockedExpression], actions: [{ type: 'custom-response', config: { status_code: 404, body: 'Not found', headers: { 'content-type': 'text/plain' } } }] }] };
}
export class Tunnel {
  constructor({ base, stateRoot, port, getConfig, update }) {
    Object.assign(this, { base, stateRoot, port, getConfig, update });
    this.tokenPath = path.join(stateRoot, 'ngrok-token.encrypted');
    this.child = null;
    this.status = 'stopped';
    this.error = '';
    this.connectedAt = null;
    this.generation = 0;
    this.established = false;
    this.lastVerifiedAt = null;
    this.events = [];
  }
  info() {
    return { status: this.status, error: this.error, connectedAt: this.connectedAt, lastVerifiedAt: this.lastVerifiedAt, events: this.events,
      configured: fs.existsSync(this.tokenPath), installed: fs.existsSync(this.binary()), autoStart: !!this.getConfig().tunnelAutoStart };
  }
  binary() { return process.env.GEMINI_NGROK_PATH || path.join(this.base, '.local', 'bin', 'ngrok.exe'); }
  confirmReachable(source = 'agent') {
    if (!this.child || this.child.exitCode !== null) return;
    this.status = 'online'; this.error = ''; this.established = true;
    this.connectedAt ||= new Date().toISOString();
    if (source === 'public-request') this.lastVerifiedAt = new Date().toISOString();
    this.ready?.();
  }
  async configure({ domain, token, autoStart }) {
    if (this.child || this.status === 'connecting') throw new Error('请先断开外网连接，再修改连接设置。');
    const publicBase = validateDomain(domain);
    if (token) {
      if (!/^[A-Za-z0-9_]{20,200}$/.test(token.trim())) throw new Error('Authtoken 格式不正确，请复制 ngrok 的完整令牌。');
      fs.writeFileSync(this.tokenPath, await secret('Protect', token.trim()));
    }
    this.update({ publicBase, tunnelAutoStart: !!autoStart });
  }
  async start() {
    if (this.child) return this.info();
    if (this.status === 'connecting') throw new Error('正在连接，请稍候。');
    const config = this.getConfig();
    if (!fs.existsSync(this.binary())) throw new Error('尚未安装 ngrok 客户端，请先运行安装依赖脚本。');
    if (!fs.existsSync(this.tokenPath)) throw new Error('请先保存 ngrok Authtoken。');
    const publicBase = validateDomain(config.publicBase);
    this.status = 'connecting'; this.error = ''; this.connectedAt = null; this.established = false;
    const generation = ++this.generation;
    let token;
    try { token = await secret('Unprotect', fs.readFileSync(this.tokenPath, 'utf8')); }
    catch (error) { if (generation === this.generation) { this.status = 'stopped'; this.error = error.message; } throw error; }
    if (generation !== this.generation) return this.info();
    const policyPath = path.join(this.stateRoot, 'tunnel-policy.json');
    const agentPath = path.join(this.stateRoot, 'ngrok-agent.yml');
    fs.writeFileSync(policyPath, JSON.stringify(buildTrafficPolicy(config)));
    fs.writeFileSync(agentPath, 'version: 3\nagent:\n  web_addr: false\n  update_check: false\n  remote_management: false\n');
    const env = { ...process.env, NGROK_AUTHTOKEN: token };
    // Avoid ngrok's paid explicit HTTP proxy mode; OS routing may still select an egress.
    for (const key of Object.keys(env)) if (/^(?:(?:https?|all)_proxy(?:_env)?|ngrok_proxy_url)$/i.test(key)) delete env[key];
    const child = spawn(this.binary(), ['http', `http://127.0.0.1:${this.port}`, '--url', publicBase, '--inspect=false', '--config', agentPath,
      '--traffic-policy-file', policyPath, '--log', 'stdout', '--log-format', 'json'], {
      windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child = child;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = error => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (this.child === child) this.ready = null;
        if (error) { this.error = error.message; child.kill(); reject(error); }
        else resolve(this.info());
      };
      const timer = setTimeout(() => finish(new Error(this.error || 'ngrok 连接超时，请检查网络或账户设置后重试。')), 25000);
      this.ready = () => finish();
      const pending = { stdout: '', stderr: '' };
      const consume = (stream, chunk) => {
        if (generation !== this.generation || this.child !== child) return;
        pending[stream] += chunk.toString();
        const lines = pending[stream].split(/\r?\n/); pending[stream] = lines.pop();
        for (const line of lines) {
          let event; try { event = JSON.parse(line); } catch { continue; }
          const code = JSON.stringify(event).match(/ERR_NGROK_\d+/)?.[0];
          const kind = event.msg === 'started tunnel' ? 'tunnel-started'
            : ['client session established', 'tunnel session started'].includes(event.msg) ? 'session-established'
            : /heartbeat|session.*(?:closed|failed|reconnect)/i.test(event.msg || '') ? 'session-interrupted'
            : ['eror', 'error', 'crit'].includes(event.lvl) ? 'agent-error' : 'agent-event';
          this.events.push({ time: new Date().toISOString(), kind, level: event.lvl || 'info', ...(code ? { code } : {}) });
          if (this.events.length > 12) this.events.shift();
          if (event.msg === 'started tunnel' && event.url === publicBase) {
            this.confirmReachable();
          }
          if (kind === 'session-established' && this.established) {
            this.confirmReachable();
          }
          if (event.lvl === 'eror' || event.lvl === 'error' || event.lvl === 'crit') {
            const sessionFailure = !this.established || code || kind === 'session-interrupted' || /session/i.test(event.obj || '');
            if (!sessionFailure) continue;
            this.error = ['ERR_NGROK_9009', 'ERR_NGROK_9010'].includes(code) ? `当前 ngrok 账户不支持客户端显式代理连接（${code}）。请使用可达的系统路由或单独配置进程分流。`
              : String(event.err || '').includes('failed to fetch CRL') ? '当前网络无法取得 ngrok 证书撤销列表，请检查 DNS 和直连网络。'
              : 'ngrok 未能建立连接' + (code ? `（${code}）` : '') + '。请检查账户令牌、域名和网络。';
            if (this.status === 'online') { this.status = 'connecting'; this.connectedAt = null; }
          }
        }
      };
      child.stdout.on('data', chunk => consume('stdout', chunk)); child.stderr.on('data', chunk => consume('stderr', chunk));
      child.once('error', () => finish(new Error('ngrok 客户端无法启动。')));
      child.once('close', () => {
        if (this.child === child) { this.child = null; this.status = 'stopped'; this.connectedAt = null; }
        finish(generation === this.generation ? new Error(this.error || 'ngrok 连接已结束。') : null);
      });
    });
  }
  async stop() {
    this.generation++;
    const child = this.child;
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('close', resolve); child.kill(); });
    this.status = 'stopped'; this.connectedAt = null; this.error = ''; this.established = false; this.ready = null;
  }
}
