import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MAX_SKILL_BYTES = 256 * 1024;
const MAX_RULE_CHARS = 8000;
const MAX_TOTAL_RULE_CHARS = 12000;
const MAX_RESOURCE_FILES = 100;
const IGNORED_DIRS = new Set(['.git', 'node_modules', '__pycache__', '.venv', 'dist', 'build']);

function getHomeDir(options = {}) {
  return options.homeDir || process.env.GEMINI_SKILLS_HOME || os.homedir();
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseFrontmatter(rawText) {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return { meta: {}, body: text };
  const lines = match[1].split(/\r?\n/);
  const meta = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!keyMatch) continue;
    const key = keyMatch[1];
    const rest = keyMatch[2].trim();
    if (/^[>|][+-]?$/.test(rest)) {
      const folded = rest.startsWith('>');
      const block = [];
      let baseIndent = null;
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (!next.trim()) {
          block.push('');
          i++;
          continue;
        }
        const indentMatch = next.match(/^(\s+)/);
        if (!indentMatch) break;
        if (baseIndent === null) baseIndent = indentMatch[1].length;
        if (indentMatch[1].length < baseIndent) break;
        block.push(next.slice(baseIndent));
        i++;
      }
      meta[key] = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else if (rest === '') {
      const list = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) {
        const item = lines[i + 1].trim();
        if (item.startsWith('- ')) list.push(unquote(item.slice(2)));
        i++;
      }
      meta[key] = list.length ? list : '';
    } else {
      const val = unquote(rest);
      meta[key] = val === 'true' ? true : val === 'false' ? false : val;
    }
  }
  return { meta, body: text.slice(match[0].length) };
}

function resolveConfiguredPath(rawPath, baseDir, homeDir) {
  if (typeof rawPath !== 'string' || !rawPath.trim()) return null;
  const trimmed = rawPath.trim();
  if (trimmed === '~') return homeDir;
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) return path.join(homeDir, trimmed.slice(2));
  if (path.isAbsolute(trimmed)) return path.resolve(trimmed);
  return path.resolve(baseDir, trimmed);
}

function loadGlobalManifest(homeDir) {
  const manifestPath = path.join(homeDir, '.gemini', 'config', 'skills.json');
  if (!fs.existsSync(manifestPath)) return { entries: [], globalExcludes: new Set(), manifestPath: null };
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const baseDir = path.dirname(manifestPath);
    const globalExcludes = new Set(Array.isArray(parsed.exclude) ? parsed.exclude.filter(v => typeof v === 'string') : []);
    const entries = [];
    for (const item of Array.isArray(parsed.entries) ? parsed.entries : []) {
      const dir = resolveConfiguredPath(item?.path, baseDir, homeDir);
      if (!dir) continue;
      entries.push({
        dir,
        includeOnly: Array.isArray(item.include_only) ? new Set(item.include_only.filter(v => typeof v === 'string')) : null,
        exclude: new Set(Array.isArray(item.exclude) ? item.exclude.filter(v => typeof v === 'string') : [])
      });
    }
    return { entries, globalExcludes, manifestPath };
  } catch {
    return { entries: [], globalExcludes: new Set(), manifestPath: null };
  }
}

function readSkillDescriptor(skillDir, folderName, source) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return null;
  let realFile, realDir;
  try {
    realFile = fs.realpathSync(skillFile);
    realDir = fs.realpathSync(skillDir);
    const stat = fs.statSync(realFile);
    if (!stat.isFile() || stat.size > MAX_SKILL_BYTES) return null;
  } catch {
    return null;
  }
  let raw;
  try { raw = fs.readFileSync(realFile, 'utf8'); } catch { return null; }
  const { meta } = parseFrontmatter(raw);
  if (meta.hidden === true) return null;
  const name = typeof meta.name === 'string' && meta.name.trim() ? meta.name.trim() : folderName;
  const description = typeof meta.description === 'string' ? meta.description.trim() : '';
  if (!name || !description) return null;
  return {
    name,
    description,
    manual_only: meta['disable-model-invocation'] === true,
    source,
    folder: folderName,
    dir: realDir,
    file: realFile
  };
}

function scanDirectory({ dir, source, includeOnly = null, exclude = new Set(), globalExcludes = new Set() }, collected, seenNames, seenFiles) {
  let realBase;
  try {
    realBase = fs.realpathSync(dir);
    if (!fs.statSync(realBase).isDirectory()) return;
  } catch {
    return;
  }
  // Support selecting a single skill directory directly (contains SKILL.md at top level).
  const directFile = path.join(realBase, 'SKILL.md');
  if (fs.existsSync(directFile) && (!includeOnly || includeOnly.has(path.basename(realBase)))) {
    const folderName = path.basename(realBase);
    if (!exclude.has(folderName) && !globalExcludes.has(folderName)) {
      const descriptor = readSkillDescriptor(realBase, folderName, source);
      if (descriptor && !seenFiles.has(descriptor.file) && !seenNames.has(descriptor.name.toLowerCase())) {
        seenFiles.add(descriptor.file);
        seenNames.add(descriptor.name.toLowerCase());
        collected.push(descriptor);
      }
    }
    return;
  }
  let entries;
  try { entries = fs.readdirSync(realBase, { withFileTypes: true }); } catch { return; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (exclude.has(entry.name) || globalExcludes.has(entry.name)) continue;
    if (includeOnly && !includeOnly.has(entry.name)) continue;
    const candidate = path.join(realBase, entry.name);
    let stat;
    try { stat = fs.statSync(candidate); } catch { continue; }
    if (!stat.isDirectory()) continue;
    const descriptor = readSkillDescriptor(candidate, entry.name, source);
    if (!descriptor) continue;
    if (exclude.has(descriptor.name) || globalExcludes.has(descriptor.name)) continue;
    if (seenFiles.has(descriptor.file) || seenNames.has(descriptor.name.toLowerCase())) continue;
    seenFiles.add(descriptor.file);
    seenNames.add(descriptor.name.toLowerCase());
    collected.push(descriptor);
  }
}

