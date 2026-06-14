import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import type { ImportItem } from '../../shared/ipc';
import type { AppSettings, ImportResult, Receipt, Rule } from '../../shared/types';
import { insertReceipt, listRules, now, updateReceipt, getReceipt, getOriginalsDir, getThumbsDir } from './db';
import { readApiKey } from './keychain';
import { getAppSettings } from './settings';
import { extractReceipt } from './anthropic';

function extForMime(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'application/pdf') return '.pdf';
  return '.bin';
}

function saveBase64ToFile(base64: string, fullPath: string): void {
  fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
}

/** エラーメッセージ等に万一 APIキーが紛れ込んでも DB・画面に平文で残さないよう伏字化する。 */
function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***REDACTED***')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-***REDACTED***');
}

/** バイト先頭のマジックナンバーから実フォーマットを判定（サムネは拡張子 .png 固定だが中身は JPEG のこともある）。 */
function detectImageMime(buf: Buffer): 'image/png' | 'image/jpeg' {
  return buf[0] === 0xff && buf[1] === 0xd8 ? 'image/jpeg' : 'image/png';
}

interface ProcessOptions {
  onReceiptChanged?: (r: Receipt) => void;
  onProgress?: (done: number, total: number) => void;
}

/** Vision で抽出 → ルール適用 → DB 更新。成功した Receipt を返す。例外はそのまま投げる。 */
async function runVision(
  receipt: Receipt,
  apiKey: string,
  model: AppSettings['model'],
  base64: string,
  mime: 'image/png' | 'image/jpeg',
  rules: Rule[],
): Promise<Receipt> {
  const vision = await extractReceipt(apiKey, model, base64, mime);
  const ext = vision.extraction;

  // ルール適用 (店名キーワード一致)
  let category = ext.suggested_category;
  let payment = ext.payment_method;
  if (ext.vendor) {
    for (const r of rules) {
      if (ext.vendor.includes(r.keyword)) {
        if (r.account_category) category = r.account_category;
        if (r.payment_method) payment = r.payment_method;
        break;
      }
    }
  }

  return updateReceipt(receipt.id, {
    ocr_raw: vision.rawText,
    vendor: ext.vendor,
    issued_on: ext.issued_on,
    amount: ext.amount,
    tax_amount: ext.tax_amount,
    payment_method: payment,
    account_category: category,
    confidence: ext.confidence,
    memo: ext.notes ?? receipt.memo,
    error: null,
    status: ext.amount !== null && ext.vendor !== null && ext.issued_on !== null && ext.confidence >= 0.7
      ? 'confirmed'
      : 'pending',
  });
}

export async function processImports(items: ImportItem[], opts: ProcessOptions = {}): Promise<ImportResult[]> {
  const apiKey = readApiKey();
  const settings = getAppSettings();
  const originalsDir = getOriginalsDir();
  const thumbsDir = getThumbsDir();
  const rules = listRules();
  const results: ImportResult[] = [];

  async function processOne(item: ImportItem): Promise<ImportResult> {
    const id = nanoid(10);
    const originalPath = path.join(originalsDir, `${id}${extForMime(item.originalMime)}`);
    const thumbPath = path.join(thumbsDir, `${id}.png`);
    try {
      saveBase64ToFile(item.originalBytesBase64, originalPath);
      saveBase64ToFile(item.base64, thumbPath);
    } catch (e) {
      return { receiptId: -1, fileName: item.name, ok: false, error: (e as Error).message };
    }

    // 1. まず processing 状態で行を作る → UI に即座に出す
    const receipt = insertReceipt({
      source_path: originalPath,
      thumbnail_path: thumbPath,
      ocr_raw: null,
      vendor: null,
      issued_on: null,
      amount: null,
      tax_amount: null,
      payment_method: null,
      account_category: null,
      project_id: null,
      memo: item.name,                 // 元ファイル名を初期メモに
      status: 'processing',
      confidence: null,
      error: null,
      created_at: now(),
      updated_at: now(),
    });
    opts.onReceiptChanged?.(receipt);

    // 2. APIキーが無い場合は pending として保存
    if (!apiKey) {
      const updated = updateReceipt(receipt.id, {
        status: 'pending',
        error: 'APIキー未設定。設定画面で登録すると自動抽出が動きます。',
      });
      opts.onReceiptChanged?.(updated);
      return { receiptId: receipt.id, fileName: item.name, ok: true };
    }

    // 3. Vision で抽出
    try {
      const updated = await runVision(receipt, apiKey, settings.model, item.base64, item.mime, rules);
      opts.onReceiptChanged?.(updated);
      return { receiptId: receipt.id, fileName: item.name, ok: true };
    } catch (e) {
      const msg = redactSecrets((e as Error).message);
      const updated = updateReceipt(receipt.id, { status: 'failed', error: msg });
      opts.onReceiptChanged?.(updated);
      return { receiptId: receipt.id, fileName: item.name, ok: false, error: msg };
    }
  }

  for (let i = 0; i < items.length; i++) {
    results.push(await processOne(items[i]));
    opts.onProgress?.(i + 1, items.length);
  }

  return results;
}

/** 既存の領収書に対して OCR を再実行する。保存済みサムネ画像を Vision に再投入する。 */
export async function retryOcr(receiptId: number, opts: ProcessOptions = {}): Promise<Receipt> {
  const receipt = getReceipt(receiptId);
  if (!receipt) throw new Error('領収書が見つかりません');

  const processing = updateReceipt(receiptId, { status: 'processing', error: null });
  opts.onReceiptChanged?.(processing);

  const apiKey = readApiKey();
  if (!apiKey) {
    const updated = updateReceipt(receiptId, {
      status: 'pending',
      error: 'APIキー未設定。設定画面で登録すると自動抽出が動きます。',
    });
    opts.onReceiptChanged?.(updated);
    return updated;
  }

  const thumbPath = receipt.thumbnail_path;
  if (!thumbPath || !fs.existsSync(thumbPath)) {
    const updated = updateReceipt(receiptId, {
      status: 'failed',
      error: '読み取り用の画像が見つかりません。お手数ですが再インポートしてください。',
    });
    opts.onReceiptChanged?.(updated);
    return updated;
  }

  try {
    const buf = fs.readFileSync(thumbPath);
    const updated = await runVision(
      processing,
      apiKey,
      getAppSettings().model,
      buf.toString('base64'),
      detectImageMime(buf),
      listRules(),
    );
    opts.onReceiptChanged?.(updated);
    return updated;
  } catch (e) {
    const msg = redactSecrets((e as Error).message);
    const updated = updateReceipt(receiptId, { status: 'failed', error: msg });
    opts.onReceiptChanged?.(updated);
    return updated;
  }
}
