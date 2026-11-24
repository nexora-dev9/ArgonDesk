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

export function validateDomain(value, provider = 'ngrok') {
  const text = String(value || '').trim().replace(/\/$/, '');
  const url = new URL(text.includes('://') ? text : 'https://' + text);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || url.port) {
    throw new Error(provider === 'cloudflared'
      ? '请输入 Cloudflare 隧道对应的 HTTPS 域名，不含路径或连接密钥。'
      : '请输入 ngrok 账户中的 HTTPS 开发域名，不含路径或连接密钥。');
  }
  if (provider === 'cloudflared') {
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(url.hostname)) {
      throw new Error('请输入有效的 HTTPS 域名（例如 https://desk.example.com），不含路径。');
    }
    return url.origin;
  }
  if (!/^[a-z0-9-]+\.ngrok(?:-free)?\.(?:app|dev|io)$/.test(url.hostname)) {
    throw new Error('请输入 ngrok 账户中的 HTTPS 开发域名，不含路径或连接密钥。');
  }
  return url.origin;
}

export function buildTrafficPolicy(config) {
  const allowedPaths = ['/mcp', `/mcp/${config.key}`, '/.well-known/google-connected-apps', '/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource', '/oauth/token', '/privacy', '/terms', '/help', '/favicon.ico', '/app-icon-512.png', '/app-icon.svg', '/apple-touch-icon.png'];
  const blockedExpression = allowedPaths.map(value => `req.url.path != '${value}'`).join(' && ');
  return { on_http_request: [{ expressions: [blockedExpression], actions: [{ type: 'custom-response', config: { status_code: 404, body: 'Not found', headers: { 'content-type': 'text/plain' } } }] }] };
}

function findInPath(executable) {
  const pathEnv = process.env.PATH || process.env.Path || '';
  for (const dir of pathEnv.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, executable);
    try { if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate; } catch {}
  }
  return '';
}

