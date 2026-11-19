import { translate } from './i18n.js';
let state, diagnostics, currentPage = 'workspace', activityFilter = 'all', formLoaded = false, stopped = false, refreshing = false, toastTimer;
let language = localStorage.getItem('argondesk.language') === 'en' ? 'en' : 'zh-CN';
const busy = new Set();
const element = id => document.getElementById(id);
const text = (key, variables) => translate(key, language, variables);
const time = value => new Date(value).toLocaleTimeString(language === 'en' ? 'en-GB' : 'zh-CN', { hour12: false });
function applyLanguage() {
  document.documentElement.lang = language;
  document.title = language === 'en' ? 'ArgonDesk — Gemini Workspace' : 'ArgonDesk — Gemini 工作台';
  localStorage.setItem('argondesk.language', language);
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = text(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(node => node.setAttribute('aria-label', text(node.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = text(node.dataset.i18nPlaceholder); });
  element('page-breadcrumb').textContent = text(currentPage);
  element('language').value = language;
  renderDiagnostics();
}
function errorText(value) {
  if (language !== 'en' || !/[\u3400-\u9fff]/.test(value || '')) return value || text('genericError');
  if (/ERR_NGROK_90(?:09|10)/.test(value)) return 'This ngrok account does not support an explicit client proxy. Use a reachable route or process routing.';
  if (/ngrok.*(?:域名|HTTPS)|请输入.*域名/.test(value)) return 'Enter the HTTPS development domain assigned by ngrok, without a path or secret.';
  if (/连接超时/.test(value)) return 'ngrok connection timed out. Check the network and account settings.';
  if (/证书撤销列表/.test(value)) return 'The network could not retrieve the ngrok certificate revocation list. Check DNS and connectivity.';
  if (/ngrok.*未能建立连接/.test(value)) return 'ngrok could not connect. Check the account, domain and network.' + (value.match(/ERR_NGROK_\d+/)?.[0] || '');
  if (/请先断开/.test(value)) return 'Disconnect before changing connection settings.';
  if (/正在连接/.test(value)) return 'A connection is already in progress.';
  if (/安装.*ngrok|尚未安装/.test(value)) return 'Install the ngrok client first.';
  if (/Authtoken.*格式/.test(value)) return 'Enter the complete ngrok Authtoken.';
  if (/保存.*Authtoken/.test(value)) return 'Save your ngrok Authtoken first.';
  if (/密钥/.test(value)) return 'Windows could not read or save the encrypted account token.';
  return text('genericError');
}
function message(value) {
  clearTimeout(toastTimer); element('message').textContent = value; element('message').hidden = false;
  toastTimer = setTimeout(() => { element('message').hidden = true; }, 5500);
}
function navigate(page) {
  if (!['workspace', 'connection', 'activity'].includes(page)) page = 'workspace';
  currentPage = page;
  document.querySelectorAll('.page').forEach(node => { node.hidden = node.id !== 'page-' + page; });
  document.querySelectorAll('nav [data-page]').forEach(node => {
    node.classList.toggle('active', node.dataset.page === page);
    if (node.dataset.page === page) node.setAttribute('aria-current', 'page'); else node.removeAttribute('aria-current');
  });
  element('page-breadcrumb').textContent = text(page);
  if (location.hash !== '#' + page) history.replaceState(null, '', '#' + page);
  window.scrollTo({ top: 0 });
}
async function api(route, data) {
  const response = await fetch('/api/' + route, data === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Workspace-Csrf': state?.csrf || '' }, body: JSON.stringify(data)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(errorText(result.error));
  return result;
}
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', name); svg.append(use); return svg;
}
function renderHistory(target, items, preview = false) {
  const box = element(target); box.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state'; empty.append(icon('#i-activity'));
    const content = document.createElement('div'), title = document.createElement('strong'), detail = document.createElement('p');
    title.textContent = text(activityFilter === 'failed' && !preview ? 'noFailures' : 'noActivity');
    detail.textContent = text('noActivityHelp'); content.append(title, detail); empty.append(content); box.append(empty); return;
  }
  for (const item of items) {
    const row = document.createElement('div'); row.className = 'event' + (item.ok ? '' : ' failed');
    const symbol = document.createElement('div'); symbol.className = 'event-symbol'; symbol.append(icon(item.ok ? '#i-check' : '#i-info'));
    const content = document.createElement('div'), title = document.createElement('div'), path = document.createElement('div');
    const toolTitle = text('tool_' + item.name);
    title.className = 'event-title'; title.textContent = (toolTitle.startsWith('tool_') ? item.name : toolTitle) + (item.edits > 1 ? ' · ' + text('changes', { count: item.edits }) : '');
    path.className = 'event-path';
    const relative = item.path === '.' ? '' : item.path;
    path.textContent = preview ? relative || text('currentFolder') : item.workspace ? item.workspace.replace(/[\\/]$/, '') + (relative ? '\\' + relative : '') : relative || text('currentFolder');
    if (item.dst) path.textContent += ' → ' + item.dst;
    content.append(title, path);
    if (item.command || item.pattern || item.query) {
      const detail = document.createElement('div'); detail.className = 'event-detail';
      detail.textContent = item.command || item.pattern || item.query; content.append(detail);
    }
    if (item.error && !preview) {
      const error = document.createElement('div'); error.className = 'event-error'; error.textContent = item.error; content.append(error);
    }
    const meta = document.createElement('div'); meta.className = 'event-meta';
    if (Number.isFinite(item.duration_ms)) {
      const duration = document.createElement('span');
      duration.textContent = item.duration_ms < 1000 ? item.duration_ms + ' ms' : (item.duration_ms / 1000).toFixed(1) + ' s'; meta.append(duration);
    }
    if (Number.isInteger(item.exit_code)) {
      const exit = document.createElement('span'); exit.textContent = text('exitCode', { code: item.exit_code }); meta.append(exit);
    }
    if (meta.childNodes.length) content.append(meta);
    const clock = document.createElement('time'); clock.dateTime = item.time; clock.title = new Date(item.time).toLocaleString(language === 'en' ? 'en-GB' : 'zh-CN', { hour12: false }); clock.textContent = time(item.time);
    row.append(symbol, content);
    const label = document.createElement('span'); label.className = item.ok ? 'event-status' : 'event-failed'; label.textContent = text(item.ok ? 'succeeded' : item.status || 'denied'); row.append(label);
    row.append(clock); box.append(row);
  }
}
function render() {
  if (!state || stopped) return;
  if (language !== state.language) { language = state.language === 'en' ? 'en' : 'zh-CN'; applyLanguage(); }
  document.querySelectorAll('button,select,input').forEach(node => { node.disabled = false; });
  const online = state.tunnel.status === 'online', connecting = state.tunnel.status === 'connecting';
  const statusKey = online ? 'online' : connecting ? 'connecting' : state.tunnel.error ? 'retryNeeded' : 'stopped';
  const folder = state.workspace.replace(/[\\/]$/, '').split(/[\\/]/).pop() || state.workspace;
  element('folder-name').textContent = folder; element('sidebar-folder').textContent = folder;
  element('root').textContent = state.workspace; element('root').title = state.workspace; element('access').value = state.access;
  element('status-text').textContent = text(state.enabled ? 'enabled' : 'paused');
  element('file-auto-start').checked = state.fileAutoStart === true;
  element('tunnel-auto-start').checked = state.tunnel.autoStart === true;
  element('allow-file-management').checked = state.allow_file_management === true;
  element('allow-commands').checked = state.allow_commands === true;
  element('enabled-description').textContent = text(state.enabled ? 'enabledHelp' : 'pausedHelp');
  element('access-state').classList.toggle('enabled', state.enabled);
  element('toggle').lastElementChild.textContent = text(state.enabled ? 'pause' : 'enable');
  element('toggle').firstElementChild.firstElementChild.setAttribute('href', state.enabled ? '#i-pause' : '#i-play');
  element('home-tunnel-status').textContent = text(statusKey);
  element('home-tunnel-detail').textContent = text(online ? 'tunnelOnlineHelp' : connecting ? 'tunnelConnectingHelp' : 'tunnelStoppedHelp');
  element('home-tunnel-dot').classList.toggle('online', online); element('home-tunnel-dot').classList.toggle('pending', connecting);
  const lastTool = state.traffic.lastToolAt;
  element('home-tool-status').textContent = text(lastTool ? 'responded' : 'waiting');
  element('home-tool-detail').textContent = lastTool ? text('lastTool', { time: time(lastTool) }) : text(state.traffic.lastRequestAt ? 'handshakeOnly' : 'waitingHelp');
  element('home-tool-dot').classList.toggle('online', !!lastTool);
  element('tunnel-badge').textContent = text(statusKey); element('tunnel-badge').classList.toggle('online', online);
  element('nav-connection-dot').classList.toggle('online', online);
  element('connection-status').textContent = state.tunnel.error ? errorText(state.tunnel.error) : text(online ? 'tunnelOnlineHelp' : connecting ? 'tunnelConnectingHelp' : state.tunnel.configured ? 'configuredHelp' : 'notConfiguredHelp');
  element('connection-status').classList.toggle('ready', online); element('connection-status').classList.toggle('error', !!state.tunnel.error);
  element('tunnel-toggle').lastElementChild.textContent = text(online ? 'stopTunnel' : connecting ? 'cancelTunnel' : 'startTunnel');
  element('copy-link').disabled = !online;
  element('tunnel-save').disabled = connecting || online;
  for (const id of ['domain', 'authtoken', 'auto-start']) element(id).disabled = connecting || online;
  element('credential-badge').textContent = text(state.tunnel.configured ? 'configured' : 'unconfigured');
  element('credential-badge').classList.toggle('online', state.tunnel.configured);
  element('token-status').textContent = text(state.tunnel.configured ? 'savedToken' : 'unsavedToken');
  element('public-url').textContent = state.publicMcp || text('notConfiguredHelp');
  element('connected-app-verification-url').textContent = state.publicBase ? state.publicBase + '/.well-known/google-connected-apps' : text('verificationDomainMissing');
  element('connected-app-badge').textContent = text(state.connectedAppVerificationConfigured ? 'verificationConfigured' : 'verificationMissing');
  element('connected-app-badge').classList.toggle('online', state.connectedAppVerificationConfigured);
  element('connected-app-verification-status').textContent = text(state.connectedAppVerificationConfigured ? 'verificationStored' : 'verificationNotStored');
  element('oauth-badge').textContent = text(state.oauthCredentialsConfigured ? 'oauthConfigured' : 'oauthMissing');
  element('oauth-badge').classList.toggle('online', state.oauthCredentialsConfigured);
  element('oauth-client-id-value').textContent = state.oauthClientId || text('oauthNotConfigured');
  element('oauth-token-endpoint-value').textContent = state.oauthTokenEndpoint || text('verificationDomainMissing');
  element('registered-mcp-value').textContent = state.registeredMcp || text('verificationDomainMissing');
  element('oauth-status').textContent = text(state.oauthCredentialsConfigured ? 'oauthStored' : 'oauthNotStored');
  element('oauth-required').checked = state.oauthRequired === true;
  element('oauth-required').disabled = !state.oauthCredentialsConfigured;
  element('request-count').textContent = state.traffic.requests.toLocaleString(language);
  element('response-size').textContent = state.traffic.responseBytes >= 1048576 ? (state.traffic.responseBytes / 1048576).toFixed(2) + ' MB' : (state.traffic.responseBytes / 1024).toFixed(1) + ' KB';
  element('last-request').textContent = state.traffic.lastRequestAt ? time(state.traffic.lastRequestAt) : text('none');
  element('tunnel-events').textContent = (state.tunnel.events || []).map(item => time(item.time) + '  ' + item.kind + (item.code ? '  ' + item.code : '')).join('\n') || text('noEvents');
  element('protocol-log').textContent = state.traffic.protocol.map(item => time(item.time) + '  ' + item.method + '  ' + item.status).join('\n') || text('noEvents');
  if (!formLoaded) { element('domain').value = state.publicBase || ''; element('auto-start').checked = state.tunnel.autoStart; formLoaded = true; }
  const items = [...state.history].reverse();
  element('nav-history-count').textContent = items.length; element('activity-count').textContent = text('records', { count: items.length });
  renderHistory('recent-history', items.slice(0, 1), true);
  renderHistory('history', activityFilter === 'failed' ? items.filter(item => !item.ok) : items);
  for (const id of busy) { const node = element(id); if (node) node.disabled = true; }
}
async function refresh() {
  if (stopped || refreshing) return;
  refreshing = true;
  try {
    state = await api('state'); element('offline-banner').hidden = true; render();
    element('service-label').textContent = text('localOnline'); element('service-dot').style.background = '';
  } catch (error) {
    element('offline-banner').hidden = false; element('offline-banner').textContent = text('offlineHelp');
    element('service-label').textContent = text('localOffline'); element('service-dot').style.background = '#c99c6a';
    document.querySelectorAll('button,select,input').forEach(node => { node.disabled = true; }); throw error;
  } finally { refreshing = false; }
}
async function perform(id, action) {
  if (busy.has(id)) return;
  const node = element(id); busy.add(id); node.disabled = true; node.classList.add('busy');
  try { await action(); } catch (error) { message(errorText(error.message)); }
  finally { busy.delete(id); node.classList.remove('busy'); if (!stopped) { node.disabled = false; await refresh().catch(() => {}); render(); } }
}
function confirmAction(title, description, label) {
  return new Promise(resolve => {
    const dialog = element('confirm-dialog');
    element('confirm-title').textContent = title; element('confirm-description').textContent = description; element('confirm-ok').textContent = label;
    element('confirm-cancel').onclick = () => dialog.close('cancel'); element('confirm-ok').onclick = () => dialog.close('confirm');
    dialog.returnValue = ''; dialog.onclose = () => resolve(dialog.returnValue === 'confirm'); dialog.showModal();
  });
}
document.querySelectorAll('[data-page]').forEach(node => node.addEventListener('click', () => navigate(node.dataset.page)));
document.querySelectorAll('[data-preferences]').forEach(node => node.addEventListener('click', () => element('preferences-dialog').showModal()));
element('preferences-close').onclick = () => element('preferences-dialog').close();
element('language').addEventListener('change', event => perform('language', async () => {
  await api('preferences', { language: event.target.value });
}));
for (const [id, key] of [['file-auto-start', 'fileAutoStart'], ['tunnel-auto-start', 'tunnelAutoStart'], ['allow-file-management', 'allowFileManagement'], ['allow-commands', 'allowCommands']]) {
  element(id).addEventListener('change', event => perform(id, async () => {
    await api('preferences', { [key]: event.target.checked });
    if (key === 'tunnelAutoStart') element('auto-start').checked = event.target.checked;
  }));
}
document.querySelectorAll('[data-filter]').forEach(node => node.addEventListener('click', () => {
  activityFilter = node.dataset.filter;
  document.querySelectorAll('[data-filter]').forEach(button => button.classList.toggle('active', button === node)); render();
}));
element('choose').onclick = () => perform('choose', async () => { const result = await api('choose', {}); if (!result.cancelled) message(text('folderChanged')); });
element('copy-root').onclick = () => perform('copy-root', async () => { await navigator.clipboard.writeText(state.workspace); message(text('pathCopied')); });
element('toggle').onclick = () => perform('toggle', () => api('settings', { enabled: !state.enabled }));
element('access').addEventListener('change', event => perform('access', async () => { await api('settings', { access: event.target.value }); message(text('permissionChanged')); }));
element('copy-link').onclick = () => perform('copy-link', async () => { if (state.tunnel.status !== 'online') return; await navigator.clipboard.writeText(state.publicMcp); message(text('linkCopied')); });
element('connection-form').addEventListener('submit', event => {
  event.preventDefault();
  perform('tunnel-save', async () => { await api('tunnel/configure', { domain: element('domain').value, token: element('authtoken').value, autoStart: element('auto-start').checked }); element('authtoken').value = ''; formLoaded = false; message(text('settingsSaved')); });
});
element('connected-app-form').addEventListener('submit', event => {
  event.preventDefault();
  perform('connected-app-save', async () => {
    await api('connected-apps/verification', { verification: element('connected-app-verification').value });
    element('connected-app-verification').value = '';
    message(text('verificationSaved'));
  });
});
element('copy-verification-url').onclick = () => perform('copy-verification-url', async () => {
  if (!state.publicBase) return message(text('verificationDomainMissing'));
  await navigator.clipboard.writeText(state.publicBase + '/.well-known/google-connected-apps');
  message(text('verificationUrlCopied'));
});
element('oauth-generate').onclick = () => perform('oauth-generate', async () => {
  if (state.oauthCredentialsConfigured && !await confirmAction(text('oauthRotateTitle'), text('oauthRotateDescription'), text('oauthGenerate'))) return;
  const result = await api('oauth/credentials', {});
  element('oauth-new-client-id').textContent = result.clientId;
  element('oauth-new-client-secret').textContent = result.clientSecret;
  element('oauth-new-token-endpoint').textContent = result.tokenEndpoint;
  element('oauth-result').hidden = false;
  message(text('oauthGenerated'));
});
element('copy-registered-mcp').onclick = () => perform('copy-registered-mcp', async () => {
  if (state.registeredMcp) { await navigator.clipboard.writeText(state.registeredMcp); message(text('registeredMcpCopied')); }
});
element('oauth-required').addEventListener('change', event => perform('oauth-required', async () => {
  const required = event.target.checked;
  if (required && !await confirmAction(text('oauthRequireTitle'), text('oauthRequireDescription'), text('oauthRequire'))) return;
  await api('oauth/require', { required });
  message(text(required ? 'oauthRequiredOn' : 'oauthRequiredOff'));
}));
for (const [buttonId, valueId, messageKey] of [
  ['copy-oauth-client-id', 'oauth-new-client-id', 'clientIdCopied'],
  ['copy-oauth-client-secret', 'oauth-new-client-secret', 'clientSecretCopied'],
  ['copy-oauth-token-endpoint', 'oauth-new-token-endpoint', 'tokenEndpointCopied']
]) {
  element(buttonId).onclick = () => perform(buttonId, async () => {
    const value = element(valueId).textContent;
    if (value) { await navigator.clipboard.writeText(value); message(text(messageKey)); }
  });
}
element('tunnel-toggle').onclick = () => perform('tunnel-toggle', async () => {
  if (state.tunnel.status === 'stopped') await api('tunnel/start', {});
  else { await api('tunnel/stop', {}); formLoaded = false; message(text('disconnected')); }
});
element('rotate-key').onclick = () => perform('rotate-key', async () => {
  if (!await confirmAction(text('rotateTitle'), text('rotateDescription'), text('rotate'))) return;
  await api('connection/rotate-key', {}); formLoaded = false; message(text('keyChanged'));
});
function renderDiagnostics() {
  if (!diagnostics) return;
  const box = element('diagnostic-result'); box.replaceChildren();
  const title = document.createElement('h3'); title.textContent = text('diagnosticTitle'); box.append(title);
  const english = ['Local MCP service', 'Workspace tools', 'Workspace access', 'ngrok client', 'Account token', 'HTTPS tunnel'];
  for (const [index, item] of diagnostics.checks.entries()) {
    const row = document.createElement('div'), mark = document.createElement('span'), detail = document.createElement('span');
    row.className = 'diagnostic-check'; mark.textContent = item.ok ? '✓' : '○';
    detail.textContent = language === 'en' ? english[index] + ' · ' + (item.ok ? 'OK' : 'Not ready') : item.label + ' · ' + item.detail;
    row.append(mark, detail); box.append(row);
  }
  box.hidden = false;
}
element('diagnose').onclick = () => perform('diagnose', async () => {
  diagnostics = await api('diagnostics', {}); renderDiagnostics();
  element('diagnostic-result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
element('shutdown').onclick = () => perform('shutdown', async () => {
  if (!await confirmAction(text('shutdownTitle'), text('shutdownDescription'), text('stop'))) return;
  await api('shutdown', {}); stopped = true; clearInterval(refreshTimer);
  element('service-label').textContent = text('localOffline'); element('offline-banner').hidden = false; element('offline-banner').textContent = text('stoppedHelp');
  document.querySelectorAll('button,select,input').forEach(node => { node.disabled = true; }); message(text('stoppedHelp'));
});
applyLanguage(); navigate(location.hash.slice(1));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));
refresh().catch(error => message(errorText(error.message)));
const refreshTimer = setInterval(() => { if (!document.hidden) refresh().catch(() => {}); }, 3000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh().catch(() => {}); });
