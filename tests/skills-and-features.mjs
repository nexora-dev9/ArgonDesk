import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WorkspaceFiles } from '../workspace-files.mjs';
import { SnapshotStore } from '../snapshots.mjs';
import { discoverSkills, readSkill, loadAlwaysOnRules } from '../skills.mjs';
import { Tunnel, validateDomain } from '../tunnel.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(project, '.local', 'tests', 'v047-' + randomUUID().slice(0, 8));
const root = path.join(fixture, 'workspace');
const readonlyRoot = path.join(fixture, 'reference-docs');
const fakeHome = path.join(fixture, 'home');
const customSkillsRoot = path.join(fixture, 'custom-skills');
const singleSkillDir = path.join(fixture, 'standalone-skill');
const stateDir = path.join(fixture, 'state');

for (const dir of [root, readonlyRoot, fakeHome, customSkillsRoot, singleSkillDir, stateDir]) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeSkill(baseDir, folder, frontmatter, body, extras = {}) {
  const dir = folder ? path.join(baseDir, folder) : baseDir;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
  for (const [rel, content] of Object.entries(extras)) {
    const target = path.join(dir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }
  return dir;
}

// 1. Set up isolated global, custom, and workspace skills + rules
const globalSkillsDir = path.join(fakeHome, '.agents', 'skills');
writeSkill(globalSkillsDir, 'global-word', 'name: word\ndescription: Global Word formatting skill.', '# Global Word\nUse FangSong.');
writeSkill(globalSkillsDir, 'hidden-one', 'name: hidden-one\ndescription: Should not appear.\nhidden: true', '# Hidden');
writeSkill(globalSkillsDir, 'manual-tool', 'name: triage\ndescription: Manual triage workflow.\ndisable-model-invocation: true', '# Triage');
writeSkill(globalSkillsDir, 'excluded-one', 'name: excluded-one\ndescription: Excluded by skills.json.', '# Excluded');
// Duplicate junction to verify realpath deduplication
fs.symlinkSync(path.join(globalSkillsDir, 'global-word'), path.join(globalSkillsDir, 'word-alias'), 'junction');

fs.mkdirSync(path.join(fakeHome, '.gemini', 'config'), { recursive: true });
fs.writeFileSync(
  path.join(fakeHome, '.gemini', 'config', 'skills.json'),
  JSON.stringify({ entries: [{ path: globalSkillsDir.replace(/\\/g, '/'), exclude: ['excluded-one'] }] }, null, 2),
  'utf8'
);
fs.writeFileSync(path.join(fakeHome, '.gemini', 'config', 'AGENTS.md'), '# Global Rule\nAlways be concise.', 'utf8');
fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Workspace Rule\nAlways run npm test.', 'utf8');

writeSkill(
  customSkillsRoot,
  'custom-viz',
  'name: custom-viz\ndescription: >-\n  Custom chart design\n  skill from user folder.',
  '# Custom Viz\nFollow chart rules.',
  { 'references/palette.md': 'Colorblind-safe palette.' }
);
writeSkill(singleSkillDir, '', 'name: solo-skill\ndescription: Selected directly as a single skill folder.', '# Solo Skill');
// Workspace override of 'word'
writeSkill(path.join(root, '.agents', 'skills'), 'word', 'name: word\ndescription: Workspace override Word skill.', '# Workspace Word\nOverride active.');

const checks = [];
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); }

