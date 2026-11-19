import { parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Parsing is local, bounded, and never follows a document's remote assets.
globalThis.fetch = async () => { throw new Error('文档解析不允许访问网络。'); };
try {
  const { action, data } = workerData;
  if (action === 'document') {
    const { OfficeParser } = await import('officeparser');
    const ast = await OfficeParser.parseOffice(Buffer.from(data), { fileType: workerData.fileType, extractAttachments: false, ocr: false, allowRemoteAssets: false });
    const text = (await ast.to('text')).value;
    if (text.length > 16 * 1024 * 1024) throw new Error('文档提取文字超过 16 MiB，请拆分文档；原始文件仍可用 binary 视图读取。');
    const metadata = Object.fromEntries(['title', 'subject', 'pages', 'sheets', 'slides', 'pageCount', 'sheetNames'].filter(key => ast.metadata?.[key] !== undefined).map(key => [key, ast.metadata[key]]));
    parentPort.postMessage({ text, metadata, warnings: (ast.warnings ?? []).slice(0, 10).map(value => ({ code: value.code, message: value.message?.slice(0, 500) })) });
  } else {
    const sharp = (await import('sharp')).default;
    let source = Buffer.from(data), metadata;
    if (action === 'pdf-image') {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const { createCanvas } = await import('@napi-rs/canvas');
      const pdfRoot = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
      const loading = getDocument({ data: new Uint8Array(data), isEvalSupported: false, useSystemFonts: true,
        standardFontDataUrl: path.join(pdfRoot, 'standard_fonts').replaceAll('\\', '/') + '/',
        cMapUrl: path.join(pdfRoot, 'cmaps').replaceAll('\\', '/') + '/', cMapPacked: true });
      const document = await loading.promise;
      const number = workerData.page;
      if (!Number.isInteger(number) || number < 1 || number > document.numPages) throw new Error(`PDF 共 ${document.numPages} 页，页码从 1 开始。`);
      const page = await document.getPage(number), original = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(workerData.width / original.width, workerData.width / original.height) });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      source = canvas.toBuffer('image/png');
      metadata = { page: number, page_count: document.numPages };
      await loading.destroy();
    }
    const input = sharp(source, { limitInputPixels: 120000000, animated: false });
    const original = await input.metadata();
    let image;
    for (const quality of [85, 65, 45]) {
      image = await input.clone().rotate().resize({ width: workerData.width, height: workerData.width, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer();
      if (image.length <= 2 * 1024 * 1024) break;
    }
    if (image.length > 2 * 1024 * 1024) throw new Error('图像预览仍过大，请降低 width。');
    parentPort.postMessage({ kind: 'image', ...metadata, original_width: original.width, original_height: original.height,
      preview_max_edge: workerData.width, image: { mimeType: 'image/jpeg', data: image.toString('base64') },
      note: '这是缩放后的首帧/页面预览，原文件未修改。' });
  }
} catch (error) { parentPort.postMessage({ error: '文件解析失败：' + error.message }); }
