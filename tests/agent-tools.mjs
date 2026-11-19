import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { WorkspaceFiles } from '../workspace-files.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(project, '.local', 'tests', 'agent-' + randomUUID().slice(0, 8));
const root = path.join(fixture, 'root'), stateDir = path.join(fixture, 'state'), second = path.join(fixture, 'second');
for (const folder of [root, stateDir, second]) fs.mkdirSync(folder, { recursive: true });
const config = { root, access: 'edit', enabled: true, workspaceId: randomUUID(), allowCommands: true, allowFileManagement: true };
const files = new WorkspaceFiles(config), checks = [];
const run = (name, args = {}) => files.run(name, { workspace_id: files.config.workspaceId, ...args });
const write = (name, text) => { const target = path.join(root, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const check = async (name, action) => { await action(); checks.push({ name, passed: true }); };
const denied = action => assert.rejects(async () => action());
const host = path.join(project, 'ArgonDesk.WorkspaceHost.exe');
if (!fs.existsSync(host) || fs.statSync(host).mtimeMs < fs.statSync(path.join(project, 'native', 'WorkspaceHost.cs')).mtimeMs) {
  const build = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(project, 'Build.ps1'), '-ToolsOnly'], { cwd: project, windowsHide: true, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr + build.stdout);
}
write('src/Main.TS', 'Alpha\r\nHello WORLD\r\nalpha beta\r\n');
write('src/sub/util.js', 'hello world\nconst value = 42;\n');
write('notes.txt', 'final line contains ALPHA');
for (const folder of ['node_modules','.venv','.git','__pycache__','dist','build']) write(folder + '/ignored.ts', 'Alpha');
const outside = path.join(fixture, 'outside.txt'); fs.writeFileSync(outside, 'OUTSIDE_SENTINEL');
fs.symlinkSync(second, path.join(root, 'junction'), 'junction');
fs.linkSync(outside, path.join(root, 'hard.txt'));

await check('Glob, filename fragments, subfolders, dependency exclusions and result caps', async () => {
  assert.deepEqual((await run('find_files', { pattern: '**/*.{ts,js}' })).results.map(v => v.path), ['src/Main.TS','src/sub/util.js']);
  assert.deepEqual((await run('find_files', { pattern: 'main' })).results.map(v => v.path), ['src/Main.TS']);
  assert.deepEqual((await run('find_files', { pattern: '*.js', path: 'src/sub' })).results.map(v => v.path), ['src/sub/util.js']);
  const capped = await run('find_files', { pattern: '*', max_results: 1 }); assert.equal(capped.results.length, 1); assert.equal(capped.truncated, true);
  assert.equal((await run('find_files', { pattern: '*', path: 'node_modules' })).results.length, 0);
});
await check('Literal and regex searches preserve relative paths, CRLF line numbers and case rules', async () => {
  const found = (await run('search_text', { query: 'hello world' })).results;
  assert.deepEqual(found.map(v => [v.path, v.line_number, v.text]), [['src/Main.TS',2,'Hello WORLD'],['src/sub/util.js',1,'hello world']]);
  assert.equal((await run('search_text', { query: 'Hello WORLD', case_sensitive: true })).results.length, 1);
  assert.deepEqual((await run('search_text', { query: '^alpha', regex: true, path: 'src' })).results.map(v => v.line_number), [1,3]);
  const final = (await run('search_text', { query: 'ALPHA', path: 'notes.txt' })).results; assert.equal(final[0].line_number, 1);
  await denied(() => run('search_text', { query: '[', regex: true }));
});
await check('Search streams text larger than 2 MiB, skips binary and reports overlong lines', async () => {
  write('large.txt', 'unmatched line\n'.repeat(160000) + 'UNIQUE_NEAR_END\n');
  write('opaque.bin', Buffer.from([0,1,2,3,65,108,112,104,97]));
  write('long.txt', 'a'.repeat(70000) + '\nUNIQUE_AFTER_LONG\n');
  const large = await run('search_text', { path: 'large.txt', query: 'UNIQUE_NEAR_END' }); assert.equal(large.results[0].line_number, 160001);
  const long = await run('search_text', { path: 'long.txt', query: 'UNIQUE_AFTER_LONG' }); assert.equal(long.results[0].line_number, 2); assert.equal(long.skipped_long_lines, 1);
  assert.equal((await run('search_text', { path: 'opaque.bin', query: 'Alpha' })).results.length, 0);
});
await check('Search paths, patterns, stale IDs, junctions and hardlinks cannot cross the selected root', async () => {
  for (const name of ['find_files','search_text']) {
    const extra = name === 'find_files' ? { pattern: '*' } : { query: 'SENTINEL' };
    for (const target of [outside,'../outside.txt','..\\outside.txt','junction','hard.txt','src/Main.TS:stream']) await denied(() => run(name, { ...extra, path: target }));
    await denied(() => files.run(name, { ...extra, workspace_id: 'obsolete' }));
  }
  for (const pattern of ['../*','C:\\*','/outside/*','x/../../*']) await denied(() => run('find_files', { pattern }));
  assert.equal((await run('search_text', { query: 'OUTSIDE_SENTINEL' })).results.length, 0);
});
await check('A pathological regex times out in a worker without blocking the service thread', async () => {
  write('regex/attack.txt', 'a'.repeat(4000) + '!');
  const pending = denied(() => run('search_text', { path: 'regex', query: '^(a+)+$', regex: true }));
  const began = performance.now(); await delay(100); assert.ok(performance.now() - began < 1500); await pending;
});
await check('LF edits match CRLF files, preserve BOM and CRLF output, and treat replacement text literally', async () => {
  write('eol.txt', '\uFEFFstart\r\nold\r\nend\r\n');
  run('edit_file', { path: 'eol.txt', old_text: 'old\nend', new_text: 'new\n$&$1\nend' });
  assert.equal(read('eol.txt'), '\uFEFFstart\r\nnew\r\n$&$1\r\nend\r\n');
  write('lf.txt', 'one\ntwo\nthree\n'); run('edit_file', { path: 'lf.txt', old_text: 'two\r\nthree', new_text: 'TWO\r\nTHREE' });
  assert.equal(read('lf.txt'), 'one\nTWO\nTHREE\n');
});
await check('Batch edits are atomic and duplicate normalized matches are rejected', async () => {
  const before = read('eol.txt');
  await denied(() => run('edit_file', { path: 'eol.txt', edits: [{ old_text: 'new', new_text: 'TEMP' }, { old_text: 'absent', new_text: 'BAD' }] }));
  assert.equal(read('eol.txt'), before);
  write('duplicates.txt', 'x\r\ny\nx\ny'); await denied(() => run('edit_file', { path: 'duplicates.txt', old_text: 'x\ny', new_text: 'BAD' }));
});
await check('Move and delete require separate permission, edit mode and an enabled current workspace', async () => {
  write('managed.txt', 'KEEP');
  const requests = [['move_path',{ src: 'managed.txt', dst: 'moved.txt' }],['delete_path',{ path: 'managed.txt' }]];
  for (const [field, value] of [['allowFileManagement',false],['access','read'],['enabled',false]]) {
    const old = files.config[field]; files.config[field] = value;
    for (const [name,args] of requests) await denied(() => run(name, args)); files.config[field] = old;
  }
  for (const [name,args] of requests) await denied(() => files.run(name, { ...args, workspace_id: 'old' })); assert.equal(read('managed.txt'), 'KEEP');
});
await check('Move creates parents, renames directory trees and refuses accidental overwrite', async () => {
  await run('move_path', { src: 'managed.txt', dst: 'organized/nested/moved.txt' }); assert.equal(read('organized/nested/moved.txt'), 'KEEP');
  await run('move_path', { src: 'organized', dst: 'renamed' }); assert.equal(read('renamed/nested/moved.txt'), 'KEEP');
  write('target.txt', 'PREVIOUS');
  await denied(() => run('move_path', { src: 'renamed/nested/moved.txt', dst: 'target.txt' })); assert.equal(read('target.txt'), 'PREVIOUS');
  const result = await run('move_path', { src: 'renamed/nested/moved.txt', dst: 'target.txt', overwrite: true }); assert.equal(result.overwritten, true); assert.equal(read('target.txt'), 'KEEP');
});
await check('Management rejects the root, absolute paths, traversal, overlap and linked descendants', async () => {
  write('tree/keep.txt', 'KEEP'); fs.symlinkSync(second, path.join(root, 'tree', 'link'), 'junction');
  for (const target of ['.', outside,'../outside.txt','junction','hard.txt','tree']) await denied(() => run('delete_path', { path: target, to_trash: false }));
  for (const args of [{src:'.',dst:'bad'},{src:'target.txt',dst:'../bad'},{src:'tree',dst:'elsewhere'},{src:'src',dst:'src/sub/child'},{src:'src/sub',dst:'src',overwrite:true}]) await denied(() => run('move_path', args));
  assert.equal(fs.readFileSync(outside, 'utf8'), 'OUTSIDE_SENTINEL'); assert.equal(read('tree/keep.txt'), 'KEEP');
});
await check('Default deletion uses the Windows Recycle Bin; permanent deletion requires explicit false', async () => {
  const filename = 'recycle-proof-' + randomUUID() + '.txt'; write(filename, 'RECYCLE_PROOF');
  const result = await run('delete_path', { path: filename }); assert.equal(result.to_trash, true); assert.equal(fs.existsSync(path.join(root, filename)), false);
  const shell = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command', '$shell = New-Object -ComObject Shell.Application; @($shell.Namespace(10).Items() | ForEach-Object { $_.Name }) | ConvertTo-Json -Compress'], { windowsHide: true, encoding: 'utf8' });
  assert.equal(shell.status, 0); assert.ok(shell.stdout.includes(filename), 'Deleted fixture must be visible in the Recycle Bin');
  write('permanent/nested/test.txt', 'TEST_ONLY'); const deleted = await run('delete_path', { path: 'permanent', to_trash: false }); assert.equal(deleted.to_trash, false); assert.equal(fs.existsSync(path.join(root, 'permanent')), false);
});
await check('Command execution refuses disabled permissions, read-only, stale IDs and unsafe cwd', async () => {
  for (const [field,value] of [['allowCommands',false],['access','read'],['enabled',false]]) {
    const old = files.config[field]; files.config[field] = value; await denied(() => run('run_command', { command: 'Write-Output BAD' })); files.config[field] = old;
  }
  for (const cwd of ['../', outside,'junction','hard.txt','notes.txt']) await denied(() => run('run_command', { command: 'Write-Output BAD', cwd }));
  await denied(() => files.run('run_command', { workspace_id: 'old', command: 'Write-Output BAD' }));
});
await check('PowerShell returns UTF-8 stdout, stderr, native exit status and a scoped starting directory', async () => {
  write('command.cjs', 'process.stdout.write("中文输出\\n" + process.cwd()); process.stderr.write("ERROR_SENTINEL"); process.exit(7);');
  const result = await run('run_command', { command: 'node .\\command.cjs', timeout_sec: 10 });
  assert.equal(result.exit_code, 7); assert.match(result.stdout, /中文输出/); assert.ok(result.stdout.includes(root)); assert.equal(result.stderr, 'ERROR_SENTINEL');
  const failed = await run('run_command', { command: 'throw "TEST_FAILURE"' }); assert.equal(failed.exit_code, 1); assert.match(failed.stderr, /TEST_FAILURE/);
  const subdir = await run('run_command', { command: '(Get-Location).Path', cwd: 'src' }); assert.equal(subdir.exit_code, 0); assert.equal(subdir.stdout.trim(), path.join(root,'src'));
});
await check('Long command output retains heads and tails within 32 KiB', async () => {
  write('output.cjs', 'process.stdout.write("OUT_HEAD" + "x".repeat(80000) + "OUT_TAIL"); process.stderr.write("ERR_HEAD" + "y".repeat(80000) + "ERR_TAIL");');
  const result = await run('run_command', { command: 'node .\\output.cjs' });
  assert.equal(result.exit_code, 0); assert.equal(result.stdout_truncated, true); assert.equal(result.stderr_truncated, true);
  assert.match(result.stdout, /^OUT_HEAD/); assert.match(result.stdout, /OUT_TAIL$/); assert.match(result.stderr, /^ERR_HEAD/); assert.match(result.stderr, /ERR_TAIL$/);
  assert.ok(Buffer.byteLength(result.stdout + result.stderr) <= 32768);
});
await check('Commands run npm test/build in a project subfolder and return generated artifacts', async () => {
  write('web/package.json', JSON.stringify({ private:true, scripts:{test:'node test.cjs',build:'node build.cjs'} }));
  write('web/test.cjs', 'require("node:assert/strict").equal(6 * 7, 42); console.log("FIXTURE_TEST_PASSED");');
  write('web/build.cjs', 'const fs=require("node:fs");fs.mkdirSync("dist",{recursive:true});fs.writeFileSync("dist/result.json",JSON.stringify({answer:42}));console.log("FIXTURE_BUILD_PASSED");');
  const result = await run('run_command', { command:'npm.cmd test; if ($LASTEXITCODE) { exit $LASTEXITCODE }; npm.cmd run build',cwd:'web',timeout_sec:30 });
  assert.equal(result.exit_code,0,result.stderr); assert.match(result.stdout,/FIXTURE_TEST_PASSED/); assert.match(result.stdout,/FIXTURE_BUILD_PASSED/);
  assert.deepEqual(JSON.parse(read('web/dist/result.json')),{answer:42});
});
await check('Timeout kills the complete process tree, including a detached child', async () => {
  write('timeout-leaf.cjs', 'setTimeout(()=>require("node:fs").writeFileSync("LATE_CHILD_MARKER", "BAD"), 5000);');
  write('timeout-parent.cjs', 'require("node:child_process").spawn(process.execPath,["timeout-leaf.cjs"],{detached:true,stdio:"ignore"}).unref(); console.log("CHILD_STARTED"); setTimeout(()=>{},20000);');
  const result = await run('run_command', { command: 'node .\\timeout-parent.cjs', timeout_sec: 2 }); assert.equal(result.timed_out, true); assert.equal(result.exit_code, 124); assert.match(result.stdout, /CHILD_STARTED/);
  await delay(4500); assert.equal(fs.existsSync(path.join(root,'LATE_CHILD_MARKER')), false);
});
await check('Pausing or switching workspace cancels active commands', async () => {
  const pending = run('run_command', { command: 'Start-Sleep -Seconds 20' }); await delay(400); await files.cancelCommands(); assert.equal((await pending).cancelled, true);
  const running = run('run_command', { command: 'Start-Sleep -Seconds 20' }); await delay(400);
  files.configure({ root: second }); assert.equal((await running).exit_code, 130); assert.equal(files.config.enabled, false);
  files.configure({ root }); files.config.enabled = true;
});

fs.writeFileSync(path.join(stateDir,'config.json'), JSON.stringify({ ...config, root, fileAutoStart: true, key: randomUUID(), publicBase: '', allowCommands: false, allowFileManagement: false }));
const address = 'http://127.0.0.1:3027';
const child = spawn(process.execPath, [path.join(project,'server.mjs')], { env: { ...process.env, GEMINI_WORKSPACE_PORT: '3027', GEMINI_WORKSPACE_STATE: stateDir }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
let stderr = ''; child.stderr.on('data', chunk => stderr += chunk);
const client = new Client({ name: 'agent-tools-verifier', version: '1' });
try {
  await new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(new Error('Server timeout: '+stderr)),10000); child.stdout.once('data',()=>{clearTimeout(timer);resolve();}); child.once('exit',()=>{clearTimeout(timer);reject(new Error(stderr));}); });
  let state = await (await fetch(address+'/api/state')).json();
  const post = (route, data, csrf = state.csrf) => fetch(address+'/api/'+route, { method:'POST', headers:{'Content-Type':'application/json', ...(csrf ? {'X-Workspace-Csrf':csrf} : {})}, body:JSON.stringify(data) });
  const getState = async () => state = await (await fetch(address+'/api/state')).json();
  await client.connect(new StreamableHTTPClientTransport(new URL(state.localMcp)));
  const call = (name,args={}) => client.callTool({ name, arguments:{workspace_id:state.workspace_id,...args} });
  const value = result => JSON.parse(result.content[0].text);
  await check('Real MCP exposes eleven tools with validated defaults and correct mutation hints', async () => {
    const tools = (await client.listTools()).tools; assert.equal(tools.length,11);
    assert.equal(tools.find(v=>v.name==='run_command').annotations.openWorldHint,true);
    assert.equal(tools.find(v=>v.name==='find_files').annotations.readOnlyHint,true);
    assert.equal(tools.find(v=>v.name==='delete_path').inputSchema.properties.to_trash.default,true);
    assert.equal((await call('run_command',{command:'Write-Output DENIED'})).isError,true);
    assert.equal((await call('delete_path',{path:'target.txt'})).isError,true);
  });
  await check('Preferences require CSRF and booleans, reject invalid requests atomically and persist grants', async () => {
    assert.equal((await post('preferences',{allowCommands:true},'')).status,403);
    assert.equal((await post('preferences',{allowCommands:true,allowFileManagement:'true'})).status,400);
    await getState(); assert.equal(state.allow_commands,false);
    assert.equal((await post('preferences',{allowCommands:true,allowFileManagement:true,fileAutoStart:true,tunnelAutoStart:true})).status,200);
    await getState(); assert.equal(state.allow_commands,true); assert.equal(state.allow_file_management,true); assert.equal(state.tunnel.autoStart,true);
    const saved=JSON.parse(fs.readFileSync(path.join(stateDir,'config.json'),'utf8')); assert.equal(saved.allowCommands,true); assert.equal(saved.fileAutoStart,true);
    await post('preferences',{tunnelAutoStart:false});
  });
  await check('Real MCP search, move and recycle calls return usable results', async () => {
    assert.ok(value(await call('find_files',{pattern:'main'})).results.some(v=>v.path==='src/Main.TS'));
    assert.ok(value(await call('search_text',{query:'hello world',path:'src'})).results.length);
    write('mcp.txt','MCP'); assert.equal((await call('move_path',{src:'mcp.txt',dst:'mcp/moved.txt'})).isError,false);
    assert.equal((await call('delete_path',{path:'mcp'})).isError,false); assert.equal(fs.existsSync(path.join(root,'mcp')),false);
  });
  await check('MCP failed commands carry exit codes; validation refusals and all new tools are audited', async () => {
    const result=await call('run_command',{command:'Write-Output AUDIT_OUTPUT; exit 9'}); assert.equal(result.isError,true); assert.equal(value(result).exit_code,9);
    assert.equal((await call('run_command',{command:'Write-Output INVALID',timeout_sec:0})).isError,true);
    await getState();
    for(const name of ['find_files','search_text','move_path','delete_path','run_command']) { const item=state.history.find(v=>v.name===name); assert.ok(item); assert.ok(Number.isFinite(item.duration_ms)); assert.ok(item.status); }
    const command=state.history.find(v=>v.exit_code===9); assert.equal(command.ok,false); assert.match(command.command,/AUDIT_OUTPUT/); assert.equal(command.stdout,undefined);
    const invalid=state.history.find(v=>v.command==='Write-Output INVALID'); assert.equal(invalid.status,'denied');
  });
  await check('Turning off command permission or pausing immediately cancels a running MCP command', async () => {
    let pending=call('run_command',{command:'Start-Sleep -Seconds 20'}); await delay(500); await post('preferences',{allowCommands:false}); assert.equal(value(await pending).cancelled,true);
    await post('preferences',{allowCommands:true}); pending=call('run_command',{command:'Start-Sleep -Seconds 20'}); await delay(500); await post('settings',{enabled:false}); assert.equal(value(await pending).exit_code,130);
  });
  await check('Opening restores saved file access, while turning auto-restore off preserves a pause', async () => {
    assert.equal((await post('startup/restore',{},'')).status,403);
    assert.equal((await post('startup/restore',{})).status,200); await getState(); assert.equal(state.enabled,true);
    await post('preferences',{fileAutoStart:false}); await post('settings',{enabled:false}); await post('startup/restore',{}); await getState(); assert.equal(state.enabled,false);
    assert.equal(fs.readFileSync(outside,'utf8'),'OUTSIDE_SENTINEL');
  });
} finally {
  await client.close().catch(()=>{});
  await new Promise(resolve=>{ if(child.exitCode!==null)return resolve(); child.once('exit',resolve); child.kill(); });
}
fs.writeFileSync(path.join(project,'.local','agent-tools-test-results.json'),JSON.stringify({passed:true,fixture,checks,modelRequests:0},null,2));
console.log(JSON.stringify({passed:true,checks:checks.length,modelRequests:0}));
