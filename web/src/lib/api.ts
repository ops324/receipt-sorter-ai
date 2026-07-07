import { runOcr, type OcrExtraction } from './ocr';
import { getApiKey, setApiKeyLocal, hasApiKeyLocal } from './local-key';
import * as db from './local-db';
import type {
  AppApi, ImportItem, ImportProgress, ReceiptFilter,
} from '@shared/ipc';
import type {
  AccountCategory, AppSettings, CostEstimate, ExportOptions, ImportResult,
  PaymentMethod, Project, Receipt, Rule,
} from '@shared/types';

// ───────────────────────────────────────────────────────────
// アリサ Web版のデータ継ぎ目（都度処理・BYOK版）。
// Electron 版の window.api(AppApi) と同一シグネチャを、この端末の IndexedDB
// (local-db) と ブラウザ直叩き OCR (ocr) で実装し、main.tsx で window.api = api とする。
// サーバー(Supabase/関数)・ログインは不要。鍵は端末内(local-key)。
// ───────────────────────────────────────────────────────────

const SETTINGS_META_KEY = 'settings';
const OCR_CONCURRENCY = 3; // iPad の発熱・メモリ対策で並列度を絞る

// 概算単価(円/枚)。Electron版 anthropic.ts と揃える（目安表記）。
const PER_RECEIPT_YEN: Record<string, number> = {
  'claude-haiku-4-5-20251001': 0.5,
  'claude-sonnet-4-6': 2.0,
  'claude-opus-4-7': 7.0,
};
function perReceiptYen(model: string): number {
  return PER_RECEIPT_YEN[model] ?? 2.0;
}

const DEFAULT_SETTINGS: Omit<AppSettings, 'apiKey' | 'hasApiKey'> = {
  model: 'claude-haiku-4-5-20251001',
  defaultCategory: '消耗品費',
  csvDialect: 'generic',
  folderRoot: null,
};

// IndexedDB に持つ画像（プレビュー/再OCR用）。原本・サムネの base64 をそのまま保持。
interface StoredImage {
  id: number;
  originalBase64: string;
  originalMime: string;
  thumbBase64: string;
  thumbMime: 'image/png' | 'image/jpeg';
}

// コスト試算用の利用記録。
interface UsageRow {
  id: number;
  occurred_at: string;
  model: string;
  estimated_yen: number;
}

// ── ローカルイベント（Electron IPC イベントの代替）────────────────
const receiptChangedCbs = new Set<(r: Receipt) => void>();
const importProgressCbs = new Set<(p: ImportProgress) => void>();
function emitReceiptChanged(r: Receipt) { receiptChangedCbs.forEach((cb) => cb(r)); }
function emitImportProgress(p: ImportProgress) { importProgressCbs.forEach((cb) => cb(p)); }

// ── ヘルパ ───────────────────────────────────────────────────
function nowIso(): string { return new Date().toISOString(); }

// エラーメッセージ等に鍵が混ざって保存されるのを防ぐ。
function redactKey(text: string): string {
  return (text ?? '')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***REDACTED***')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-***REDACTED***');
}

// 抽出結果 → status。金額/取引先/日付が揃い信頼度0.7以上なら確定、それ以外は要確認。
function ocrStatus(ext: OcrExtraction): Receipt['status'] {
  return ext.amount !== null && ext.vendor !== null && ext.issued_on !== null && ext.confidence >= 0.7
    ? 'confirmed' : 'pending';
}

// 店名キーワード一致でルール適用（priority昇順、最初の一致を採用）。
async function applyRules(ext: OcrExtraction): Promise<{ category: AccountCategory | null; payment: PaymentMethod | null }> {
  let category: AccountCategory | null = ext.suggested_category ?? null;
  let payment: PaymentMethod | null = ext.payment_method ?? null;
  if (ext.vendor) {
    const rules = (await db.getAll<Rule>('rules'))
      .slice()
      .sort((a, b) => (a.priority - b.priority) || (a.id - b.id));
    for (const r of rules) {
      if (r.keyword && ext.vendor.includes(r.keyword)) {
        if (r.account_category) category = r.account_category;
        if (r.payment_method) payment = r.payment_method;
        break;
      }
    }
  }
  return { category, payment };
}