await check('Skills discovery honors priority, skills.json exclude, hidden, manual_only, custom folders and dedupes junctions', () => {
  const cfg = { root, enableSkills: true, enableGlobalSkills: true, skillDirs: [customSkillsRoot, singleSkillDir] };
  const found = discoverSkills(cfg, { homeDir: fakeHome });
  const names = found.map(s => s.name);
  assert.ok(names.includes('word'));
  assert.ok(names.includes('custom-viz'));
  assert.ok(names.includes('solo-skill'));
  assert.ok(names.includes('triage'));
  assert.equal(names.includes('hidden-one'), false);
  assert.equal(names.includes('excluded-one'), false);
  assert.equal(found.filter(s => s.name === 'word').length, 1);
  assert.equal(found.find(s => s.name === 'word').source, 'workspace');
  assert.equal(found.find(s => s.name === 'triage').manual_only, true);
  assert.equal(found.find(s => s.name === 'custom-viz').description, 'Custom chart design skill from user folder.');

  // Also test project folder containing .agents/skills added via skillDirs and additional authorized roots
  const projectWithSkills = path.join(fixture, 'other-project');
  writeSkill(path.join(projectWithSkills, '.agents', 'skills'), 'other-proj-skill', 'name: other-proj-skill\ndescription: Discovered inside nested .agents/skills.', '# Other Project Skill');
  const multiFound = discoverSkills({ root, roots: [projectWithSkills], enableSkills: true, enableGlobalSkills: false, skillDirs: [customSkillsRoot] }, { homeDir: fakeHome });
  assert.ok(multiFound.some(s => s.name === 'other-proj-skill'));
  assert.ok(multiFound.some(s => s.name === 'custom-viz'));
  const customNested = discoverSkills({ root, enableSkills: true, enableGlobalSkills: false, skillDirs: [projectWithSkills] }, { homeDir: fakeHome });
  assert.ok(customNested.some(s => s.name === 'other-proj-skill'));

  // Missing previously-saved additional root (e.g. unmounted drive) must NOT block adding/removing another folder
  const missingOldRoot = path.join(fixture, 'unmounted-drive');
  const tolerant = new WorkspaceFiles({ root, roots: [missingOldRoot], access: 'edit', enabled: true, workspaceId: randomUUID() });
  const afterAdd = tolerant.configure({ roots: [missingOldRoot, readonlyRoot] });
  assert.equal(afterAdd.unavailable_roots.includes(missingOldRoot), true);
  assert.equal(afterAdd.additional_roots.includes(readonlyRoot), true);
  assert.throws(() => tolerant.configure({ roots: [path.join(fixture, 'brand-new-missing')] }));
  const afterRemove = tolerant.configure({ roots: [readonlyRoot] });
  assert.equal(afterRemove.unavailable_roots.length, 0);

  const detail = readSkill(cfg, { name: 'custom-viz' }, { homeDir: fakeHome });
  assert.match(detail.content, /Follow chart rules/);
  assert.deepEqual(detail.resources, ['references/palette.md']);
  const ref = readSkill(cfg, { name: 'custom-viz', resource_path: 'references/palette.md' }, { homeDir: fakeHome });
  assert.equal(ref.content, 'Colorblind-safe palette.');
  assert.throws(() => readSkill(cfg, { name: 'custom-viz', resource_path: '../outside.txt' }, { homeDir: fakeHome }));
});

await check('Always-on rules load global and workspace AGENTS.md', () => {
  const rules = loadAlwaysOnRules({ root, enableRules: true, enableGlobalSkills: true }, { homeDir: fakeHome });
  assert.equal(rules.length, 2);
  assert.match(rules[0].content, /Always be concise/);
  assert.match(rules[1].content, /Always run npm test/);
});

await check('Per-root read-only blocks writes, management and commands on locked root while allowing reads and writes on primary', async () => {
  fs.writeFileSync(path.join(readonlyRoot, 'ref.txt'), 'REFERENCE_DATA', 'utf8');
  const snapshots = new SnapshotStore(stateDir);
  const cfg = {
    root,
    roots: [readonlyRoot],
    readOnlyRoots: [readonlyRoot],
    access: 'edit',
    enabled: true,
    allowCommands: true,
    allowFileManagement: true,
    workspaceId: randomUUID()
  };
  const files = new WorkspaceFiles(cfg, () => {}, snapshots);
  const id = cfg.workspaceId;
  const info = files.info();
  assert.deepEqual(info.root_permissions.map(r => r.access), ['edit', 'read']);
  assert.equal(files.run('read_file', { workspace_id: id, path: path.join(readonlyRoot, 'ref.txt') }).text, 'REFERENCE_DATA');
  assert.throws(() => files.run('write_file', { workspace_id: id, path: path.join(readonlyRoot, 'ref.txt'), content: 'MUTATE' }));
  assert.throws(() => files.run('edit_file', { workspace_id: id, path: path.join(readonlyRoot, 'ref.txt'), old_text: 'REF', new_text: 'BAD' }));
  assert.throws(() => files.run('create_directory', { workspace_id: id, path: path.join(readonlyRoot, 'sub') }));
  await assert.rejects(async () => files.run('delete_path', { workspace_id: id, path: path.join(readonlyRoot, 'ref.txt') }));
  await assert.rejects(async () => files.run('move_path', { workspace_id: id, src: path.join(readonlyRoot, 'ref.txt'), dst: path.join(root, 'moved.txt') }));
  await assert.rejects(async () => files.run('run_command', { workspace_id: id, cwd: readonlyRoot, command: 'Write-Output NO' }));
  // Primary remains writable
  files.run('write_file', { workspace_id: id, path: 'primary.txt', content: 'V1' });
  assert.equal(fs.readFileSync(path.join(root, 'primary.txt'), 'utf8'), 'V1');
});

