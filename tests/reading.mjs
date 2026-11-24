import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';
import sharp from 'sharp';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WorkspaceFiles } from '../workspace-files.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = path.join(project, '.local', 'tests', 'reading-' + randomUUID());
const root = path.join(fixture, 'workspace'), stateDir = path.join(fixture, 'state');
fs.mkdirSync(root, { recursive: true }); fs.mkdirSync(stateDir);
const config = { root, workspaceId: randomUUID(), key: randomUUID(), access: 'read', enabled: true, publicBase: '' };
const files = new WorkspaceFiles(config), checks = [];
const args = { workspace_id: config.workspaceId };
const read = (name, extra = {}) => files.run('read_file', { ...args, path: name, ...extra });
async function check(name, fn) { await fn(); checks.push({ name, passed: true }); }
function saveZip(name, entries) { fs.writeFileSync(path.join(root, name), zipSync(Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, typeof value === 'string' ? strToU8(value) : value])), { level: 0 })); }
function pdfFixture() {
  const content = 'BT /F1 18 Tf 30 220 Td (PDF_FIXTURE_TWO_PAGES) Tj ET\n0 0 1 rg 30 30 80 60 re f';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 250] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 250] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let text = '%PDF-1.4\n'; const offsets = [0];
  for (const [i, value] of objects.entries()) { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${value}\nendobj\n`; }
  const start = Buffer.byteLength(text);
  text += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(value => String(value).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return text;
}
const png = await sharp({ create: { width: 320, height: 200, channels: 3, background: '#de875c' } }).png().toBuffer();
fs.writeFileSync(path.join(root, 'image.png'), png);
fs.writeFileSync(path.join(root, 'sample.pdf'), pdfFixture());
const docx = {
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>WORD_中文正文</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>TABLE_CELL_42</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:t>ADDED_PARAGRAPH_AT_END</w:t></w:r></w:p></w:body></w:document>',
  'word/media/figure.png': png, 'padding.bin': randomBytes(3 * 1024 * 1024)
};
saveZip('large.docx', docx);
saveZip('sample.xlsx', {
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
  'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="r1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/worksheets/sheet1.xml': '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>XLSX_DATA</t></is></c><c r="B1"><v>42</v></c></row></sheetData></worksheet>'
});
saveZip('sample.pptx', {
  '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
  'ppt/presentation.xml': '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
  'ppt/slides/slide1.xml': '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>PPTX_SLIDE_TEXT</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>'
});
function npy(dtype = '<f8') {
  let header = `{'descr': '${dtype}', 'fortran_order': False, 'shape': (4,), }`;
  header += ' '.repeat((64 - (10 + header.length + 1) % 64) % 64) + '\n';
  const buffer = Buffer.alloc(10 + header.length + 32);
  buffer.write('\x93NUMPY', 0, 'latin1'); buffer[6] = 1; buffer.writeUInt16LE(header.length, 8); buffer.write(header, 10);
  for (let i = 0; i < 4; i++) buffer.writeDoubleLE(i + 0.25, 10 + header.length + 8 * i);
  return buffer;
}
fs.writeFileSync(path.join(root, 'array.npy'), npy());
fs.writeFileSync(path.join(root, 'objects.npy'), npy('|O8'));
saveZip('arrays.npz', { 'values.npy': npy(), 'notes.txt': 'ARCHIVE_TEXT' });

await check('Large UTF-8/emoji lines resume without loss, duplication or split characters', async () => {
  const source = ('中文🦊' + 'x'.repeat(211) + '\n').repeat(12000);
  fs.writeFileSync(path.join(root, 'large.txt'), source);
  let cursor, combined = '', pages = 0;
  do { const r = await read('large.txt', { cursor, max_chars: 61003, lines: 1000 }); combined += r.text; cursor = r.next_cursor; assert.ok(++pages < 100); } while (cursor);
  assert.equal(combined, source);
  assert.equal((await read('large.txt', { offset: 11999, lines: 1 })).text, source.split('\n')[11999] + '\n');
});
await check('Single huge line is bounded and cursors reject edits and other files', async () => {
  fs.writeFileSync(path.join(root, 'long.txt'), '🦊'.repeat(1000000));
  const r = await read('long.txt', { max_chars: 1001 });
  assert.equal(r.text.length, 1000); assert.equal(r.has_more, true);
  const next = await read('long.txt', { cursor: r.next_cursor, max_chars: 1001 }); assert.equal(next.text, r.text);
  await assert.rejects(async () => read('large.txt', { cursor: r.next_cursor }));
  fs.appendFileSync(path.join(root, 'long.txt'), 'changed');
  await assert.rejects(async () => read('long.txt', { cursor: r.next_cursor }));
});
await check('UTF-16 text and explicit Windows encoding are readable', async () => {
  fs.writeFileSync(path.join(root, 'utf16.txt'), Buffer.concat([Buffer.from([255,254]), Buffer.from('你好\n世界🦊', 'utf16le')]));
  assert.equal((await read('utf16.txt')).text, '你好\n世界🦊');
  fs.writeFileSync(path.join(root, 'latin.txt'), Buffer.from('caf\xe9', 'latin1'));
  assert.equal((await read('latin.txt', { encoding: 'windows-1252', view: 'text' })).text, 'café');
});
await check('DOCX over 2 MiB extracts body, table and final paragraph; images are discoverable', async () => {
  const r = await read('large.docx');
  assert.ok(r.size > 2 * 1024 * 1024); assert.match(r.text, /WORD_中文正文/); assert.match(r.text, /TABLE_CELL_42/); assert.match(r.text, /ADDED_PARAGRAPH_AT_END/);
  assert.equal(r.image_count, 1); assert.equal(r.image, undefined); assert.ok(JSON.stringify(r).length < 6000);
});
await check('DOCX embedded image and standalone image return bounded real JPEG previews', async () => {
  for (const [name, extra] of [['large.docx', { view: 'image', image_index: 0 }], ['image.png', {}]]) {
    const r = await read(name, extra), buffer = Buffer.from(r.image.data, 'base64');
    assert.equal(r.image.mimeType, 'image/jpeg'); assert.equal((await sharp(buffer).metadata()).width, 320); assert.ok(buffer.length < 2 * 1024 * 1024);
  }
});
await check('PDF text and graphical pages are both accessible; invalid pages fail', async () => {
  assert.match((await read('sample.pdf')).text, /PDF_FIXTURE_TWO_PAGES/);
  const r = await read('sample.pdf', { view: 'image', page: 2, width: 1024 });
  assert.equal(r.page_count, 2); assert.equal(r.page, 2); assert.equal(r.kind, 'image');
  await assert.rejects(async () => read('sample.pdf', { view: 'image', page: 3 }));
});
await check('XLSX cells and PPTX slide text are extracted locally', async () => {
  const xlsx = await read('sample.xlsx'), pptx = await read('sample.pptx');
  assert.match(xlsx.text, /XLSX_DATA/); assert.match(xlsx.text, /42/); assert.match(pptx.text, /PPTX_SLIDE_TEXT/);
});
await check('NPY and NPZ expose dtype, shape and numeric values without executing pickle', async () => {
  const array = await read('array.npy'), packed = await read('arrays.npz', { member: 'values.npy' });
  assert.deepEqual(array.shape, [4]); assert.deepEqual(array.values, [0.25,1.25,2.25,3.25]); assert.deepEqual(packed.values, array.values);
  assert.equal((await read('objects.npy')).values.length, 0);
  assert.equal((await read('arrays.npz')).total_entries, 2);
  assert.equal((await read('arrays.npz', { member: 'notes.txt' })).text, 'ARCHIVE_TEXT');
});
await check('Unknown binaries use explicit bounded bytes, including reads beyond 2 MiB', async () => {
  const data = Buffer.alloc(3 * 1024 * 1024); data[data.length - 1] = 42; fs.writeFileSync(path.join(root, 'data.xtc'), data);
  const first = await read('data.xtc'); assert.equal(first.kind, 'binary'); assert.ok(first.bytes_read <= 65536);
  const last = await read('data.xtc', { view: 'binary', byte_offset: data.length - 1, byte_length: 1 });
  assert.equal(Buffer.from(last.data, 'base64')[0], 42); assert.equal(last.has_more, false);
});
await check('Oversized ZIP metadata is rejected before decompression', async () => {
  const bomb = Buffer.from(zipSync({ 'bomb.txt': strToU8('x') }));
  const central = bomb.indexOf(Buffer.from([80,75,1,2]));
  bomb.writeUInt32LE(0x30000000, central + 24); bomb.writeUInt32LE(0x30000000, 22);
  fs.writeFileSync(path.join(root, 'bomb.zip'), bomb);
  await assert.rejects(async () => read('bomb.zip'), /512 MiB/);
});
await check('Directory pagination reaches files after entry 500 without duplication', async () => {
  const folder = path.join(root, 'many'); fs.mkdirSync(folder);
  for (let i = 0; i < 1203; i++) fs.writeFileSync(path.join(folder, String(i).padStart(4, '0') + '.txt'), '');
  const names = []; let offset = 0;
  do { const r = files.run('list_files', { ...args, path: 'many', offset }); names.push(...r.entries.map(v => v.name)); offset = r.next_offset; } while (offset !== null);
  assert.equal(names.length, 1203); assert.equal(new Set(names).size, 1203);
});
await check('Invalid files, out-of-scope paths and changed permissions cannot expose data', async () => {
  fs.writeFileSync(path.join(root, 'broken.docx'), 'not a document');
  await assert.rejects(async () => read('broken.docx'));
  for (const name of ['../outside.docx', '..\\outside.pdf', 'image.png:stream']) await assert.rejects(async () => read(name));
  const pending = read('image.png'); files.config.enabled = false;
  await assert.rejects(async () => pending); files.config.enabled = true;
  assert.throws(() => files.run('write_file', { ...args, path: 'no.txt', content: 'BAD' }));
});
await check('Text write tools cannot corrupt readable Office documents, PDFs or images', async () => {
  const editable = new WorkspaceFiles({ ...config, access: 'edit', enabled: true });
  for (const name of ['large.docx', 'sample.pdf', 'image.png', 'array.npy']) {
    const before = fs.readFileSync(path.join(root, name));
    assert.throws(() => editable.run('write_file', { ...args, path: name, content: 'NOT_BINARY', mode: 'rewrite' }));
    assert.throws(() => editable.run('edit_file', { ...args, path: name, old_text: 'PK', new_text: 'BAD' }));
    assert.deepEqual(fs.readFileSync(path.join(root, name)), before);
  }
});

fs.writeFileSync(path.join(stateDir, 'config.json'), JSON.stringify({ ...config, fileAutoStart: true }));
const address = 'http://127.0.0.1:3026';
const child = spawn(process.execPath, [path.join(project, 'server.mjs')], { env: { ...process.env, GEMINI_WORKSPACE_PORT: '3026', GEMINI_WORKSPACE_STATE: stateDir }, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
const client = new Client({ name: 'document-reader-verifier', version: '1' });
let stderr = ''; child.stderr.on('data', value => stderr += value);
try {
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('Server timeout: ' + stderr)), 10000); child.stdout.once('data', () => { clearTimeout(timeout); resolve(); }); child.once('exit', () => { clearTimeout(timeout); reject(new Error(stderr)); }); });
  const state = await (await fetch(address + '/api/state')).json();
  await client.connect(new StreamableHTTPClientTransport(new URL(state.localMcp)));
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 12); assert.ok(tools.find(v => v.name === 'read_file').inputSchema.properties.view);
  const call = (name, extra = {}) => client.callTool({ name: 'read_file', arguments: { workspace_id: state.workspace_id, path: name, ...extra } });
  await check('Real MCP returns DOCX text instead of Promise/empty JSON and discovers images', async () => {
    const r = await call('large.docx'); assert.equal(r.isError, false); assert.match(JSON.parse(r.content[0].text).text, /ADDED_PARAGRAPH_AT_END/);
    assert.equal(r.content.length, 1); assert.equal(r.structuredContent, undefined);
  });
  await check('Real MCP returns image content once, with no duplicate base64 in text', async () => {
    const r = await call('large.docx', { view: 'image', image_index: 0 }); assert.equal(r.isError, false);
    assert.equal(r.content[1].type, 'image'); assert.ok(r.content[1].data); assert.equal(JSON.parse(r.content[0].text).image, undefined);
    assert.equal((await call('large.docx', { image_index: -1, view: 'image' })).isError, true);
  });
} finally { await client.close().catch(() => {}); await new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); }); }
fs.writeFileSync(path.join(project, '.local/reading-test-results.json'), JSON.stringify({ passed: true, fixture, checks, realGeminiMessagesSent: 0 }, null, 2));
console.log(JSON.stringify({ passed: true, checks: checks.length, realGeminiMessagesSent: 0 }));
