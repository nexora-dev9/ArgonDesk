import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Worker } from 'node:worker_threads';

const base = path.dirname(fileURLToPath(import.meta.url));
const host = path.join(base, 'WebAgy.WorkspaceHost.exe');
function requireHost() {
  if (process.platform !== 'win32' || !fs.existsSync(host)) throw new Error('请运行 Build.ps1，生成 Windows 命令与回收站助手。');
}
export function checkAgentPermission(files, id, capability) {
  files.check(id, true);
  if (files.config[capability] !== true) {
    const error = new Error(capability === 'allowCommands' ? '未开启命令权限，请在偏好设置中开启“允许 AI 执行工作区命令”。' : '未开启整理权限，请在偏好设置中开启“允许 AI 移动和删除文件”。');
    error.code = 'PERMISSION_DENIED'; throw error;
  }
}
function collector(limit = 16384) {
  const half = (limit - 64) / 2;
  let head = Buffer.alloc(0), tail = Buffer.alloc(0), bytes = 0;
  return {
    add(chunk) { bytes += chunk.length; const need = half - head.length; if (need > 0) { head = Buffer.concat([head, chunk.subarray(0, need)]); chunk = chunk.subarray(need); } tail = Buffer.concat([tail, chunk]).subarray(-half); },
    result() {
      if (bytes <= half * 2) return { text: Buffer.concat([head, tail]).toString('utf8'), truncated: false };
      let start = 0; while (start < tail.length && (tail[start] & 0xc0) === 0x80) start++;
      return { text: new TextDecoder().decode(head, { stream: true }) + '\n... [output truncated] ...\n' + tail.subarray(start).toString('utf8'), truncated: true };
    }
  };
}
export function runCommand(files, args) {
  checkAgentPermission(files, args.workspace_id, 'allowCommands');
  const cwd = files.resolve(args.cwd ?? '.');
  files.assertWritablePath(cwd);
  if (!fs.statSync(cwd).isDirectory()) throw new Error('命令 cwd 必须是工作区内的目录。');
  if (typeof args.command !== 'string' || !args.command.trim() || args.command.length > 8000 || args.command.includes('\0')) throw new Error('命令必须是 1–8000 字符的文本。');
  const seconds = args.timeout_sec ?? 120;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) throw new Error('命令超时应为 1–600 秒。');
  requireHost();
  const env = { ...process.env, PYTHONIOENCODING: 'utf-8' };
  for (const key of Object.keys(env)) if (/^(GEMINI_WORKSPACE_|GEMINI_NGROK_|NGROK_AUTHTOKEN$|CODEX_)/i.test(key)) delete env[key];
  const pathKey = Object.keys(env).find(key => key.toUpperCase() === 'PATH');
  env[pathKey || 'PATH'] = path.dirname(process.execPath) + path.delimiter + (env[pathKey] || '');
  const stdout = collector(), stderr = collector(), start = performance.now();
  const child = spawn(host, ['run'], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let timedOut = false, cancelled = false;
  const item = { cancel() { cancelled = true; child.kill(); }, done: null };
  item.done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, seconds * 1000);
    child.stdout.on('data', value => stdout.add(value)); child.stderr.on('data', value => stderr.add(value));
    child.stdin.on('error', () => {});
    child.once('error', error => { clearTimeout(timer); files.pendingCommands.delete(item); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); files.pendingCommands.delete(item);
      const out = stdout.result(), err = stderr.result();
      resolve({ cwd: args.cwd ?? '.', exit_code: timedOut ? 124 : cancelled ? 130 : code ?? 1, stdout: out.text, stderr: err.text,
        stdout_truncated: out.truncated, stderr_truncated: err.truncated, timed_out: timedOut, cancelled, duration_ms: Math.round(performance.now() - start),
        isolation: 'working_directory_only; runs with the current Windows user permissions' });
    });
    child.stdin.end(JSON.stringify({ command: args.command, cwd, parent_pid: process.pid }));
  });
  files.pendingCommands.add(item);
  return item.done;
}
export function searchWorkspace(files, name, args) {
  files.check(args.workspace_id);
  const scope = files.scope(args.path ?? '.');
  files.resolve(args.path ?? '.');
  if (name === 'find_files') {
    if (typeof args.pattern !== 'string' || !args.pattern || args.pattern.length > 1024 || args.pattern.includes('\0') || path.win32.isAbsolute(args.pattern) || path.posix.isAbsolute(args.pattern) || args.pattern.includes(':') || args.pattern.split(/[\\/]/).includes('..')) throw new Error('搜索 pattern 只接受工作区内的 glob 或文件名，不允许绝对路径或 ..。');
  } else if (typeof args.query !== 'string' || !args.query || args.query.length > 4096) throw new Error('query 必须是 1–4096 字符。');
  const max = args.max_results ?? (name === 'find_files' ? 200 : 100);
  if (!Number.isInteger(max) || max < 1 || max > 1000) throw new Error('max_results 应为 1–1000。');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./workspace-search-worker.mjs', import.meta.url), {
      workerData: { root: scope.root, workspaceId: args.workspace_id, name, args: { ...args, path: scope.within || '.', max_results: max } },
      execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 128 }
    });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('搜索或正则匹配超时，请缩小 path 或简化正则。')); }, 10000);
    worker.once('message', message => {
      clearTimeout(timer); worker.terminate();
      try {
        files.check(args.workspace_id); files.resolve(args.path ?? '.');
        if (message.error) throw new Error(message.error);
        if (scope.root !== files.config.root || path.isAbsolute(args.path ?? '.')) {
          message.results = message.results.map(item => ({ ...item, path: path.join(scope.root, item.path) }));
        }
        resolve(message);
      } catch (error) { reject(error); }
    });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('搜索进程已停止。')); });
  });
}
async function preflightTree(files, id, relative) {
  const stack = [relative]; let count = 0;
  while (stack.length) {
    checkAgentPermission(files, id, 'allowFileManagement');
    const name = stack.pop(), target = files.resolve(name), stat = fs.lstatSync(target);
    if (stat.isDirectory()) for (const item of fs.readdirSync(target)) stack.push(path.join(name, item));
    if (++count > 100000) throw new Error('目录包含超过 100000 个条目，请缩小操作范围。');
    if (count % 100 === 0) await new Promise(resolve => setImmediate(resolve));
  }
}
function rootMutation(files, target) { if (path.relative(files.scope(target).root, target) === '') throw new Error('禁止移动、覆盖或删除工作区根目录。'); }
function recycle(target) {
  requireHost();
  return new Promise((resolve, reject) => {
    const child = spawn(host, ['trash'], { windowsHide: true, stdio: ['pipe','ignore','pipe'] });
    const errors = collector(4096);
    const timer = setTimeout(() => { child.kill(); reject(new Error('回收站操作超时；未改用永久删除，请检查原路径。')); }, 30000);
    child.stderr.on('data', value => errors.add(value)); child.stdin.on('error', () => {});
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error('无法移入 Windows 回收站；未改用永久删除。' + errors.result().text)); });
    child.stdin.end(JSON.stringify({ path: target }));
  });
}
export async function managePath(files, name, args) {
  checkAgentPermission(files, args.workspace_id, 'allowFileManagement');
  if (name === 'delete_path') {
    const target = files.resolve(args.path); rootMutation(files, target);
    files.assertWritablePath(target, true);
    if (args.to_trash !== undefined && typeof args.to_trash !== 'boolean') throw new Error('to_trash 必须是布尔值。');
    await preflightTree(files, args.workspace_id, args.path);
    checkAgentPermission(files, args.workspace_id, 'allowFileManagement'); files.resolve(args.path);
    if (args.to_trash !== false) await recycle(target);
    else fs.rmSync(target, { recursive: true });
    return { path: args.path, deleted: true, to_trash: args.to_trash !== false };
  }
  const src = files.resolve(args.src), dst = files.resolve(args.dst, true);
  rootMutation(files, src); rootMutation(files, dst);
  files.assertWritablePath(src, true);
  files.assertWritablePath(dst, true);
  const a = path.relative(src, dst), b = path.relative(dst, src);
  const nested = value => value === '' || (!value.startsWith('..' + path.sep) && value !== '..' && !path.isAbsolute(value));
  if (nested(a) || nested(b)) throw new Error('源和目标不能相同或互为祖先目录。');
  if (args.overwrite !== undefined && typeof args.overwrite !== 'boolean') throw new Error('overwrite 必须是布尔值。');
  const exists = fs.existsSync(dst);
  if (exists && args.overwrite !== true) throw new Error('目标已存在；默认不覆盖。');
  await preflightTree(files, args.workspace_id, args.src);
  if (exists) { await preflightTree(files, args.workspace_id, args.dst); if (fs.statSync(src).isDirectory() !== fs.statSync(dst).isDirectory()) throw new Error('覆盖时源和目标必须同为文件或同为目录。'); }
  checkAgentPermission(files, args.workspace_id, 'allowFileManagement'); files.resolve(args.src); files.resolve(args.dst, true);
  if (!exists && fs.existsSync(dst)) throw new Error('目标在准备期间已创建，请重新查询后再操作。');
  if (!fs.existsSync(path.dirname(dst))) fs.mkdirSync(path.dirname(dst), { recursive: true });
  const backup = exists ? dst + '.webagy-replaced-' + randomUUID() : null;
  if (backup) fs.renameSync(dst, backup);
  try { fs.renameSync(src, dst); } catch (error) { if (backup) fs.renameSync(backup, dst); throw error; }
  let retained;
  if (backup) { try { await recycle(backup); } catch { retained = path.isAbsolute(args.dst) ? backup : path.relative(files.config.root, backup); } }
  return { src: args.src, dst: args.dst, moved: true, overwritten: exists, ...(retained ? { previous_target_backup: retained } : {}) };
}