// コスト試算用に利用を記録（best-effort）。
async function recordUsage(model: string): Promise<void> {
  try {
    const id = await db.nextId('usage');
    await db.put<UsageRow>('usage', { id, occurred_at: nowIso(), model, estimated_yen: perReceiptYen(model) });
  } catch {
    /* 記録失敗は無視（集計表示が欠けるだけ） */
  }
}

// 取込結果をレコードへ反映する共通処理（processOne / retryOcr で使用）。
function applyExtraction(base: Receipt, ext: OcrExtraction, rawText: string, category: AccountCategory | null, payment: PaymentMethod | null): Receipt {
  return {
    ...base,
    ocr_raw: rawText,
    vendor: ext.vendor,
    issued_on: ext.issued_on,
    amount: ext.amount,
    tax_amount: ext.tax_amount,
    payment_method: payment,
    account_category: category,
    confidence: ext.confidence,
    memo: ext.notes ?? base.memo,
    error: null,
    status: ocrStatus(ext),
    updated_at: nowIso(),
  };
}

// ── 取込（1枚分の処理）─────────────────────────────────────────
async function processOne(item: ImportItem, apiKey: string, model: string): Promise<ImportResult> {
  const id = await db.nextId('receipts');
  const receipt: Receipt = {
    id,
    source_path: '',
    thumbnail_path: '',
    ocr_raw: null,
    vendor: null,
    issued_on: null,
    amount: null,
    tax_amount: null,
    payment_method: null,
    account_category: null,
    project_id: null,
    memo: item.name,
    status: 'processing',
    confidence: null,
    error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await db.put('receipts', receipt);
  await db.put<StoredImage>('images', {
    id,
    originalBase64: item.originalBytesBase64,
    originalMime: item.originalMime,
    thumbBase64: item.base64,
    thumbMime: item.mime,
  });
  emitReceiptChanged(receipt);

  // ブラウザから Anthropic へ直接 OCR（手元の base64 をそのまま使う）→ ルール適用 → 保存。
  try {
    const { ext, rawText } = await runOcr(item.base64, item.mime, apiKey, model);
    const { category, payment } = await applyRules(ext);
    const updated = applyExtraction(receipt, ext, rawText, category, payment);
    await db.put('receipts', updated);
    await recordUsage(model);
    emitReceiptChanged(updated);
    return { receiptId: id, fileName: item.name, ok: updated.status !== 'failed' };
  } catch (e) {
    const msg = redactKey((e as Error).message ?? 'OCRに失敗しました');
    const failed: Receipt = { ...receipt, status: 'failed', error: msg, updated_at: nowIso() };
    await db.put('receipts', failed);
    emitReceiptChanged(failed);
    return { receiptId: id, fileName: item.name, ok: false, error: msg };
  }
}

// 並列度を絞ってワーカープールで回す
async function runPool<T, R>(items: T[], limit: number, worker: (it: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

// ── AppApi 実装 ──────────────────────────────────────────────
export const api: AppApi = {
  // Receipts ----------------------------------------------------
  async importItems(items: ImportItem[]): Promise<ImportResult[]> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Anthropic APIキーが未設定です。「設定」でキーを入力してください。');
    const { model } = await this.getSettings();
    let done = 0;
    emitImportProgress({ done: 0, total: items.length });
    const results = await runPool(items, OCR_CONCURRENCY, async (it) => {
      const r = await processOne(it, apiKey, model);
      emitImportProgress({ done: ++done, total: items.length });
      return r;
    });
    return results;
  },

  async listReceipts(filter: ReceiptFilter = {}): Promise<Receipt[]> {
    let list = await db.getAll<Receipt>('receipts');
    if (filter.status && filter.status !== 'all') list = list.filter((r) => r.status === filter.status);
    if (filter.projectId !== undefined && filter.projectId !== null) list = list.filter((r) => r.project_id === filter.projectId);
    if (filter.category) list = list.filter((r) => r.account_category === filter.category);
    // 日付未設定(null)は範囲外へ弾かず含める（Supabase版の挙動に合わせる）。
    if (filter.fromDate) list = list.filter((r) => !r.issued_on || r.issued_on >= filter.fromDate!);
    if (filter.toDate) list = list.filter((r) => !r.issued_on || r.issued_on <= filter.toDate!);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((r) => `${r.vendor ?? ''} ${r.memo ?? ''}`.toLowerCase().includes(q));
    }
    // issued_on 降順（null は末尾）→ id 降順
    return list.sort((a, b) => {
      const av = a.issued_on ?? '';
      const bv = b.issued_on ?? '';
      if (av !== bv) {
        if (!av) return 1;
        if (!bv) return -1;
        return av < bv ? 1 : -1;
      }
      return b.id - a.id;
    });
  },

  async updateReceipt(id: number, patch: Partial<Receipt>): Promise<Receipt> {
    const cur = await db.get<Receipt>('receipts', id);
    if (!cur) throw new Error('領収書が見つかりません');
    const { id: _omitId, created_at: _omitCreated, ...rest } = patch;
    void _omitId; void _omitCreated;
    const next: Receipt = { ...cur, ...rest, updated_at: nowIso() };
    await db.put('receipts', next);
    emitReceiptChanged(next);
    return next;
  },

  async deleteReceipt(id: number): Promise<void> {
    await db.del('receipts', id);
    await db.del('images', id);
  },

  async getReceiptOriginal(id: number): Promise<{ dataUrl: string; mime: string } | null> {
    const img = await db.get<StoredImage>('images', id);
    if (!img) return null;
    const mime = img.originalMime || img.thumbMime || 'application/octet-stream';
    const base64 = img.originalBase64 || img.thumbBase64;
    if (!base64) return null;
    return { dataUrl: `data:${mime};base64,${base64}`, mime };
  },

  async retryOcr(id: number): Promise<Receipt> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Anthropic APIキーが未設定です。「設定」でキーを入力してください。');
    const cur = await db.get<Receipt>('receipts', id);
    if (!cur) throw new Error('領収書が見つかりません');
    const img = await db.get<StoredImage>('images', id);
    if (!img?.thumbBase64) throw new Error('読み取り用の画像が見つかりません。再インポートしてください。');

    const processing: Receipt = { ...cur, status: 'processing', error: null, updated_at: nowIso() };
    await db.put('receipts', processing);
    emitReceiptChanged(processing);

    try {
      const { model } = await this.getSettings();
      const { ext, rawText } = await runOcr(img.thumbBase64, img.thumbMime, apiKey, model);
      const { category, payment } = await applyRules(ext);
      const updated = applyExtraction(cur, ext, rawText, category, payment);
      await db.put('receipts', updated);
      await recordUsage(model);
      emitReceiptChanged(updated);
      return updated;
    } catch (e) {
      const msg = redactKey((e as Error).message ?? 'OCRに失敗しました');
      const failed: Receipt = { ...cur, status: 'failed', error: msg, updated_at: nowIso() };
      await db.put('receipts', failed);
      emitReceiptChanged(failed);
      throw new Error(msg);
    }
  },

  // Projects ----------------------------------------------------
  async listProjects(): Promise<Project[]> {
    return (await db.getAll<Project>('projects')).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  },

  async upsertProject(p: Omit<Project, 'id'> & { id?: number }): Promise<Project> {
    const id = p.id ?? await db.nextId('projects');
    const next: Project = { id, name: p.name, start_on: p.start_on, end_on: p.end_on, color: p.color };
    await db.put('projects', next);
    return next;
  },

  async deleteProject(id: number): Promise<void> {
    // 参照している領収書の project_id を外す（Supabaseの ON DELETE SET NULL 相当）。
    const receipts = await db.getAll<Receipt>('receipts');
    for (const r of receipts) {
      if (r.project_id === id) {
        const cleared: Receipt = { ...r, project_id: null, updated_at: nowIso() };
        await db.put('receipts', cleared);
        emitReceiptChanged(cleared);
      }
    }
    await db.del('projects', id);
  },

  // Rules -------------------------------------------------------
  async listRules(): Promise<Rule[]> {
    return (await db.getAll<Rule>('rules')).sort((a, b) => (a.priority - b.priority) || (a.id - b.id));
  },

  async upsertRule(r: Omit<Rule, 'id'> & { id?: number }): Promise<Rule> {
    const id = r.id ?? await db.nextId('rules');
    const next: Rule = { id, keyword: r.keyword, account_category: r.account_category, payment_method: r.payment_method, priority: r.priority };
    await db.put('rules', next);
    return next;
  },

  async deleteRule(id: number): Promise<void> {
    await db.del('rules', id);
  },

  // Settings ----------------------------------------------------
  async getSettings(): Promise<Omit<AppSettings, 'apiKey'>> {
    const stored = await db.get<{ key: string; value: string }>('meta', SETTINGS_META_KEY);
    let vals: Partial<typeof DEFAULT_SETTINGS> = {};
    if (stored?.value) { try { vals = JSON.parse(stored.value); } catch { /* ignore */ } }
    // BYOK：鍵は端末(localStorage)に保持。有無を hasApiKey に反映。
    return { ...DEFAULT_SETTINGS, ...vals, hasApiKey: hasApiKeyLocal() };
  },

  async setApiKey(key: string | null): Promise<void> {
    // BYOK：APIキーはこの端末(localStorage)にのみ保存。サーバーには送らない。
    setApiKeyLocal(key);
  },

  async updateSettings(patch: Partial<Omit<AppSettings, 'apiKey' | 'hasApiKey'>>): Promise<void> {
    const cur = await this.getSettings();
    const { hasApiKey: _h, ...curVals } = cur;
    void _h;
    const next = { ...curVals, ...patch };
    await db.put('meta', { key: SETTINGS_META_KEY, value: JSON.stringify(next) });
  },

  // Cost --------------------------------------------------------
  async estimateMonthlyCost(year: number, month: number): Promise<CostEstimate> {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const rows = (await db.getAll<UsageRow>('usage')).filter((u) => (u.occurred_at ?? '').startsWith(monthStr));
    const totalYen = rows.reduce((s, u) => s + (u.estimated_yen || 0), 0);
    const { model } = await this.getSettings();
    return {
      receiptCount: rows.length,
      totalYen,
      perReceiptYen: perReceiptYen(model),
      model,
      monthStart: `${monthStr}-01`,
    };
  },

  // Exports（CSV/Excel等のダウンロードは後続ステップで実装）------------
  async chooseSaveDestination(_kind: 'file' | 'folder', suggestedName?: string): Promise<string | null> {
    // ブラウザにファイルパス概念はない。ダウンロード時のファイル名候補だけ返す。
    return suggestedName ?? 'arisa-export';
  },

  async exportData(_opts: ExportOptions): Promise<{ outputPath: string; count: number }> {
    throw new Error('ファイル書き出しは準備中です（次のステップで対応）。集計は「集計」タブで確認できます。');
  },

  async revealInFinder(_path: string): Promise<void> {
    // ブラウザでは何もしない。
  },

  // Events ------------------------------------------------------
  onReceiptChanged(cb: (r: Receipt) => void): () => void {
    receiptChangedCbs.add(cb);
    return () => receiptChangedCbs.delete(cb);
  },

  onImportProgress(cb: (p: ImportProgress) => void): () => void {
    importProgressCbs.add(cb);
    return () => importProgressCbs.delete(cb);
  },
};
