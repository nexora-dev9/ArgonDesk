import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, assertTextWrite } from './file-reader.mjs';
import { runCommand, searchWorkspace, managePath } from './workspace-agent.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
export class WorkspaceFiles {
  constructor(config, save = () => {}) { this.config = config; this.save = save; this.pendingCommands = new Set(); }
  cancelCommands() {
    const items = [...this.pendingCommands];
    for (const item of items) item.cancel();
    return Promise.allSettled(items.map(item => item.done));
  }
  configure(update) {
    this.cancelCommands();
    const next = { ...this.config, ...update, enabled: false, workspaceId: randomUUID() };
    next.root = fs.realpathSync(next.root);
    if (!fs.statSync(next.root).isDirectory()) throw new Error('请选择现有文件夹。');
    if (!['read', 'edit'].includes(next.access)) throw new Error('权限设置无效。');
    this.config = next;
    this.save(next);
    return this.info();
  }
  info() {
    const { root, access, enabled, workspaceId } = this.config;
    return { workspace: root, workspace_id: workspaceId, access, enabled, allow_commands: this.config.allowCommands === true, allow_file_management: this.config.allowFileManagement === true };
  }
  check(id, write = false) {
    if (!this.config.enabled) throw new Error('工作区已暂停，请在本地工作台启用。');
    if (id !== this.config.workspaceId) throw new Error('工作区已切换或权限已变化，请重新查询 workspace_info。');
    if (write && this.config.access !== 'edit') throw new Error('当前为只读模式，写入已被服务端拒绝。');
  }
  resolve(relative = '.', missing = false) {
    const rootStat = fs.lstatSync(this.config.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || path.relative(this.config.root, fs.realpathSync(this.config.root)) !== '') throw new Error('所选工作区目录已被替换，请重新选择文件夹。');
    if (typeof relative !== 'string' || !relative || relative.includes('\0') || path.isAbsolute(relative) || relative.includes(':')) {
      throw new Error('只接受工作区内的相对路径。');
    }
    const segments = relative.split(/[\\/]/);
    for (const segment of segments) {
      if (segment === '..' || (segment !== '.' && (/[. ]$/.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment)))) {
        throw new Error('路径包含不允许的父目录、设备名或别名。');
      }
    }
    const target = path.resolve(this.config.root, relative);
    const within = path.relative(this.config.root, target);
    if (within.startsWith('..' + path.sep) || within === '..' || path.isAbsolute(within)) throw new Error('路径超出工作区。');
    let current = this.config.root;
    for (const part of within.split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      let stat;
      try { stat = fs.lstatSync(current); }
      catch (error) { if (missing && error.code === 'ENOENT') continue; throw error; }
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1)) throw new Error('不允许通过符号链接、目录联接点或硬链接访问文件。');
      const realRelative = path.relative(this.config.root, fs.realpathSync(current));
      if (realRelative === '..' || realRelative.startsWith('..' + path.sep) || path.isAbsolute(realRelative)) throw new Error('实际路径超出工作区。');
    }
    return target;
  }
  run(name, args = {}) {
    if (name === 'workspace_info') {
      this.check(this.config.workspaceId);
      return this.info();
    }
    if (name === 'find_files' || name === 'search_text') return searchWorkspace(this, name, args);
    if (name === 'run_command') return runCommand(this, args);
    if (name === 'move_path' || name === 'delete_path') return managePath(this, name, args);
    const write = ['write_file', 'edit_file', 'create_directory'].includes(name);
    this.check(args.workspace_id, write);
    if (!['list_files', 'read_file', 'write_file', 'edit_file', 'create_directory'].includes(name)) throw new Error('此工具未提供。');
    const target = this.resolve(args.path || '.', write);
    if (['write_file', 'edit_file'].includes(name)) assertTextWrite(target);
    if (name === 'list_files') {
      const offset = args.offset ?? 0, limit = args.limit ?? 500;
      if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('目录读取范围无效。');
      const items = fs.readdirSync(target, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      const entries = items.slice(offset, offset + limit).map(item => ({
        name: item.name, type: item.isSymbolicLink() ? 'blocked_link' : item.isDirectory() ? 'directory' : 'file'
      }));
      return { path: args.path || '.', total_entries: items.length, offset, entries, has_more: offset + limit < items.length,
        next_offset: offset + limit < items.length ? offset + limit : null };
    }
    if (name === 'create_directory') {
      fs.mkdirSync(target, { recursive: true });
      return { created: args.path };
    }
    if (name === 'read_file') {
      const value = readFile(target, args);
      if (value?.then) return value.then(result => { this.check(args.workspace_id); this.resolve(args.path); return result; });
      return value;
    }
    let content = args.content;
    let editsApplied = 0;
    if (name === 'edit_file') {
      if (args.edits !== undefined && (args.old_text !== undefined || args.new_text !== undefined)) throw new Error('请使用 edits 批量编辑，或 old_text/new_text 单次编辑，不要混用。');
      const edits = args.edits ?? [{ old_text: args.old_text, new_text: args.new_text }];
      if (!Array.isArray(edits) || !edits.length || edits.length > 50 || edits.some(edit => !edit || typeof edit.old_text !== 'string' || !edit.old_text || typeof edit.new_text !== 'string')) throw new Error('编辑参数无效。');
      const stat = fs.statSync(target);
      if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('仅支持不超过 2 MiB 的普通文件。');
      content = fs.readFileSync(target, 'utf8');
      const eol = content.match(/\r\n|\n/)?.[0] || '\n';
      for (const edit of edits) {
        const normalized = content.replace(/\r\n/g, '\n'), old = edit.old_text.replace(/\r\n/g, '\n');
        const index = normalized.indexOf(old);
        if (index < 0 || normalized.indexOf(old, index + 1) >= 0) throw new Error('待替换文本必须恰好匹配一次，请先读取文件。');
        let raw = 0, position = 0, start = 0;
        while (position < index + old.length) {
          if (position === index) start = raw;
          if (content[raw] === '\r' && content[raw + 1] === '\n') raw++;
          raw++; position++;
        }
        content = content.slice(0, start) + edit.new_text.replace(/\r\n/g, '\n').replace(/\n/g, eol) + content.slice(raw);
      }
      editsApplied = edits.length;
    }
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_BYTES) throw new Error('写入内容必须为不超过 2 MiB 的文本。');
    if (name === 'write_file' && args.mode && !['create', 'rewrite', 'append'].includes(args.mode)) throw new Error('写入模式无效。');
    const append = name === 'write_file' && args.mode === 'append';
    const create = name === 'write_file' && args.mode === 'create';
    if (append && fs.existsSync(target) && fs.statSync(target).size + Buffer.byteLength(content) > MAX_BYTES) throw new Error('追加后文件将超过 2 MiB。');
    if (name === 'write_file') fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { encoding: 'utf8', flag: create ? 'wx' : append ? 'a' : 'w' });
    return { path: args.path, bytes: fs.statSync(target).size, written: true, ...(editsApplied ? { edits_applied: editsApplied } : {}) };
  }
}
