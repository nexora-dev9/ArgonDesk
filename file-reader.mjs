import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import yauzl from 'yauzl';

const DOCUMENTS = new Set(['.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods', '.odg', '.pdf', '.rtf', '.epub']);
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff', '.bmp', '.avif']);
const MAX_DOCUMENT = 256 * 1024 * 1024;
const MAX_EXPANDED = 512 * 1024 * 1024;
const MAX_CHARS = 64000;
const cache = new Map();

export function assertTextWrite(target) {
  const extension = path.extname(target).toLowerCase();
  if (DOCUMENTS.has(extension) || IMAGES.has(extension) || ['.doc', '.xls', '.ppt', '.zip', '.npz', '.npy', '.mat', '.tpr', '.trr', '.xtc', '.edr', '.cpt', '.pkl', '.exe', '.dll', '.pyd', '.pyc'].includes(extension)) {
    throw new Error('该格式仅提供读取；文本写入工具不能覆盖文档、图片或专业二进制文件。');
  }
}

function stamp(target, stat) {
  return createHash('sha256').update(`${target}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}`).digest('hex').slice(0, 24);
}
function cursor(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function resume(value, tag, kind) {
  if (!value) return null;
  let result;
  try { result = JSON.parse(Buffer.from(value, 'base64url').toString()); } catch {}
  if (!result || result.tag !== tag || result.kind !== kind || !Number.isSafeInteger(result.position) || result.position < 0 ||
      !Number.isSafeInteger(result.line) || result.line < 0 || !Number.isSafeInteger(result.column) || result.column < 0) {
    throw new Error('续读位置无效或文件已变化，请从头读取。');
  }
  return result;
}
function range(args) {
  const offset = args.offset ?? 0, lines = args.lines ?? 200, chars = args.max_chars ?? 48000;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(lines) || lines < 1 || lines > 1000 ||
      !Number.isInteger(chars) || chars < 1000 || chars > MAX_CHARS) throw new Error('读取范围无效。');
  return { offset, lines, chars };
}
function takeText(text, args, tag) {
  const limits = range(args), previous = resume(args.cursor, tag, 'document');
  const lines = text.split('\n');
  let position = previous?.position ?? 0, line = previous?.line ?? limits.offset, column = previous?.column ?? 0;
  if (!previous) for (let i = 0; i < Math.min(limits.offset, lines.length); i++) position += lines[i].length + (i < lines.length - 1 ? 1 : 0);
  if (position > text.length) throw new Error('续读位置超出文件。');
  const start = position;
  let count = 0;
  while (position < text.length && position - start < limits.chars && count < limits.lines) {
    const newline = text.indexOf('\n', position);
    let end = Math.min(newline < 0 ? text.length : newline + 1, start + limits.chars);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
    if (end <= position) break;
    if (newline >= 0 && end > newline) { line++; column = 0; count++; }
    else column += end - position;
    position = end;
  }
  const hasMore = position < text.length;
  return { total_lines: lines.length, offset: previous?.line ?? limits.offset, text: text.slice(start, position), has_more: hasMore,
    next_offset: hasMore ? line : null, next_cursor: hasMore ? cursor({ kind: 'document', tag, position, line, column }) : null };
}