export function discoverSkills(config = {}, options = {}) {
  if (config.enableSkills === false) return [];
  const homeDir = getHomeDir(options);
  const collected = [];
  const seenNames = new Set();
  const seenFiles = new Set();
  const manifest = loadGlobalManifest(homeDir);
  const globalExcludes = manifest.globalExcludes;

  // 1. Workspace project skills (primary folder, then additional authorized folders)
  const workspaceRoots = [config.root, ...(Array.isArray(config.roots) ? config.roots : [])].filter(Boolean);
  for (const wsRoot of workspaceRoots) {
    for (const rel of ['.agents/skills', '.agent/skills']) {
      scanDirectory({ dir: path.join(wsRoot, rel), source: 'workspace', globalExcludes }, collected, seenNames, seenFiles);
    }
  }

  // 2. User-selected custom skill folders (supports single skill folder, skills root, or project folder with .agents/skills)
  for (const customDir of Array.isArray(config.skillDirs) ? config.skillDirs : []) {
    if (typeof customDir !== 'string' || !customDir.trim()) continue;
    scanDirectory({ dir: customDir, source: 'custom', globalExcludes }, collected, seenNames, seenFiles);
    for (const rel of ['.agents/skills', '.agent/skills']) {
      scanDirectory({ dir: path.join(customDir, rel), source: 'custom', globalExcludes }, collected, seenNames, seenFiles);
    }
  }

  // 3. Global discovery (skills.json, ~/.gemini/config/skills, ~/.agents/skills)
  if (config.enableGlobalSkills !== false) {
    const manifestDirs = new Map();
    for (const entry of manifest.entries) {
      scanDirectory({ dir: entry.dir, source: 'global', includeOnly: entry.includeOnly, exclude: entry.exclude, globalExcludes }, collected, seenNames, seenFiles);
      try { manifestDirs.set(fs.realpathSync(entry.dir), entry.exclude); } catch {}
    }
    for (const fallbackDir of [path.join(homeDir, '.gemini', 'config', 'skills'), path.join(homeDir, '.agents', 'skills')]) {
      let realFallback;
      try { realFallback = fs.realpathSync(fallbackDir); } catch { continue; }
      if (manifestDirs.has(realFallback)) continue;
      scanDirectory({ dir: realFallback, source: 'global', globalExcludes }, collected, seenNames, seenFiles);
    }
  }

  return collected;
}

export function listSkillSummaries(config = {}, options = {}) {
  return discoverSkills(config, options).map(({ name, description, manual_only, source }) => ({
    name,
    description,
    manual_only,
    source
  }));
}

function listSkillResources(skillDir) {
  const results = [];
  const walk = (dir, prefix, depth) => {
    if (depth > 4 || results.length >= MAX_RESOURCE_FILES) return;
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const item of items) {
      if (results.length >= MAX_RESOURCE_FILES) break;
      if (item.isSymbolicLink()) continue;
      if (depth === 0 && item.name.toUpperCase() === 'SKILL.MD') continue;
      if (item.isDirectory()) {
        if (IGNORED_DIRS.has(item.name) || item.name.startsWith('.')) continue;
        walk(path.join(dir, item.name), prefix ? `${prefix}/${item.name}` : item.name, depth + 1);
      } else if (item.isFile()) {
        results.push(prefix ? `${prefix}/${item.name}` : item.name);
      }
    }
  };
  walk(skillDir, '', 0);
  return results;
}

function resolveResourcePath(skillDir, resourcePath) {
  if (typeof resourcePath !== 'string' || !resourcePath.trim() || resourcePath.includes('\0') || resourcePath.includes(':')) {
    throw new Error('附属资源路径无效。');
  }
  if (path.isAbsolute(resourcePath)) throw new Error('附属资源路径必须是技能目录内的相对路径。');
  const segments = resourcePath.split(/[\\/]/);
  for (const segment of segments) {
    if (segment === '..' || (segment !== '.' && segment !== '' && (/[. ]$/.test(segment) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment)))) {
      throw new Error('附属资源路径包含不允许的片段。');
    }
  }
  const target = path.resolve(skillDir, resourcePath);
  const diff = path.relative(skillDir, target);
  if (!diff || diff === '..' || diff.startsWith('..' + path.sep) || path.isAbsolute(diff)) {
    throw new Error('附属资源路径超出技能目录范围。');
  }
  let realTarget;
  try {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('附属资源必须是技能目录内的普通文件。');
    realTarget = fs.realpathSync(target);
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('未找到指定的技能附属资源文件。');
    throw error;
  }
  const realDiff = path.relative(skillDir, realTarget);
  if (!realDiff || realDiff === '..' || realDiff.startsWith('..' + path.sep) || path.isAbsolute(realDiff)) {
    throw new Error('附属资源实际路径超出技能目录范围。');
  }
  return realTarget;
}

