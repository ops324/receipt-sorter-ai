// renderer side: 受け取った File を、Vision API に渡す PNG/JPEG base64 と
// 「原本」base64 のペアに変換する。PDF は pdfjs で1ページ目を PNG 化する。

// Vite の ?url 経由で pdfjs の worker URL を解決する。
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MAX_DIMENSION = 1800;

export interface PreparedImage {
  name: string;
  base64: string;
  mime: 'image/png' | 'image/jpeg';
  originalMime: string;
  originalBytesBase64: string;
}

function readAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as ArrayBuffer);
    fr.onerror = () => reject(fr.error ?? new Error('read failed'));
    fr.readAsArrayBuffer(file);
  });
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function shrinkImage(file: File): Promise<{ base64: string; mime: 'image/png' | 'image/jpeg' }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const longest = Math.max(img.width, img.height);
    const scale = longest > MAX_DIMENSION ? MAX_DIMENSION / longest : 1;
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    const mime: 'image/png' | 'image/jpeg' = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, 0.9);
    return { base64: dataUrl.split(',')[1], mime };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function pdfFirstPagePng(file: File): Promise<string> {
  const buf = await readAsArrayBuffer(file);
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas context unavailable');
  await page.render({ canvasContext: ctx, viewport }).promise;
  // 大きすぎる場合は縮小
  const longest = Math.max(canvas.width, canvas.height);
  if (longest > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longest;
    const shrink = document.createElement('canvas');
    shrink.width = Math.round(canvas.width * scale);
    shrink.height = Math.round(canvas.height * scale);
    const sctx = shrink.getContext('2d');
    if (!sctx) throw new Error('canvas context unavailable');
    sctx.drawImage(canvas, 0, 0, shrink.width, shrink.height);
    return shrink.toDataURL('image/png').split(',')[1];
  }
  return canvas.toDataURL('image/png').split(',')[1];
}

export async function prepareFile(file: File): Promise<PreparedImage> {
  const originalBytesBase64 = bufferToBase64(await readAsArrayBuffer(file));
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    const base64 = await pdfFirstPagePng(file);
    return { name: file.name, base64, mime: 'image/png', originalMime: 'application/pdf', originalBytesBase64 };
  }
  if (file.type.startsWith('image/')) {
    const { base64, mime } = await shrinkImage(file);
    return { name: file.name, base64, mime, originalMime: file.type, originalBytesBase64 };
  }
  throw new Error(`未対応のファイル形式: ${file.name}`);
}