function readText(fd, stat, args, tag, encoding, bom = 0) {
  const limits = range(args), previous = resume(args.cursor, tag, 'text');
  if (previous?.encoding !== undefined && previous.encoding !== encoding) throw new Error('续读时请沿用相同编码。');
  let position = previous?.position ?? bom, line = previous?.line ?? 0, column = previous?.column ?? 0;
  if (position > stat.size) throw new Error('续读位置超出文件。');
  let output = '', returnedLines = 0, pending = 0, done = false;
  const decoder = new TextDecoder(encoding, { fatal: true, ignoreBOM: true });
  const buffer = Buffer.alloc(65536);
  const byteLength = value => Buffer.byteLength(value, encoding === 'utf-8' ? 'utf8' : 'utf16le');
  while (position < stat.size && !done) {
    const start = position - pending;
    const bytes = fs.readSync(fd, buffer, 0, Math.min(buffer.length, stat.size - position), position);
    if (!bytes) break;
    position += bytes;
    const text = decoder.decode(buffer.subarray(0, bytes), { stream: position < stat.size });
    pending += bytes - byteLength(text);
    let index = 0;
    while (index < text.length) {
      const newline = text.indexOf('\n', index);
      const end = newline < 0 ? text.length : newline + 1;
      if (!previous && line < limits.offset) {
        if (newline >= 0) { line++; column = 0; } else column += end - index;
        index = end;
        continue;
      }
      let take = Math.min(end - index, limits.chars - output.length);
      if (take && /[\uD800-\uDBFF]/.test(text[index + take - 1]) && /[\uDC00-\uDFFF]/.test(text[index + take] || '')) take--;
      output += text.slice(index, index + take);
      if (newline >= 0 && index + take > newline) { line++; column = 0; returnedLines++; }
      else column += take;
      index += take;
      if (output.length >= limits.chars - 1 || returnedLines >= limits.lines || take === 0) {
        position = start + byteLength(text.slice(0, index));
        done = true;
        break;
      }
    }
  }
  const hasMore = position < stat.size;
  return { encoding, total_lines: hasMore ? null : line + 1, offset: previous?.line ?? limits.offset, text: output, has_more: hasMore,
    next_offset: hasMore ? line : null, next_cursor: hasMore ? cursor({ kind: 'text', tag, position, line, column, encoding }) : null };
}

