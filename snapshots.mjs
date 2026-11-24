import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class SnapshotStore {
  constructor(stateRoot, { maxSnapshots = 30, maxBytes = 2 * 1024 * 1024 } = {}) {
    this.dir = path.join(stateRoot, 'snapshots');
    this.indexPath = path.join(this.dir, 'index.json');
    this.maxSnapshots = maxSnapshots;
    this.maxBytes = maxBytes;
    fs.mkdirSync(this.dir, { recursive: true });
    this.items = this.#load();
  }

  #load() {
    try {
      if (!fs.existsSync(this.indexPath)) return [];
      const parsed = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  #save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.indexPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.items, null, 2));
    fs.renameSync(tmp, this.indexPath);
  }

  #dataPath(id) {
    return path.join(this.dir, `${id}.bak`);
  }

  capture({ targetPath, displayPath, tool, workspace }) {
    if (!targetPath || !fs.existsSync(targetPath)) return null;
    let stat;
    try { stat = fs.lstatSync(targetPath); } catch { return null; }
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > this.maxBytes) return null;
    const buffer = fs.readFileSync(targetPath);
    const id = crypto.randomUUID().slice(0, 12);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.#dataPath(id), buffer);
    const entry = {
      id,
      time: new Date().toISOString(),
      tool,
      targetPath,
      displayPath: displayPath || targetPath,
      workspace: workspace || '',
      bytes: buffer.length,
      sha256
    };
    this.items.push(entry);
    while (this.items.length > this.maxSnapshots) {
      const removed = this.items.shift();
      try { fs.rmSync(this.#dataPath(removed.id), { force: true }); } catch {}
    }
    this.#save();
    return id;
  }

  has(id) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{6,64}$/i.test(id)) return false;
    return this.items.some(item => item.id === id) && fs.existsSync(this.#dataPath(id));
  }

  list() {
    return this.items.filter(item => fs.existsSync(this.#dataPath(item.id)));
  }

  restore(id, files) {
    if (typeof id !== 'string' || !/^[a-f0-9-]{6,64}$/i.test(id)) throw new Error('快照编号无效。');
    const entry = this.items.find(item => item.id === id);
    if (!entry || !fs.existsSync(this.#dataPath(id))) throw new Error('未找到对应的文件快照，可能已被自动清理。');
    const resolved = files.resolve(entry.targetPath, true);
    files.assertWritablePath(resolved);
    const data = fs.readFileSync(this.#dataPath(id));
    let backupId = null;
    if (fs.existsSync(resolved)) {
      backupId = this.capture({
        targetPath: resolved,
        displayPath: entry.displayPath,
        tool: 'restore_backup',
        workspace: entry.workspace
      });
    }
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, data);
    return {
      restored: true,
      id,
      targetPath: resolved,
      displayPath: entry.displayPath,
      bytes: data.length,
      ...(backupId ? { backup_snapshot_id: backupId } : {})
    };
  }
}