await check('Read-only locks apply to nested folders and to all file mutations, including restoration', async () => {
  const parent = path.join(root, 'nested-lock-test');
  const locked = path.join(parent, 'reference');
  const child = path.join(locked, 'inner');
  const existing = path.join(child, 'note.txt');
  fs.mkdirSync(child, { recursive: true });
  fs.writeFileSync(existing, 'SAVED');
  const snapshots = new SnapshotStore(path.join(fixture, 'nested-lock-state'));
  const local = new WorkspaceFiles({ root, roots: [locked, child], access: 'edit', enabled: true,
    allowFileManagement: true, allowCommands: true, workspaceId: randomUUID() }, () => {}, snapshots);
  const saved = local.run('write_file', { workspace_id: local.config.workspaceId, path: existing, content: 'CURRENT' });
  local.configure({ readOnlyRoots: [locked] });
  local.config.enabled = true;
  const workspace_id = local.config.workspaceId;
  const relative = path.relative(root, existing);
  assert.equal(local.info().root_permissions.find(item => item.path === child).access, 'read');
  assert.equal(local.run('read_file', { workspace_id, path: relative }).text, 'CURRENT');
  assert.throws(() => local.run('edit_file', { workspace_id, path: relative, old_text: 'CURRENT', new_text: 'REPLACEMENT' }), /只读/);
  assert.throws(() => local.run('write_file', { workspace_id, path: existing, content: 'REPLACEMENT' }), /只读/);
  await assert.rejects(() => local.run('move_path', { workspace_id, src: parent, dst: 'another-name' }), /只读/);
  assert.throws(() => snapshots.restore(saved._snapshot_id, local), /只读/);
  assert.equal(fs.readFileSync(existing, 'utf8'), 'CURRENT');
});
await check('Snapshots capture pre-edit state and restore cleanly with undoable backup', () => {
  const snapshots = new SnapshotStore(path.join(fixture, 'snap-state'));
  const cfg = { root, access: 'edit', enabled: true, workspaceId: randomUUID() };
  const files = new WorkspaceFiles(cfg, () => {}, snapshots);
  const id = cfg.workspaceId;
  files.run('write_file', { workspace_id: id, path: 'doc.txt', content: 'ORIGINAL_V1', mode: 'create' });
  const editRes = files.run('edit_file', { workspace_id: id, path: 'doc.txt', old_text: 'ORIGINAL_V1', new_text: 'EDITED_V2' });
  assert.ok(editRes._snapshot_id);
  assert.equal(fs.readFileSync(path.join(root, 'doc.txt'), 'utf8'), 'EDITED_V2');
  const restored = snapshots.restore(editRes._snapshot_id, files);
  assert.equal(restored.restored, true);
  assert.ok(restored.backup_snapshot_id);
  assert.equal(fs.readFileSync(path.join(root, 'doc.txt'), 'utf8'), 'ORIGINAL_V1');
  // Undo the restore using backup_snapshot_id
  snapshots.restore(restored.backup_snapshot_id, files);
  assert.equal(fs.readFileSync(path.join(root, 'doc.txt'), 'utf8'), 'EDITED_V2');
});

