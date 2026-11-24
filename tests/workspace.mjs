import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WorkspaceFiles } from '../workspace-files.mjs';

const runtime = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(runtime, '..');
const fixture = path.join(project, '.local', 'tests', 'workspace-check-' + randomUUID().slice(0, 8));
const root = path.join(fixture, 'project');
const second = path.join(fixture, 'second');
const stateDir = path.join(fixture, 'state');
for (const directory of [root, second, stateDir]) fs.mkdirSync(directory, { recursive: true });
const outside = path.join(fixture, 'outside.txt');
fs.writeFileSync(outside, 'OUTSIDE_MUST_STAY_UNCHANGED');
const config = { root, workspaceId: randomUUID(), enabled: true, access: 'edit', key: randomUUID().replaceAll('-', ''), publicBase: 'https://public.example' };
const files = new WorkspaceFiles(config);
const args = { workspace_id: config.workspaceId, path: 'sample.txt' };
const checks = [];
function check(name, fn) { fn(); checks.push({ name, passed: true }); }
check('UTF-8 create/read/exact-edit round trip', () => {
  files.run('write_file', { ...args, content: '你好，Gemini\n原文' });
  files.run('edit_file', { ...args, old_text: '原文', new_text: '已编辑' });
  assert.equal(files.run('read_file', args).text, '你好，Gemini\n已编辑');
});
check('Authorized additional roots accept absolute paths without widening access elsewhere', () => {
  const scoped = new WorkspaceFiles({ ...config, roots: [second] });
  const target = path.join(second, 'folder', 'new.txt');
  scoped.run('write_file', { ...args, path: target, content: 'SECOND_ROOT', mode: 'create' });
  assert.equal(scoped.run('read_file', { ...args, path: target }).text, 'SECOND_ROOT');
  assert.equal(scoped.info().roots.length, 2);
  assert.throws(() => scoped.run('write_file', { ...args, path: outside, content: 'BAD' }));
  assert.throws(() => scoped.run('write_file', { ...args, path: path.join(fixture, 'outside2.txt'), content: 'BAD' }));
  assert.throws(() => scoped.resolve(second + path.sep + '..' + path.sep + 'outside.txt'));
});
check('Create-only writes make parent folders and refuse to overwrite existing content', () => {
  const target = { ...args, path: 'new/nested/result.svg', mode: 'create', content: '<svg><animate attributeName="opacity" values="0;1" dur="2s"/></svg>' };
  files.run('write_file', target);
  assert.equal(fs.readFileSync(path.join(root, target.path), 'utf8'), target.content);
  assert.throws(() => files.run('write_file', { ...target, content: 'MUST_NOT_REPLACE' }));
  assert.equal(fs.readFileSync(path.join(root, target.path), 'utf8'), target.content);
});
check('Traversal, absolute paths, ADS, device names and trailing aliases denied', () => {
  for (const target of ['../outside.txt', '..\\outside.txt', outside, 'sample.txt:stream', 'CON', 'NUL.txt', 'folder. /escape.txt', 'folder /escape.txt']) {
    assert.throws(() => files.run('write_file', { ...args, path: target, content: 'BAD' }));
  }
});
check('Directory junction cannot expose or modify files outside root', () => {
  fs.symlinkSync(fixture, path.join(root, 'junction'), 'junction');
  assert.throws(() => files.run('read_file', { ...args, path: 'junction/outside.txt' }));
  assert.throws(() => files.run('write_file', { ...args, path: 'junction/outside.txt', content: 'BAD' }));
  assert.throws(() => files.run('create_directory', { ...args, path: 'junction/unwanted' }));
});
check('Hard links cannot expose or modify an outside file', () => {
  fs.linkSync(outside, path.join(root, 'hardlink.txt'));
  assert.throws(() => files.run('read_file', { ...args, path: 'hardlink.txt' }));
  assert.throws(() => files.run('write_file', { ...args, path: 'hardlink.txt', content: 'BAD' }));
});
check('Replacing the selected root with a junction cannot redirect file tools', () => {
  const unstable = path.join(fixture, 'mutable-root');
  fs.mkdirSync(unstable);
  const scoped = new WorkspaceFiles({ ...config, root: unstable });
  fs.rmdirSync(unstable);
  fs.symlinkSync(fixture, unstable, 'junction');
  assert.throws(() => scoped.run('list_files', { ...args, path: '.' }));
  assert.throws(() => scoped.run('write_file', { ...args, path: 'outside.txt', content: 'BAD' }));
});
check('Only a unique edit match is accepted', () => {
  assert.throws(() => files.run('edit_file', { ...args, old_text: 'missing', new_text: 'BAD' }));
  files.run('write_file', { ...args, path: 'duplicate.txt', content: 'aa aa' });
  assert.throws(() => files.run('edit_file', { ...args, path: 'duplicate.txt', old_text: 'aa', new_text: 'BAD' }));
});
check('Oversized writes stay blocked while large text reads are paginated', () => {
  assert.throws(() => files.run('write_file', { ...args, content: 'x'.repeat(2 * 1024 * 1024 + 1) }));
  fs.writeFileSync(path.join(root, 'big.txt'), 'x'.repeat(2 * 1024 * 1024 + 1));
  const large = files.run('read_file', { ...args, path: 'big.txt' });
  assert.equal(large.text.length, 48000);
  assert.equal(large.has_more, true);
  assert.ok(large.next_cursor);
});
check('Batch edits apply together and a later mismatch leaves the file unchanged', () => {
  const batch = { ...args, path: 'batch.txt' };
  files.run('write_file', { ...batch, content: 'one two three' });
  const result = files.run('edit_file', { ...batch, edits: [{old_text:'one',new_text:'ONE'}, {old_text:'three',new_text:'THREE'}] });
  assert.equal(result.edits_applied, 2);
  assert.equal(files.run('read_file', batch).text, 'ONE two THREE');
  assert.throws(() => files.run('edit_file', { ...batch, edits: [{old_text:'ONE',new_text:'changed'}, {old_text:'missing',new_text:'BAD'}] }));
  assert.equal(files.run('read_file', batch).text, 'ONE two THREE');
  for (const edits of [[], Array(51).fill({old_text:'ONE',new_text:'BAD'})]) assert.throws(() => files.run('edit_file', {...batch, edits}));
  assert.throws(() => files.run('edit_file', {...batch, old_text:'ONE',new_text:'BAD',edits:[{old_text:'two',new_text:'BAD'}]}));
});
check('Read-only, pause and obsolete workspace IDs are enforced', () => {
  files.configure({ access: 'read' });
  files.config.enabled = true;
  const current = files.config.workspaceId;
  assert.throws(() => files.run('read_file', args));
  assert.equal(files.run('read_file', { ...args, workspace_id: current }).text, '你好，Gemini\n已编辑');
  assert.throws(() => files.run('write_file', { ...args, workspace_id: current, content: 'BAD' }));
  files.config.enabled = false;
  assert.throws(() => files.run('read_file', { ...args, workspace_id: current }));
  assert.throws(() => files.run('workspace_info'));
});
check('Unknown tools and shell/config commands are unavailable', () => {
  files.config.enabled = true;
  for (const name of ['start_process', 'run_shell_command', 'set_config_value', 'browser_run_code_unsafe', 'delete_file']) {
    assert.throws(() => files.run(name, { ...args, workspace_id: files.config.workspaceId }));
  }
});
check('Outside sentinel remains byte-for-byte intact', () => assert.equal(fs.readFileSync(outside, 'utf8'), 'OUTSIDE_MUST_STAY_UNCHANGED'));

fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({ ...config, enabled: false }));
const port = 3018;
const child = spawn(process.execPath, [path.join(project, 'server.mjs')], { env: { ...process.env, GEMINI_WORKSPACE_PORT: String(port), GEMINI_WORKSPACE_STATE: stateDir }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
child.stderr.on('data', value => { stderr += value; });
const client = new Client({ name: 'scoped-workspace-verifier', version: '1.0.0' });
const address = 'http://127.0.0.1:' + port;
async function post(route, value, csrf) {
  return fetch(address + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Workspace-Csrf': csrf } : {}) }, body: JSON.stringify(value) });
}
async function getPublic(route) {
  return new Promise((resolve, reject) => {
    const request = http.get(address + route, { headers: { Host: 'public.example' } }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
    });
    request.on('error', reject);
  });
}
async function postPublicForm(route, fields, authorization = '') {
  const body = new URLSearchParams(fields).toString();
  return new Promise((resolve, reject) => {
    const request = http.request(address + route, {
      method: 'POST',
      headers: { Host: 'public.example', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...(authorization ? { Authorization: authorization } : {}) }
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: text }));
    });
    request.on('error', reject);
    request.end(body);
  });
}
async function postPublicMcp(token = '', legacy = false) {
  const body = JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'oauth-test', version: '1.0' } }
  });
  return new Promise((resolve, reject) => {
    const request = http.request(address + (legacy ? '/mcp/' + config.key : '/mcp'), {
      method: 'POST',
      headers: { Host: 'public.example', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: text }));
    });
    request.on('error', reject);
    request.end(body);
  });
}
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test server did not start: ' + stderr)), 8000);
    child.once('exit', () => { clearTimeout(timeout); reject(new Error(stderr)); });
    child.stdout.on('data', value => { if (value.toString().includes('webagy')) { clearTimeout(timeout); resolve(); } });
  });
  let state = await (await fetch(address + '/api/state')).json();
  assert.equal((await post('/api/settings', { enabled: true })).status, 403);
  checks.push({ name: 'Dashboard mutations require CSRF token', passed: true });
  assert.equal((await post('/api/preferences', { language: 'en' })).status, 403);
  assert.equal((await post('/api/preferences', { language: 'invalid' }, state.csrf)).status, 400);
  assert.equal((await post('/api/preferences', { fileAutoStart: true })).status, 403);
  assert.equal((await post('/api/preferences', { fileAutoStart: 'true' }, state.csrf)).status, 400);
  assert.equal((await post('/api/preferences', { language: 'invalid', fileAutoStart: true }, state.csrf)).status, 400);
  assert.equal((await post('/api/preferences', { fileAutoStart: true }, state.csrf)).status, 200);
  const startupPreference = await (await fetch(address + '/api/state')).json();
  assert.equal(startupPreference.fileAutoStart, true);
  assert.equal(startupPreference.enabled, state.enabled);
  assert.equal(startupPreference.workspace_id, state.workspace_id);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir, 'config.json'), 'utf8')).fileAutoStart, true);
  checks.push({ name: 'Startup preference is opt-in, boolean, CSRF-protected and does not enable the current session', passed: true });
  await post('/api/preferences', { language: 'en' }, state.csrf);
  const translated = await (await fetch(address + '/api/state')).json();
  assert.equal(translated.language, 'en');
  assert.ok(state.workspace_id);
  assert.equal(translated.workspace_id, state.workspace_id);
  assert.equal(translated.workspace, state.workspace);
  assert.equal(translated.access, state.access);
  assert.equal(translated.enabled, state.enabled);
  assert.equal(JSON.parse(fs.readFileSync(path.join(stateDir,'config.json'),'utf8')).language,'en');
  assert.equal((await fetch(address+'/i18n.js')).status,200);
  checks.push({ name: 'Language preference persists without changing workspace authority and requires CSRF', passed: true });
  assert.equal((await fetch(address + '/api/state', { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await getPublic('/.well-known/google-connected-apps')).status, 404);
  const verificationJson = JSON.stringify({ verification_tokens: ['local-test-verification-token'] });
  assert.equal((await post('/api/connected-apps/verification', { verification: verificationJson }, state.csrf)).status, 200);
  const verificationState = await (await fetch(address + '/api/state')).json();
  assert.equal(verificationState.connectedAppVerificationConfigured, true);
  assert.equal(JSON.stringify(verificationState).includes('local-test-verification-token'), false);
  const verificationResponse = await getPublic('/.well-known/google-connected-apps');
  assert.equal(verificationResponse.status, 200);
  assert.deepEqual(JSON.parse(verificationResponse.body), { verification_tokens: ['local-test-verification-token'] });
  assert.equal((await post('/api/connected-apps/verification', { verification: '{"verification_tokens":[]}' }, state.csrf)).status, 400);
  for (const route of ['/privacy', '/terms', '/help', '/favicon.ico', '/app-icon-512.png', '/app-icon.svg', '/apple-touch-icon.png']) assert.equal((await getPublic(route)).status, 200);
  assert.equal((await getPublic('/api/state')).status, 403);
  checks.push({ name: 'Google domain challenge and public policy pages are reachable only on the configured public host', passed: true });
  const oauthMeta = await getPublic('/.well-known/oauth-authorization-server');
  const oauthResource = await getPublic('/.well-known/oauth-protected-resource');
  assert.equal(oauthMeta.status, 200);
  assert.equal(oauthResource.status, 200);
  const oauthMetadata = JSON.parse(oauthMeta.body);
  assert.equal(oauthMetadata.grant_types_supported.includes('client_credentials'), true);
  const resourceMetadata = JSON.parse(oauthResource.body);
  assert.equal(resourceMetadata.resource, 'https://public.example/mcp');
  const credentialsResponse = await post('/api/oauth/credentials', {}, state.csrf);
  assert.equal(credentialsResponse.status, 200);
  const credentials = await credentialsResponse.json();
  const credentialsState = await (await fetch(address + '/api/state')).json();
  assert.equal(credentialsState.oauthCredentialsConfigured, true);
  assert.equal(credentialsState.oauthClientId, credentials.clientId);
  assert.equal(JSON.stringify(credentialsState).includes(credentials.clientSecret), false);
  const tokenResponse = await postPublicForm('/oauth/token', {
    grant_type: 'client_credentials', client_id: credentials.clientId, client_secret: credentials.clientSecret, scope: 'mcp'
  });
  assert.equal(tokenResponse.status, 200);
  const token = JSON.parse(tokenResponse.body).access_token;
  assert.equal((await postPublicForm('/oauth/token', {
    grant_type: 'client_credentials', client_id: credentials.clientId, client_secret: 'wrong-secret'
  })).status, 401);
  const basic = 'Basic ' + Buffer.from(credentials.clientId + ':' + credentials.clientSecret).toString('base64');
  assert.equal((await postPublicForm('/oauth/token', { grant_type: 'client_credentials', scope: 'mcp' }, basic)).status, 200);
  assert.equal((await postPublicMcp()).status, 401);
  const authenticatedMcp = await postPublicMcp(token);
  assert.equal(authenticatedMcp.status, 200);
  assert.equal((await postPublicMcp('', true)).status, 200);
  assert.equal((await post('/api/oauth/require', { required: true }, state.csrf)).status, 200);
  assert.equal((await postPublicMcp('', true)).status, 401);
  assert.equal((await post('/api/oauth/require', { required: false }, state.csrf)).status, 200);
  assert.equal((await postPublicMcp('', true)).status, 200);
  checks.push({ name: 'Machine-to-machine OAuth token exchange and public MCP bearer enforcement', passed: true });
  const publicStatus = await new Promise((resolve, reject) => {
    const request = http.get(address + '/api/state', { headers: { Host: 'public.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
  });
  assert.equal(publicStatus, 403);
  checks.push({ name: 'Public Host and foreign Origin cannot reach dashboard settings', passed: true });
  assert.equal((await fetch(address + '/mcp/wrong-key', { method: 'POST' })).status, 404);
  checks.push({ name: 'MCP capability credential required', passed: true });
  await client.connect(new StreamableHTTPClientTransport(new URL(state.localMcp)));
  assert.equal(client.getServerVersion().name, 'WebAgy');
  assert.match(client.getInstructions(), /Preserve requested detail, animation and interactivity/);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['workspace_info', 'list_files', 'read_file', 'write_file', 'edit_file', 'create_directory', 'find_files', 'search_text', 'move_path', 'delete_path', 'run_command', 'read_skill'].sort());
  checks.push({ name: 'Real SDK handshake and twelve workspace tools', passed: true });
  assert.equal((await client.callTool({ name: 'workspace_info', arguments: {} })).isError, true);
  await post('/api/settings', { enabled: true }, state.csrf);
  const infoResult = await client.callTool({ name: 'workspace_info', arguments: {} });
  let info = JSON.parse(infoResult.content[0].text);
  assert.equal(infoResult.isError, false);
  assert.equal(infoResult.structuredContent, undefined);
  assert.equal(info.workspace, root);
  await post('/api/preferences', { language: 'zh-CN' }, state.csrf);
  const activePreference = await (await fetch(address + '/api/state')).json();
  assert.equal(activePreference.enabled, true);
  assert.equal(activePreference.workspace_id, info.workspace_id);
  checks.push({ name: 'Changing language keeps an active workspace enabled with the same ID', passed: true });
  const params = { workspace_id: info.workspace_id, path: 'http-check.txt' };
  assert.ok(!(await client.callTool({ name: 'write_file', arguments: { ...params, content: 'REAL_MCP_中文' } })).isError);
  assert.equal(JSON.parse((await client.callTool({ name: 'read_file', arguments: params })).content[0].text).text, 'REAL_MCP_中文');
  checks.push({ name: 'Real MCP file round trip within selected directory', passed: true });
  const batchResult=await client.callTool({name:'edit_file',arguments:{...params,edits:[{old_text:'REAL',new_text:'BATCH'},{old_text:'中文',new_text:'成功'}]}});
  assert.equal(batchResult.isError,false);
  assert.equal(JSON.parse(batchResult.content[0].text).edits_applied,2);
  assert.equal(fs.readFileSync(path.join(root,params.path),'utf8'),'BATCH_MCP_成功');
  checks.push({ name: 'Real MCP schema accepts multiple replacements in a single tool request', passed: true });
  const listing = await client.callTool({ name: 'list_files', arguments: { workspace_id: info.workspace_id, path: '.' } });
  assert.equal(listing.structuredContent, undefined);
  assert.ok(Array.isArray(JSON.parse(listing.content[0].text).entries));
  checks.push({ name: 'MCP results keep one canonical JSON text payload without a duplicate structured copy', passed: true });
  const beforeCreate = (await (await fetch(address + '/api/state')).json()).history.length;
  const fresh = JSON.parse((await client.callTool({ name: 'workspace_info', arguments: {} })).content[0].text);
  const animated = '<svg xmlns="http://www.w3.org/2000/svg"><style>@keyframes strum{to{transform:rotate(12deg)}}.hand{animation:strum .3s infinite alternate}</style><g class="hand"><path d="M1 1L20 20"/></g></svg>';
  const created = await client.callTool({ name: 'write_file', arguments: { workspace_id: fresh.workspace_id, path: 'art/guitar.svg', content: animated, mode: 'create' } });
  assert.equal(created.isError, false);
  assert.equal(fs.readFileSync(path.join(root, 'art/guitar.svg'), 'utf8'), animated);
  const afterCreate = (await (await fetch(address + '/api/state')).json()).history.slice(beforeCreate);
  assert.deepEqual(afterCreate.map(item => item.name), ['workspace_info', 'write_file']);
  checks.push({ name: 'Two real MCP calls can create an animated SVG without listing, reading or losing animation', passed: true });
  assert.equal((await client.callTool({ name: 'write_file', arguments: { workspace_id: fresh.workspace_id, path: 'art/guitar.svg', content: 'BAD', mode: 'create' } })).isError, true);
  assert.equal(fs.readFileSync(path.join(root, 'art/guitar.svg'), 'utf8'), animated);
  checks.push({ name: 'Real MCP create mode rejects collisions and leaves the original bytes intact', passed: true });
  assert.equal((await client.callTool({ name: 'write_file', arguments: { ...params, path: '../outside.txt', content: 'BAD' } })).isError, true);
  assert.equal((await client.callTool({ name: 'write_file', arguments: { ...params, path: 'junction/outside.txt', content: 'BAD' } })).isError, true);
  assert.equal((await client.callTool({ name: 'start_process', arguments: {} })).isError, true);
  checks.push({ name: 'Real MCP traversal, junction escape and shell calls denied', passed: true });
  await post('/api/settings', { access: 'read' }, state.csrf);
  await post('/api/settings', { enabled: true }, state.csrf);
  info = JSON.parse((await client.callTool({ name: 'workspace_info', arguments: {} })).content[0].text);
  assert.equal((await client.callTool({ name: 'write_file', arguments: { ...params, workspace_id: info.workspace_id, content: 'BAD' } })).isError, true);
  assert.equal((await client.callTool({ name: 'read_file', arguments: params })).isError, true);
  checks.push({ name: 'Real MCP read-only mode and stale workspace IDs enforced', passed: true });
  await post('/api/settings', { root: second, access: 'edit' }, state.csrf);
  state = await (await fetch(address + '/api/state')).json();
  assert.equal(state.workspace, second);
  assert.equal(state.enabled, false);
  checks.push({ name: 'Switching selected folder rotates workspace ID and pauses requests', passed: true });
  assert.equal(fs.readFileSync(outside, 'utf8'), 'OUTSIDE_MUST_STAY_UNCHANGED');
  const report = { checkedAt: new Date().toISOString(), realGeminiMessagesSent: 0, fixture, toolCount: tools.length, toolSchemaCharacters: JSON.stringify(tools).length, outsideFileUnchanged: true, passed: true, checks };
  fs.writeFileSync(path.join(project, '.local/test-results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: true, checks: checks.length, toolCount: tools.length, toolSchemaCharacters: report.toolSchemaCharacters, realGeminiMessagesSent: 0 }));
} finally {
  await client.close().catch(() => {});
  await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); });
}
