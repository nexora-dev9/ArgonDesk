import fs from 'node:fs';
import path from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';
import { WorkspaceFiles } from './workspace-files.mjs';
import { readFile } from './file-reader.mjs';

const ignored = new Set(['node_modules', '.venv', '.git', '__pycache__', 'dist', 'build']);
const binary = new Set(['.docx','.pdf','.pptx','.xlsx','.odt','.ods','.odp','.odg','.epub','.rtf','.zip','.npz','.npy','.png','.jpg','.jpeg','.webp','.gif','.tif','.tiff','.bmp','.avif','.exe','.dll','.pyd','.pyc','.xtc','.trr','.tpr','.edr','.cpt','.mat','.pkl','.woff','.woff2','.ttf','.otf']);
try {
  const { root, workspaceId, name, args } = workerData;
  const files = new WorkspaceFiles({ root, workspaceId, access: 'read', enabled: true });
  const results = [], stack = [args.path ?? '.'], start = performance.now();
  const regex = name === 'search_text' && args.regex ? new RegExp(args.query, args.case_sensitive ? 'u' : 'iu') : null;
  const needle = args.case_sensitive ? args.query : args.query?.toLowerCase();
  const pattern = args.pattern?.replaceAll('\\', '/').toLowerCase(), glob = pattern && /[*?\[\]{}()!]/.test(pattern);
  let visited = 0, skipped = 0, longLines = 0, truncated = false, responseChars = 0;
  const stopped = () => results.length >= args.max_results || visited >= 100000 || performance.now() - start > 8000 || responseChars > 256000;
  const matchLine = (relative, text, line) => {
    const index = regex ? regex.exec(text)?.index ?? -1 : (args.case_sensitive ? text : text.toLowerCase()).indexOf(needle);
    if (index < 0) return;
    const from = Math.max(0, index - 160), preview = text.slice(from, from + 1000);
    results.push({ path: relative, line_number: line, column: index + 1, text: preview, line_truncated: from > 0 || text.length > 1000 });
    responseChars += preview.length + relative.length;
  };
  while (stack.length && !stopped()) {
    const relative = stack.pop();
    let target, stat;
    try { target = files.resolve(relative); stat = fs.lstatSync(target); } catch { skipped++; continue; }
    if (stat.isDirectory()) {
      if (path.relative(root, target) && ignored.has(path.basename(target).toLowerCase())) continue;
      let children;
      try { children = fs.readdirSync(target).sort().reverse(); }
      catch { skipped++; continue; }
      for (const child of children) stack.push(path.join(relative, child));
      continue;
    }
    if (!stat.isFile()) { skipped++; continue; }
    visited++;
    const normalized = path.relative(root, target).replaceAll('\\', '/');
    if (name === 'find_files') {
      const candidate = pattern.includes('/') ? normalized.toLowerCase() : path.basename(target).toLowerCase();
      if (glob ? path.posix.matchesGlob(candidate, pattern) : candidate.includes(pattern)) results.push({ path: normalized, size: stat.size });
      continue;
    }
    if (binary.has(path.extname(target).toLowerCase())) { skipped++; continue; }
    let cursor, carry = '', lineNumber = 1, discard = false;
    do {
      let part;
      try { part = readFile(target, { path: normalized, cursor, lines: 1000, max_chars: 64000 }); } catch { skipped++; break; }
      if (part.kind !== 'text') { skipped++; break; }
      const segments = part.text.split('\n');
      for (let i = 0; i < segments.length; i++) {
        if (!discard) carry += segments[i];
        if (carry.length > 65536) { discard = true; carry = ''; longLines++; }
        if (i < segments.length - 1) { if (!discard) matchLine(normalized, carry.replace(/\r$/, ''), lineNumber); carry = ''; discard = false; lineNumber++; }
        if (stopped()) break;
      }
      cursor = part.next_cursor;
      if (!cursor && carry && !discard && !stopped()) matchLine(normalized, carry.replace(/\r$/, ''), lineNumber);
    } while (cursor && !stopped());
  }
  truncated = stopped();
  parentPort.postMessage({ results, truncated, visited_files: visited, skipped_files_or_links: skipped, skipped_long_lines: longLines,
    ignored_directories: [...ignored], ...(longLines ? { note: '超过 65536 字符的单行已跳过；可用 read_file 续读该类文件。' } : {}) });
} catch (error) { parentPort.postMessage({ error: error.message }); }