await check('Cloudflare domain validation, quick/token configuration and mock cloudflared startup work', async () => {
  assert.equal(validateDomain('desk.example.com', 'cloudflared'), 'https://desk.example.com');
  assert.throws(() => validateDomain('http://desk.example.com', 'cloudflared'));
  assert.throws(() => validateDomain('https://desk.example.com/path', 'cloudflared'));
  assert.throws(() => validateDomain('https://localhost', 'cloudflared'));

  const cfState = path.join(fixture, 'cf-state');
  fs.mkdirSync(cfState, { recursive: true });
  let cfConfig = { publicBase: '', tunnelAutoStart: false };
  const mockCmd = path.join(cfState, 'mock-cloudflared.cmd');
  const mockScript = path.join(cfState, 'mock-cloudflared.cjs');
  fs.writeFileSync(mockScript, `
const args = process.argv.slice(2);
if (args.includes('--url')) {
  console.error('INF |  https://demo-quick-check.trycloudflare.com  |');
  setTimeout(() => {}, 10000);
} else if (args.includes('run')) {
  if (!process.env.TUNNEL_TOKEN || args.some(a => a.includes(process.env.TUNNEL_TOKEN))) process.exit(2);
  console.error('INF Registered tunnel connection connIndex=0');
  setTimeout(() => {}, 10000);
}
`, 'utf8');
  fs.writeFileSync(mockCmd, `@"${process.execPath}" "${mockScript}" %*\r\n`, 'utf8');
  // Use a real exe wrapper? spawn() without shell cannot run .cmd directly, so test via node exe? No, compile a tiny mock or test config + Quick/Token using PowerShell? Wait: csc.exe is available! Let's compile a tiny 10-line C# mock-cloudflared.exe!
  const mockCs = path.join(cfState, 'MockCloudflared.cs');
  const mockExe = path.join(cfState, 'mock-cloudflared.exe');
  fs.writeFileSync(mockCs, `
using System;
using System.Threading;
class Program {
  static int Main(string[] args) {
    string joined = string.Join(" ", args);
    if (joined.Contains("--url")) {
      Console.Error.WriteLine("INF |  https://demo-quick-check.trycloudflare.com  |");
      Console.Error.Flush();
      Thread.Sleep(15000);
      return 0;
    }
    string tok = Environment.GetEnvironmentVariable("TUNNEL_TOKEN");
    if (string.IsNullOrEmpty(tok) || joined.Contains(tok)) return 2;
    Console.Error.WriteLine("INF Registered tunnel connection connIndex=0");
    Console.Error.Flush();
    Thread.Sleep(15000);
    return 0;
  }
}
`, 'utf8');
  const { spawnSync } = await import('node:child_process');
  const compile = spawnSync(path.join(process.env.SystemRoot, 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'), ['/nologo', '/target:exe', '/out:' + mockExe, mockCs], { windowsHide: true, encoding: 'utf8' });
  assert.equal(compile.status, 0, compile.stdout + compile.stderr);

  const prevEnv = process.env.GEMINI_CLOUDFLARED_PATH;
  process.env.GEMINI_CLOUDFLARED_PATH = mockExe;
  const tunnel = new Tunnel({ base: project, stateRoot: cfState, port: 3008, getConfig: () => cfConfig, update: v => { cfConfig = { ...cfConfig, ...v }; } });
  try {
    await tunnel.configure({ provider: 'cloudflared', cloudflareMode: 'quick', autoStart: false });
    assert.equal(tunnel.info().provider, 'cloudflared');
    assert.equal(tunnel.info().configured, true);
    await tunnel.start();
    assert.equal(tunnel.status, 'online');
    assert.equal(tunnel.currentPublicBase(), 'https://demo-quick-check.trycloudflare.com');
    await tunnel.stop();
    assert.equal(tunnel.currentPublicBase(), '');

    const dummyToken = 'CF_LOCAL_TEST_TOKEN_' + randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
    await tunnel.configure({ provider: 'cloudflared', cloudflareMode: 'token', domain: 'desk.example.com', token: dummyToken, autoStart: false });
    assert.equal(fs.existsSync(tunnel.cfTokenPath), true);
    assert.equal(fs.readFileSync(tunnel.cfTokenPath, 'utf8').includes(dummyToken), false);
    await tunnel.start();
    assert.equal(tunnel.status, 'online');
    assert.equal(tunnel.currentPublicBase(), 'https://desk.example.com');
    await tunnel.stop();
  } finally {
    await tunnel.stop();
    if (prevEnv === undefined) delete process.env.GEMINI_CLOUDFLARED_PATH;
    else process.env.GEMINI_CLOUDFLARED_PATH = prevEnv;
  }
});

// End-to-end HTTP + MCP test via server.mjs
fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({
  root,
  roots: [readonlyRoot],
  readOnlyRoots: [readonlyRoot],
  access: 'edit',
  enabled: true,
  fileAutoStart: true,
  enableSkills: true,
  enableGlobalSkills: true,
  enableRules: true,
  skillDirs: [],
  key: randomUUID().replaceAll('-', ''),
  workspaceId: randomUUID(),
  publicBase: ''
}));
const port = 3029;
const address = 'http://127.0.0.1:' + port;
const child = spawn(process.execPath, [path.join(project, 'server.mjs')], {
  env: { ...process.env, GEMINI_WORKSPACE_PORT: String(port), GEMINI_WORKSPACE_STATE: stateDir, GEMINI_SKILLS_HOME: fakeHome },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe']
});
let stderr = '';
child.stderr.on('data', chunk => { stderr += chunk; });
const client = new Client({ name: 'v047-e2e-verifier', version: '1.0.0' });
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server timeout: ' + stderr)), 10000);
    child.stdout.once('data', () => { clearTimeout(timer); resolve(); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(stderr)); });
  });
  let state = await (await fetch(address + '/api/state')).json();
  const post = (route, data, csrf = state.csrf) => fetch(address + '/api/' + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Workspace-Csrf': csrf } : {}) },
    body: JSON.stringify(data)
  });

  await check('Custom skill dir API updates live without pausing workspace and exposes skills via MCP', async () => {
    assert.equal((await post('skills/dirs', { dirs: [customSkillsRoot] }, '')).status, 403);
    const res = await post('skills/dirs', { dirs: [customSkillsRoot] });
    assert.equal(res.status, 200);
    const updated = await (await fetch(address + '/api/state')).json();
    assert.equal(updated.enabled, true);
    assert.equal(updated.workspace_id, state.workspace_id);
    assert.ok(updated.skills.some(s => s.name === 'custom-viz'));

    await client.connect(new StreamableHTTPClientTransport(new URL(updated.localMcp)));
    const info = JSON.parse((await client.callTool({ name: 'workspace_info', arguments: {} })).content[0].text);
    assert.ok(info.skills.some(s => s.name === 'custom-viz'));
    assert.ok(info.always_on_rules.some(r => r.content.includes('Always run npm test')));
    assert.deepEqual(info.root_permissions.map(r => r.access), ['edit', 'read']);

    const skillRes = await client.callTool({ name: 'read_skill', arguments: { workspace_id: info.workspace_id, name: 'custom-viz' } });
    assert.equal(skillRes.isError, false);
    const skillData = JSON.parse(skillRes.content[0].text);
    assert.match(skillData.content, /Follow chart rules/);
    assert.deepEqual(skillData.resources, ['references/palette.md']);

    const refRes = await client.callTool({ name: 'read_skill', arguments: { workspace_id: info.workspace_id, name: 'custom-viz', resource_path: 'references/palette.md' } });
    assert.equal(refRes.isError, false);
    assert.equal(JSON.parse(refRes.content[0].text).content, 'Colorblind-safe palette.');
  });

  await check('MCP edit records snapshot_id and local API restores file cleanly', async () => {
    state = await (await fetch(address + '/api/state')).json();
    fs.writeFileSync(path.join(root, 'restore-me.txt'), 'BEFORE_MCP_EDIT', 'utf8');
    const edited = await client.callTool({
      name: 'edit_file',
      arguments: { workspace_id: state.workspace_id, path: 'restore-me.txt', old_text: 'BEFORE_MCP_EDIT', new_text: 'AFTER_MCP_EDIT' }
    });
    assert.equal(edited.isError, false);
    assert.equal(fs.readFileSync(path.join(root, 'restore-me.txt'), 'utf8'), 'AFTER_MCP_EDIT');
    state = await (await fetch(address + '/api/state')).json();
    const editRecord = [...state.history].reverse().find(h => h.name === 'edit_file' && h.path === 'restore-me.txt');
    assert.ok(editRecord?.snapshot_id);
    assert.ok(state.snapshotIds.includes(editRecord.snapshot_id));
    assert.equal((await post('snapshots/' + editRecord.snapshot_id + '/restore', {}, '')).status, 403);
    const restoreRes = await post('snapshots/' + editRecord.snapshot_id + '/restore', {});
    assert.equal(restoreRes.status, 200);
    assert.equal(fs.readFileSync(path.join(root, 'restore-me.txt'), 'utf8'), 'BEFORE_MCP_EDIT');
  });

  console.log(JSON.stringify({ passed: true, checks }));
} finally {
  await client.close().catch(() => {});
  await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); });
}