export function readSkill(config = {}, args = {}, options = {}) {
  if (config.enableSkills === false) throw new Error('本地 Skills 功能已关闭，请在偏好设置中启用。');
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  if (!name) throw new Error('请提供要读取的 skill 名称。');
  const skills = discoverSkills(config, options);
  const target = skills.find(item => item.name === name) || skills.find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!target) {
    const available = skills.map(item => item.name).join(', ');
    throw new Error(`未找到名为 "${name}" 的本地 skill。` + (available ? ` 可用 skills: ${available}` : ''));
  }
  if (args.resource_path) {
    const resourceFile = resolveResourcePath(target.dir, args.resource_path);
    const buffer = fs.readFileSync(resourceFile);
    if (buffer.subarray(0, Math.min(buffer.length, 4096)).includes(0)) {
      throw new Error('该附属资源为二进制文件，不支持作为文本读取。');
    }
    const truncated = buffer.length > MAX_SKILL_BYTES;
    const content = (truncated ? buffer.subarray(0, MAX_SKILL_BYTES) : buffer).toString('utf8');
    return { name: target.name, resource_path: args.resource_path, content, truncated };
  }
  const raw = fs.readFileSync(target.file, 'utf8');
  const resources = listSkillResources(target.dir);
  return {
    name: target.name,
    description: target.description,
    manual_only: target.manual_only,
    source: target.source,
    content: raw,
    resources
  };
}

export function loadAlwaysOnRules(config = {}, options = {}) {
  if (config.enableRules === false) return [];
  const homeDir = getHomeDir(options);
  const candidates = [];
  if (config.enableGlobalSkills !== false) {
    candidates.push(
      { source: 'global', label: '~/.gemini/config/AGENTS.md', file: path.join(homeDir, '.gemini', 'config', 'AGENTS.md') },
      { source: 'global', label: '~/.gemini/config/GEMINI.md', file: path.join(homeDir, '.gemini', 'config', 'GEMINI.md') },
      { source: 'global', label: '~/.gemini/AGENTS.md', file: path.join(homeDir, '.gemini', 'AGENTS.md') }
    );
  }
  if (config.root) {
    candidates.push(
      { source: 'workspace', label: 'AGENTS.md', file: path.join(config.root, 'AGENTS.md') },
      { source: 'workspace', label: 'GEMINI.md', file: path.join(config.root, 'GEMINI.md') },
      { source: 'workspace', label: '.agents/AGENTS.md', file: path.join(config.root, '.agents', 'AGENTS.md') }
    );
  }
  const rules = [];
  const seen = new Set();
  let totalChars = 0;
  for (const item of candidates) {
    if (totalChars >= MAX_TOTAL_RULE_CHARS) break;
    if (!fs.existsSync(item.file)) continue;
    let realPath;
    try {
      const stat = fs.lstatSync(item.file);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
      realPath = fs.realpathSync(item.file);
      if (seen.has(realPath)) continue;
      seen.add(realPath);
    } catch {
      continue;
    }
    let text;
    try { text = fs.readFileSync(realPath, 'utf8').replace(/^\uFEFF/, '').trim(); } catch { continue; }
    if (!text) continue;
    const remaining = MAX_TOTAL_RULE_CHARS - totalChars;
    const limit = Math.min(MAX_RULE_CHARS, remaining);
    const truncated = text.length > limit;
    const content = truncated ? text.slice(0, limit) : text;
    totalChars += content.length;
    rules.push({ source: item.source, file: item.label, content, ...(truncated ? { truncated: true } : {}) });
  }
  return rules;
}

export function validateSkillDirs(dirs, previousDirs = []) {
  if (!Array.isArray(dirs) || dirs.length > 16 || dirs.some(dir => typeof dir !== 'string' || !path.isAbsolute(dir))) {
    throw new Error('自定义 Skill 目录必须是最多 16 个现有绝对路径。');
  }
  const previous = new Set(Array.isArray(previousDirs) ? previousDirs : []);
  const normalized = [];
  for (const dir of dirs) {
    let actual;
    try {
      actual = fs.realpathSync(dir);
      if (!fs.statSync(actual).isDirectory()) throw new Error('请选择现有文件夹作为 Skill 目录。');
    } catch (error) {
      if (error.code === 'ENOENT' && previous.has(dir)) actual = path.resolve(dir);
      else if (error.code === 'ENOENT') throw new Error('所选 Skill 目录不存在。');
      else throw error;
    }
    if (!normalized.includes(actual)) normalized.push(actual);
  }
  return normalized;
}