export class Tunnel {
  constructor({ base, stateRoot, port, getConfig, update }) {
    Object.assign(this, { base, stateRoot, port, getConfig, update });
    this.tokenPath = path.join(stateRoot, 'ngrok-token.encrypted');
    this.cfTokenPath = path.join(stateRoot, 'cloudflared-token.encrypted');
    this.child = null;
    this.status = 'stopped';
    this.error = '';
    this.connectedAt = null;
    this.generation = 0;
    this.established = false;
    this.lastVerifiedAt = null;
    this.activePublicBase = '';
    this.events = [];
  }
  provider() {
    return this.getConfig().tunnelProvider === 'cloudflared' ? 'cloudflared' : 'ngrok';
  }
  cloudflareMode() {
    return this.getConfig().cloudflareMode === 'token' ? 'token' : 'quick';
  }
  currentPublicBase() {
    if (this.provider() === 'cloudflared' && this.cloudflareMode() === 'quick') {
      return this.activePublicBase || '';
    }
    return this.activePublicBase || this.getConfig().publicBase || '';
  }
  binary(provider = this.provider()) {
    if (provider === 'cloudflared') {
      if (process.env.GEMINI_CLOUDFLARED_PATH) return process.env.GEMINI_CLOUDFLARED_PATH;
      const bundled = path.join(this.base, '.local', 'bin', 'cloudflared.exe');
      if (fs.existsSync(bundled)) return bundled;
      return findInPath('cloudflared.exe') || bundled;
    }
    return process.env.GEMINI_NGROK_PATH || path.join(this.base, '.local', 'bin', 'ngrok.exe');
  }
  info() {
    const provider = this.provider();
    const cfMode = this.cloudflareMode();
    const ngrokInstalled = fs.existsSync(this.binary('ngrok'));
    const ngrokConfigured = fs.existsSync(this.tokenPath);
    const cloudflaredInstalled = fs.existsSync(this.binary('cloudflared'));
    const cloudflaredConfigured = cfMode === 'quick' ? true : fs.existsSync(this.cfTokenPath);
    return {
      status: this.status,
      error: this.error,
      connectedAt: this.connectedAt,
      lastVerifiedAt: this.lastVerifiedAt,
      events: this.events,
      provider,
      cloudflareMode: cfMode,
      activePublicBase: this.activePublicBase,
      configured: provider === 'cloudflared' ? cloudflaredConfigured : ngrokConfigured,
      installed: provider === 'cloudflared' ? cloudflaredInstalled : ngrokInstalled,
      ngrokInstalled,
      ngrokConfigured,
      cloudflaredInstalled,
      cloudflaredConfigured,
      autoStart: !!this.getConfig().tunnelAutoStart
    };
  }
  confirmReachable(source = 'agent') {
    if (!this.child || this.child.exitCode !== null) return;
    this.status = 'online'; this.error = ''; this.established = true;
    this.connectedAt ||= new Date().toISOString();
    if (source === 'public-request') this.lastVerifiedAt = new Date().toISOString();
    this.ready?.();
  }
  async configure({ provider, cloudflareMode, domain, token, autoStart }) {
    if (this.child || this.status === 'connecting') throw new Error('请先断开外网连接，再修改连接设置。');
    const selectedProvider = provider === undefined ? this.provider() : (provider === 'cloudflared' ? 'cloudflared' : 'ngrok');
    if (selectedProvider === 'cloudflared') {
      const mode = cloudflareMode === 'token' ? 'token' : 'quick';
      if (mode === 'quick') {
        this.update({ tunnelProvider: 'cloudflared', cloudflareMode: 'quick', tunnelAutoStart: !!autoStart });
        return;
      }
      const publicBase = validateDomain(domain, 'cloudflared');
      if (token) {
        const trimmed = token.trim();
        if (trimmed.length < 40 || trimmed.length > 4096 || /\s/.test(trimmed)) {
          throw new Error('Cloudflare Tunnel Token 格式不正确，请复制完整的隧道令牌。');
        }
        fs.writeFileSync(this.cfTokenPath, await secret('Protect', trimmed));
      }
      this.update({ tunnelProvider: 'cloudflared', cloudflareMode: 'token', publicBase, tunnelAutoStart: !!autoStart });
      return;
    }
    const publicBase = validateDomain(domain, 'ngrok');
    if (token) {
      if (!/^[A-Za-z0-9_]{20,200}$/.test(token.trim())) throw new Error('Authtoken 格式不正确，请复制 ngrok 的完整令牌。');
      fs.writeFileSync(this.tokenPath, await secret('Protect', token.trim()));
    }
    this.update({ tunnelProvider: 'ngrok', publicBase, tunnelAutoStart: !!autoStart });
  }
  async start() {
    if (this.child) return this.info();
    if (this.status === 'connecting') throw new Error('正在连接，请稍候。');
    if (this.provider() === 'cloudflared') return this.#startCloudflared();
    return this.#startNgrok();
  }
  async #startCloudflared() {
    const config = this.getConfig();
    const binary = this.binary('cloudflared');
    if (!fs.existsSync(binary)) throw new Error('尚未安装 cloudflared 客户端，请先点击安装或运行 Install-Tunnel.ps1 -Provider cloudflared。');
    const mode = this.cloudflareMode();
    let publicBase = '';
    if (mode === 'token') {
      if (!fs.existsSync(this.cfTokenPath)) throw new Error('请先保存 Cloudflare Tunnel Token。');
      publicBase = validateDomain(config.publicBase, 'cloudflared');
    }
    this.status = 'connecting'; this.error = ''; this.connectedAt = null; this.established = false; this.activePublicBase = '';
    const generation = ++this.generation;
    let token = '';
    if (mode === 'token') {
      try { token = await secret('Unprotect', fs.readFileSync(this.cfTokenPath, 'utf8')); }
      catch (error) { if (generation === this.generation) { this.status = 'stopped'; this.error = error.message; } throw error; }
      if (generation !== this.generation) return this.info();
    }
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^(?:GEMINI_WORKSPACE_|GEMINI_NGROK_|NGROK_AUTHTOKEN$|CODEX_)/i.test(key)) delete env[key];
    if (mode === 'token') env.TUNNEL_TOKEN = token;
    const args = mode === 'token'
      ? ['tunnel', '--no-autoupdate', 'run']
      : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${this.port}`];
    const child = spawn(binary, args, { windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
      const timer = setTimeout(() => finish(new Error(this.error || 'Cloudflare 隧道连接超时，请检查网络或配置后重试。')), 30000);
      this.ready = () => finish();
      const pending = { stdout: '', stderr: '' };
      const pushEvent = (kind, level = 'info') => {
        this.events.push({ time: new Date().toISOString(), kind, level });
        if (this.events.length > 12) this.events.shift();
      };
      const consume = (stream, chunk) => {
        if (generation !== this.generation || this.child !== child) return;
        pending[stream] += chunk.toString();
        const lines = pending[stream].split(/\r?\n/); pending[stream] = lines.pop();
        for (const line of lines) {
          if (!line.trim()) continue;
          if (mode === 'quick') {
            const urlMatch = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
            if (urlMatch) {
              this.activePublicBase = urlMatch[0].toLowerCase();
              pushEvent('tunnel-started', 'info');
              this.confirmReachable();
              continue;
            }
          }
          if (/Registered tunnel connection/i.test(line)) {
            if (mode === 'token') this.activePublicBase = publicBase;
            pushEvent(this.established ? 'session-established' : 'tunnel-started', 'info');
            if (mode === 'token' || this.activePublicBase) this.confirmReachable();
            continue;
          }
          if (/Unregistered tunnel connection|connection.*lost|retrying connection/i.test(line)) {
            pushEvent('session-interrupted', 'warn');
            if (this.status === 'online') { this.status = 'connecting'; this.connectedAt = null; }
            continue;
          }
          if (/\bERR\b|unauthorized|invalid tunnel token|failed to sufficiently|failed to connect/i.test(line)) {
            pushEvent('agent-error', 'error');
            if (/invalid.*token|unauthorized/i.test(line)) {
              this.error = 'Cloudflare Tunnel Token 无效或已被吊销，请重新复制保存。';
            } else if (!this.established) {
              this.error = 'Cloudflare 隧道未能建立连接，请检查网络与隧道配置。';
            }
          }
        }
      };
      child.stdout.on('data', chunk => consume('stdout', chunk));
      child.stderr.on('data', chunk => consume('stderr', chunk));
      child.once('error', () => finish(new Error('cloudflared 客户端无法启动。')));
      child.once('close', () => {
        if (this.child === child) { this.child = null; this.status = 'stopped'; this.connectedAt = null; this.activePublicBase = ''; }
        finish(generation === this.generation ? new Error(this.error || 'Cloudflare 隧道连接已结束。') : null);
      });
    });
  }
  async #startNgrok() {
    const config = this.getConfig();
    if (!fs.existsSync(this.binary('ngrok'))) throw new Error('尚未安装 ngrok 客户端，请先运行安装依赖脚本。');
    if (!fs.existsSync(this.tokenPath)) throw new Error('请先保存 ngrok Authtoken。');
    const publicBase = validateDomain(config.publicBase, 'ngrok');
    this.status = 'connecting'; this.error = ''; this.connectedAt = null; this.established = false; this.activePublicBase = '';
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
    const child = spawn(this.binary('ngrok'), ['http', `http://127.0.0.1:${this.port}`, '--url', publicBase, '--inspect=false', '--config', agentPath,
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
            this.activePublicBase = publicBase;
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
        if (this.child === child) { this.child = null; this.status = 'stopped'; this.connectedAt = null; this.activePublicBase = ''; }
        finish(generation === this.generation ? new Error(this.error || 'ngrok 连接已结束。') : null);
      });
    });
  }
  async stop() {
    this.generation++;
    const child = this.child;
    if (child && child.exitCode === null) await new Promise(resolve => { child.once('close', resolve); child.kill(); });
    this.status = 'stopped'; this.connectedAt = null; this.error = ''; this.established = false; this.activePublicBase = ''; this.ready = null;
  }
}