async function archive(buffer) {
  const zip = await new Promise((resolve, reject) => yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, value) => error ? reject(error) : resolve(value)));
  const entries = [];
  let expanded = 0;
  await new Promise((resolve, reject) => {
    zip.on('error', reject);
    zip.on('end', resolve);
    zip.on('entry', entry => {
      expanded += entry.uncompressedSize;
      if (entries.length >= 10000 || expanded > MAX_EXPANDED || (entry.generalPurposeBitFlag & 1)) {
        zip.close(); reject(new Error('压缩包加密、条目过多或展开体积超过 512 MiB。')); return;
      }
      entries.push(entry); zip.readEntry();
    });
    zip.readEntry();
  });
  return { zip, entries };
}
async function entryBytes(zip, entry, limit = MAX_DOCUMENT) {
  if (entry.uncompressedSize > limit) throw new Error('该压缩条目超过单次解析范围，请按原始二进制分段读取。');
  return new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => {
    if (error) return reject(error);
    const chunks = []; let bytes = 0;
    stream.on('data', data => { bytes += data.length; if (bytes > limit) { stream.destroy(); reject(new Error('压缩条目展开体积超过解析范围。')); } else chunks.push(data); });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  }));
}
function worker(buffer, options) {
  return new Promise((resolve, reject) => {
    const data = Uint8Array.from(buffer);
    const child = new Worker(new URL('./document-worker.mjs', import.meta.url), {
      workerData: { data, ...options }, transferList: [data.buffer], execArgv: [], resourceLimits: { maxOldGenerationSizeMb: 384 }
    });
    const timer = setTimeout(() => { child.terminate(); reject(new Error('文件解析超过 45 秒，请缩小读取范围或使用 binary 视图。')); }, 45000);
    const finish = () => { clearTimeout(timer); child.terminate(); };
    child.once('message', result => { finish(); result.error ? reject(new Error(result.error)) : resolve(result); });
    child.once('error', error => { finish(); reject(error); });
    child.once('exit', code => { clearTimeout(timer); if (code) reject(new Error('解析进程已停止；文件可能过大或损坏。')); });
  });
}
function binary(fd, stat, args) {
  const offset = args.byte_offset ?? 0, count = args.byte_length ?? 4096;
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(count) || count < 1 || count > 65536) throw new Error('二进制读取范围无效。');
  const data = Buffer.alloc(Math.min(count, Math.max(0, stat.size - offset)));
  fs.readSync(fd, data, 0, data.length, offset);
  return { kind: 'binary', byte_offset: offset, bytes_read: data.length, encoding: 'base64', data: data.toString('base64'),
    hex_preview: data.subarray(0, 64).toString('hex'), has_more: offset + data.length < stat.size,
    next_byte_offset: offset + data.length < stat.size ? offset + data.length : null,
    note: '这是原始字节，不等于已理解其语义。专用轨迹、模型或可执行文件需要相应格式解析器；不会执行文件。' };
}
function numpy(buffer, args) {
  if (buffer.subarray(0, 6).toString('latin1') !== '\x93NUMPY') throw new Error('不是有效的 NPY 数据。');
  const major = buffer[6], headerStart = major === 1 ? 10 : 12;
  const headerSize = major === 1 ? buffer.readUInt16LE(8) : buffer.readUInt32LE(8);
  if (headerStart + headerSize > buffer.length) throw new Error('NPY 文件头不完整。');
  const header = buffer.subarray(headerStart, headerStart + headerSize).toString();
  const dtype = /['"]descr['"]\s*:\s*['"]([^'"]+)['"]/.exec(header)?.[1];
  const shape = /['"]shape['"]\s*:\s*\(([^)]*)\)/.exec(header)?.[1].split(',').map(value => value.trim()).filter(Boolean).map(Number);
  if (shape?.some(value => !Number.isSafeInteger(value) || value < 0)) throw new Error('NPY 数组形状无效。');
  const fortran = /['"]fortran_order['"]\s*:\s*True/.test(header);
  const formats = { f8: 'getFloat64', f4: 'getFloat32', i4: 'getInt32', u4: 'getUint32', i2: 'getInt16', u2: 'getUint16', i1: 'getInt8', u1: 'getUint8', b1: 'getUint8', i8: 'getBigInt64', u8: 'getBigUint64' };
  const format = dtype?.replace(/^[<>=|]/, ''), width = Number(format?.slice(1));
  const start = headerStart + headerSize, offset = args.offset ?? 0, values = [];
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('数组读取位置无效。');
  if (format && formats[format]) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
    for (let i = offset; i < Math.min(offset + (args.lines ?? 200), Math.floor((buffer.length - start) / width)); i++) {
      const value = view[formats[format]](start + i * width, dtype[0] !== '>');
      values.push(typeof value === 'bigint' ? value.toString() : Number.isFinite(value) ? value : String(value));
    }
  }
  const total = shape?.reduce((a, b) => a * b, 1);
  return { kind: 'numpy', dtype, shape, order: fortran ? 'Fortran' : 'C', offset, values,
    has_more: values.length > 0 && offset + values.length < total, next_offset: values.length > 0 && offset + values.length < total ? offset + values.length : null,
    ...(!formats[format] ? { note: '该数组类型仅提供元数据；不会反序列化 object/pickle。可用 binary 视图读取原始字节。' } : {}) };
}

export async function readRichFile(fd, stat, target, args) {
  const extension = path.extname(target).toLowerCase(), tag = stamp(target, stat);
  const view = args.view ?? 'auto';
  if (stat.size > MAX_DOCUMENT) return { ...binary(fd, stat, args), note: '容器/图像单次解析上限为 256 MiB；此结果为原始字节，可用 next_byte_offset 继续。大文本读取不受此限制。' };
  const data = fs.readFileSync(fd);
  if (view === 'binary') return binary(fd, stat, args);
  if (view === 'image' && extension === '.pdf') return worker(data, { action: 'pdf-image', page: args.page ?? 1, width: args.width ?? 2048 });
  if (IMAGES.has(extension) || (extension === '.svg' && view === 'image')) return worker(data, { action: 'image', width: args.width ?? 2048 });
  if (extension === '.npy') return numpy(data, args);
  const zipped = data.length > 3 && data.subarray(0, 2).toString() === 'PK';
  let container;
  try {
    if (zipped) container = await archive(data);
    const images = container?.entries.filter(entry => !entry.fileName.endsWith('/') && /(?:^|\/)(?:media|pictures)\//i.test(entry.fileName))
      .sort((a, b) => a.fileName.localeCompare(b.fileName, 'en', { numeric: true })) ?? [];
    if (view === 'image') {
      const index = args.image_index ?? 0;
      if (!Number.isInteger(index) || index < 0 || !images[index]) throw new Error('图片编号不存在。请先读取文档以查看 images 列表。');
      return { ...(await worker(await entryBytes(container.zip, images[index]), { action: 'image', width: args.width ?? 2048 })), image_index: index, image_name: images[index].fileName };
    }
    if (container && !DOCUMENTS.has(extension)) {
      if (args.member) {
        const entry = container.entries.find(value => value.fileName === args.member && !value.fileName.endsWith('/'));
        if (!entry) throw new Error('压缩条目不存在。');
        const content = await entryBytes(container.zip, entry);
        if (path.extname(entry.fileName).toLowerCase() === '.npy') return { member: args.member, ...numpy(content, args) };
        return { kind: 'archive-member', member: args.member, size: content.length, ...takeText(new TextDecoder('utf-8', { fatal: true }).decode(content), args, tag + args.member) };
      }
      const offset = args.offset ?? 0, limit = args.lines ?? 200;
      range(args);
      return { kind: 'archive', total_entries: container.entries.length, offset,
        entries: container.entries.slice(offset, offset + limit).map(entry => ({ name: entry.fileName, size: entry.uncompressedSize, compressed_size: entry.compressedSize })),
        next_offset: offset + limit < container.entries.length ? offset + limit : null, note: '使用 member 读取指定条目；不会解压到磁盘或执行内容。' };
    }
    if (!DOCUMENTS.has(extension)) return binary(fd, stat, args);
    let parsed = cache.get(tag);
    if (!parsed) {
      const promise = worker(data, { action: 'document', fileType: extension.slice(1) });
      cache.set(tag, promise);
      while (cache.size > 3) cache.delete(cache.keys().next().value);
      promise.catch(() => cache.delete(tag));
      parsed = promise;
    }
    const result = await parsed;
    return { kind: 'document', format: extension.slice(1), ...takeText(result.text, args, tag), metadata: result.metadata,
      image_count: images.length, images: images.slice(0, 100).map((entry, index) => ({ index, name: entry.fileName, bytes: entry.uncompressedSize })),
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
      note: extension === '.pdf' ? '正文不代表已看过页面图形。可用 view=image 与 page（从1开始）查看页面。' : '正文不代表已看过插图。可用 view=image 与 image_index 查看内嵌图片。' };
  } finally { container?.zip.close(); }
}

export function readFile(target, args) {
  range(args);
  if (!['auto', 'text', 'image', 'binary'].includes(args.view ?? 'auto')) throw new Error('读取视图无效。');
  if (args.width !== undefined && (!Number.isInteger(args.width) || args.width < 256 || args.width > 4096)) throw new Error('图片预览宽度应在 256–4096 之间。');
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  const stat = fs.fstatSync(fd), extension = path.extname(target).toLowerCase();
  if (!stat.isFile() || stat.nlink > 1) { fs.closeSync(fd); throw new Error('只支持工作区中的普通文件。'); }
  const base = { path: args.path, size: stat.size };
  try {
    const sample = Buffer.alloc(Math.min(8192, stat.size));
    fs.readSync(fd, sample, 0, sample.length, 0);
    const rich = DOCUMENTS.has(extension) || IMAGES.has(extension) || ['.zip', '.npz', '.npy'].includes(extension) || args.view === 'image';
    if (args.view === 'binary') { const result = { ...base, ...binary(fd, stat, args) }; fs.closeSync(fd); return result; }
    if (rich) return readRichFile(fd, stat, target, args).then(value => ({ ...base, ...value })).finally(() => fs.closeSync(fd));
    const encoding = args.encoding ?? (sample[0] === 255 && sample[1] === 254 ? 'utf-16le' : sample[0] === 254 && sample[1] === 255 ? 'utf-16be' : 'utf-8');
    const bom = encoding.startsWith('utf-16') && (sample[0] === 255 || sample[0] === 254) ? 2 : sample.subarray(0, 3).equals(Buffer.from([239,187,191])) ? 3 : 0;
    let isText = true;
    try { const preview = new TextDecoder(encoding, { fatal: true }).decode(sample, { stream: true }); isText = !/[\x00-\x08\x0E-\x1F]/.test(preview); } catch { isText = false; }
    let value;
    if (!isText && args.view !== 'text') value = binary(fd, stat, args);
    else if (['utf-8', 'utf-16le', 'utf-16be'].includes(encoding)) value = { kind: 'text', ...readText(fd, stat, args, stamp(target, stat), encoding, bom) };
    else {
      if (stat.size > 32 * 1024 * 1024) throw new Error('该编码的大文本请先转换为 UTF-8；原始字节可用 binary 视图分段读取。');
      value = { kind: 'text', encoding, ...takeText(new TextDecoder(encoding, { fatal: true }).decode(fs.readFileSync(fd)), args, stamp(target, stat)) };
    }
    fs.closeSync(fd); return { ...base, ...value };
  } catch (error) { try { fs.closeSync(fd); } catch {} throw error; }
}
