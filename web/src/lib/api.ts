import { supabase, RECEIPTS_BUCKET } from './supabase';
import { runOcr, type OcrExtraction } from './ocr';
import { getApiKey, setApiKeyLocal, hasApiKeyLocal } from './local-key';
import type {
  AppApi, ImportItem, ImportProgress, ReceiptFilter,
} from '@shared/ipc';
import type {
  AccountCategory, AppSettings, CostEstimate, ExportOptions, ImportResult,
  PaymentMethod, Project, Receipt, Rule,
} from '@shared/types';

// ───────────────────────────────────────────────────────────
// アリサ Web版のデータ継ぎ目。
// Electron 版の window.api(AppApi) と同一シグネチャを Supabase + /api/ocr で実装し、
// main.tsx で window.api = api として代入する（既存ページ/ストアを無改修で動かすため）。
// ───────────────────────────────────────────────────────────

const SETTINGS_KEY = 'appSettings';
const OCR_LIMIT_PER_IMPORT_CONCURRENCY = 3; // iPad の発熱・メモリ対策で並列度を絞る

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
  // モデルはサーバー(/api/ocr の OCR_MODEL)が権威。ここはコスト試算の「1枚あたり」表示用の既定値で、
  // サーバー既定(DEFAULT_MODEL=haiku)と合わせて表示の齟齬を防ぐ。
  model: 'claude-haiku-4-5-20251001',
  defaultCategory: '消耗品費',
  csvDialect: 'generic',
  folderRoot: null,
};

// ── ローカルイベント（Electron IPC イベントの代替）────────────────
const receiptChangedCbs = new Set<(r: Receipt) => void>();
const importProgressCbs = new Set<(p: ImportProgress) => void>();
function emitReceiptChanged(r: Receipt) { receiptChangedCbs.forEach((cb) => cb(r)); }
function emitImportProgress(p: ImportProgress) { importProgressCbs.forEach((cb) => cb(p)); }

// ── ヘルパ ───────────────────────────────────────────────────
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id;
  if (!uid) throw new Error('ログインが必要です');
  return uid;
}

function nowIso(): string { return new Date().toISOString(); }

function extForMime(mime: string): string {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'application/pdf') return '.pdf';
  return '.bin';
}

function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

/**
 * Storage のキーをまとめて削除する（孤児ファイル掃除）。
 * 掃除失敗は致命的でない（残るのは未参照ファイルの容量だけ）ため例外は飲み込む。
 * null/空文字は除外する。
 */
async function removeStorageKeys(keys: Array<string | null | undefined>): Promise<void> {
  const valid = keys.filter((k): k is string => !!k);
  if (valid.length === 0) return;
  try {
    await supabase.storage.from(RECEIPTS_BUCKET).remove(valid);
  } catch {
    /* 掃除失敗は無視（残るのは未参照ファイルの容量のみ） */
  }
}

// DB 行（user_id 等の余剰列を含む）→ Receipt 型へ。余剰プロパティは構造的に無害だが明示的に絞る。
function rowToReceipt(row: Record<string, unknown>): Receipt {
  return {
    id: Number(row.id),
    source_path: row.source_path as string,
    thumbnail_path: (row.thumbnail_path as string) ?? null,
    ocr_raw: (row.ocr_raw as string) ?? null,
    vendor: (row.vendor as string) ?? null,
    issued_on: (row.issued_on as string) ?? null,
    amount: (row.amount as number) ?? null,
    tax_amount: (row.tax_amount as number) ?? null,
    payment_method: (row.payment_method as Receipt['payment_method']) ?? null,
    account_category: (row.account_category as Receipt['account_category']) ?? null,
    project_id: (row.project_id as number) ?? null,
    memo: (row.memo as string) ?? null,
    status: row.status as Receipt['status'],
    confidence: (row.confidence as number) ?? null,
    error: (row.error as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

// ── OCR（BYOK・ブラウザ直叩き）補助 ───────────────────────────
// エラーメッセージ等に鍵が混ざってDBへ保存されるのを防ぐ。
function redactKey(text: string): string {
  return (text ?? '')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***REDACTED***')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-***REDACTED***');
}

function detectImageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000; // 大きな配列を spread するとスタックが溢れるため分割する
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
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
    const { data: rules } = await supabase.from('rules').select('*')
      .order('priority', { ascending: true }).order('id', { ascending: true });
    for (const r of (rules ?? []) as Rule[]) {
      if (r.keyword && ext.vendor.includes(r.keyword)) {
        if (r.account_category) category = r.account_category;
        if (r.payment_method) payment = r.payment_method;
        break;
      }
    }
  }
  return { category, payment };
}

// コスト試算用に api_usage を記録（best-effort：RLSで拒否されても致命的でない）。
async function recordUsage(userId: string, model: string, usage: { input_tokens: number; output_tokens: number } | null): Promise<void> {
  const { error } = await supabase.from('api_usage').insert({
    user_id: userId,
    occurred_at: nowIso(),
    model,
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    estimated_yen: perReceiptYen(model),
  });
  void error; // 記録失敗は無視（集計表示が欠けるだけ）
}

// ── 取込（1枚分の処理）─────────────────────────────────────────
async function processOne(item: ImportItem, userId: string, apiKey: string, model: string): Promise<ImportResult> {
  const stamp = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const originalKey = `${userId}/originals/${stamp}${extForMime(item.originalMime)}`;
  const thumbKey = `${userId}/thumbs/${stamp}.png`;

  // 1. 原本とサムネを Storage へ直アップ（base64 を /api/ocr に積まない）
  //    アップ済みキーを控え、後段で失敗したら掃除して孤児ファイルを残さない。
  const uploaded: string[] = [];
  try {
    const up1 = await supabase.storage.from(RECEIPTS_BUCKET)
      .upload(originalKey, base64ToBlob(item.originalBytesBase64, item.originalMime || 'application/octet-stream'), { upsert: true });
    if (up1.error) throw up1.error;
    uploaded.push(originalKey);
    const up2 = await supabase.storage.from(RECEIPTS_BUCKET)
      .upload(thumbKey, base64ToBlob(item.base64, item.mime), { upsert: true });
    if (up2.error) throw up2.error;
    uploaded.push(thumbKey);
  } catch (e) {
    await removeStorageKeys(uploaded); // 片方だけ上がった場合も掃除
    return { receiptId: -1, fileName: item.name, ok: false, error: (e as Error).message };
  }

  // 2. processing 行を作成 → UI に即時反映
  const ins = await supabase.from('receipts').insert({
    user_id: userId,
    source_path: originalKey,
    thumbnail_path: thumbKey,
    memo: item.name,
    status: 'processing',
    created_at: nowIso(),
    updated_at: nowIso(),
  }).select().single();
  if (ins.error || !ins.data) {
    await removeStorageKeys(uploaded); // DB行が作れなければアップ済みファイルは孤児になるため掃除
    return { receiptId: -1, fileName: item.name, ok: false, error: ins.error?.message ?? 'insert失敗' };
  }
  const receipt = rowToReceipt(ins.data);
  emitReceiptChanged(receipt);

  // 3. ブラウザから Anthropic へ直接 OCR（BYOK：鍵は端末内）。
  //    取込時は手元の base64 をそのまま使うので Storage 往復は不要。
  //    → ルール適用 → status判定 → receipts 行を update → api_usage 記録。
  try {
    const { ext, rawText, usage } = await runOcr(item.base64, item.mime, apiKey, model);
    const { category, payment } = await applyRules(ext);
    const { data: updated, error: updErr } = await supabase.from('receipts').update({
      ocr_raw: rawText,
      vendor: ext.vendor,
      issued_on: ext.issued_on,
      amount: ext.amount,
      tax_amount: ext.tax_amount,
      payment_method: payment,
      account_category: category,
      confidence: ext.confidence,
      memo: ext.notes ?? receipt.memo,
      error: null,
      status: ocrStatus(ext),
      updated_at: nowIso(),
    }).eq('id', receipt.id).select().single();
    if (updErr || !updated) throw updErr ?? new Error('DB更新に失敗しました');
    await recordUsage(userId, model, usage);
    const r = rowToReceipt(updated);
    emitReceiptChanged(r);
    return { receiptId: receipt.id, fileName: item.name, ok: r.status !== 'failed' };
  } catch (e) {
    // OCR/更新でコケた場合は行を failed に落とす（孤児 processing を残さない）。鍵はマスクして保存。
    const msg = redactKey((e as Error).message ?? 'OCRに失敗しました');
    const upd = await supabase.from('receipts')
      .update({ status: 'failed', error: msg, updated_at: nowIso() })
      .eq('id', receipt.id).select().single();
    if (upd.data) emitReceiptChanged(rowToReceipt(upd.data));
    return { receiptId: receipt.id, fileName: item.name, ok: false, error: msg };
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
    const userId = await currentUserId();
    const { model } = await this.getSettings();
    let done = 0;
    emitImportProgress({ done: 0, total: items.length });
    const results = await runPool(items, OCR_LIMIT_PER_IMPORT_CONCURRENCY, async (it) => {
      const r = await processOne(it, userId, apiKey, model);
      emitImportProgress({ done: ++done, total: items.length });
      return r;
    });
    return results;
  },

  async listReceipts(filter: ReceiptFilter = {}): Promise<Receipt[]> {
    let q = supabase.from('receipts').select('*');
    if (filter.fromDate) q = q.or(`issued_on.is.null,issued_on.gte.${filter.fromDate}`);
    if (filter.toDate) q = q.or(`issued_on.is.null,issued_on.lte.${filter.toDate}`);
    if (filter.status && filter.status !== 'all') q = q.eq('status', filter.status);
    if (filter.projectId !== undefined && filter.projectId !== null) q = q.eq('project_id', filter.projectId);
    if (filter.category) q = q.eq('account_category', filter.category);
    if (filter.search) q = q.or(`vendor.ilike.%${filter.search}%,memo.ilike.%${filter.search}%`);
    const { data, error } = await q
      .order('issued_on', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(rowToReceipt);
  },

  async updateReceipt(id: number, patch: Partial<Receipt>): Promise<Receipt> {
    const { id: _omit, created_at, ...rest } = patch;
    void _omit; void created_at;
    const { data, error } = await supabase.from('receipts')
      .update({ ...rest, updated_at: nowIso() })
      .eq('id', id).select().single();
    if (error || !data) throw error ?? new Error('更新に失敗しました');
    const r = rowToReceipt(data);
    emitReceiptChanged(r);
    return r;
  },

  async deleteReceipt(id: number): Promise<void> {
    // 先に Storage の原本/サムネを掃除（パスを取得してから削除）
    const { data } = await supabase.from('receipts').select('source_path,thumbnail_path').eq('id', id).single();
    if (data) {
      await removeStorageKeys([data.source_path as string, data.thumbnail_path as string]);
    }
    const { error } = await supabase.from('receipts').delete().eq('id', id);
    if (error) throw error;
  },

  async getReceiptOriginal(id: number): Promise<{ dataUrl: string; mime: string } | null> {
    const { data, error } = await supabase.from('receipts').select('source_path,thumbnail_path').eq('id', id).single();
    if (error || !data) return null;
    const key = (data.source_path as string) || (data.thumbnail_path as string);
    if (!key) return null;
    const dl = await supabase.storage.from(RECEIPTS_BUCKET).download(key);
    if (dl.error || !dl.data) return null;
    const dataUrl = await blobToDataUrl(dl.data);
    return { dataUrl, mime: dl.data.type || 'application/octet-stream' };
  },

  async retryOcr(id: number): Promise<Receipt> {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error('Anthropic APIキーが未設定です。「設定」でキーを入力してください。');
    const userId = await currentUserId();
    const cur = await supabase.from('receipts').select('thumbnail_path,memo').eq('id', id).single();
    if (cur.error || !cur.data?.thumbnail_path) throw new Error('読み取り用の画像が見つかりません。再インポートしてください。');
    const processing = await supabase.from('receipts')
      .update({ status: 'processing', error: null, updated_at: nowIso() })
      .eq('id', id).select().single();
    if (processing.data) emitReceiptChanged(rowToReceipt(processing.data));

    try {
      // 再試行時は手元に base64 が無いので Storage のサムネを取得してブラウザ直叩き。
      const dl = await supabase.storage.from(RECEIPTS_BUCKET).download(cur.data.thumbnail_path as string);
      if (dl.error || !dl.data) throw new Error('画像の取得に失敗しました');
      const bytes = new Uint8Array(await dl.data.arrayBuffer());
      const { model } = await this.getSettings();
      const { ext, rawText, usage } = await runOcr(bytesToBase64(bytes), detectImageMime(bytes), apiKey, model);
      const { category, payment } = await applyRules(ext);
      const { data: updated, error: updErr } = await supabase.from('receipts').update({
        ocr_raw: rawText,
        vendor: ext.vendor,
        issued_on: ext.issued_on,
        amount: ext.amount,
        tax_amount: ext.tax_amount,
        payment_method: payment,
        account_category: category,
        confidence: ext.confidence,
        memo: ext.notes ?? (cur.data.memo as string | null),
        error: null,
        status: ocrStatus(ext),
        updated_at: nowIso(),
      }).eq('id', id).select().single();
      if (updErr || !updated) throw updErr ?? new Error('DB更新に失敗しました');
      await recordUsage(userId, model, usage);
      const r = rowToReceipt(updated);
      emitReceiptChanged(r);
      return r;
    } catch (e) {
      const msg = redactKey((e as Error).message ?? 'OCRに失敗しました');
      const upd = await supabase.from('receipts')
        .update({ status: 'failed', error: msg, updated_at: nowIso() })
        .eq('id', id).select().single();
      if (upd.data) emitReceiptChanged(rowToReceipt(upd.data));
      throw new Error(msg);
    }
  },

  // Projects ----------------------------------------------------
  async listProjects(): Promise<Project[]> {
    const { data, error } = await supabase.from('projects').select('*').order('name');
    if (error) throw error;
    return (data ?? []) as Project[];
  },

  async upsertProject(p: Omit<Project, 'id'> & { id?: number }): Promise<Project> {
    const userId = await currentUserId();
    if (p.id) {
      const { data, error } = await supabase.from('projects')
        .update({ name: p.name, start_on: p.start_on, end_on: p.end_on, color: p.color })
        .eq('id', p.id).select().single();
      if (error || !data) throw error ?? new Error('案件の更新に失敗しました');
      return data as Project;
    }
    const { data, error } = await supabase.from('projects')
      .insert({ user_id: userId, name: p.name, start_on: p.start_on, end_on: p.end_on, color: p.color })
      .select().single();
    if (error || !data) throw error ?? new Error('案件の作成に失敗しました');
    return data as Project;
  },

  async deleteProject(id: number): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  },

  // Rules -------------------------------------------------------
  async listRules(): Promise<Rule[]> {
    const { data, error } = await supabase.from('rules').select('*')
      .order('priority', { ascending: true }).order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Rule[];
  },

  async upsertRule(r: Omit<Rule, 'id'> & { id?: number }): Promise<Rule> {
    const userId = await currentUserId();
    if (r.id) {
      const { data, error } = await supabase.from('rules')
        .update({ keyword: r.keyword, account_category: r.account_category, payment_method: r.payment_method, priority: r.priority })
        .eq('id', r.id).select().single();
      if (error || !data) throw error ?? new Error('ルールの更新に失敗しました');
      return data as Rule;
    }
    const { data, error } = await supabase.from('rules')
      .insert({ user_id: userId, keyword: r.keyword, account_category: r.account_category, payment_method: r.payment_method, priority: r.priority })
      .select().single();
    if (error || !data) throw error ?? new Error('ルールの作成に失敗しました');
    return data as Rule;
  },

  async deleteRule(id: number): Promise<void> {
    const { error } = await supabase.from('rules').delete().eq('id', id);
    if (error) throw error;
  },

  // Settings ----------------------------------------------------
  async getSettings(): Promise<Omit<AppSettings, 'apiKey'>> {
    const { data } = await supabase.from('settings').select('value').eq('key', SETTINGS_KEY).maybeSingle();
    let stored: Partial<typeof DEFAULT_SETTINGS> = {};
    if (data?.value) { try { stored = JSON.parse(data.value); } catch { /* ignore */ } }
    // BYOK：鍵は端末(localStorage)に保持。有無を hasApiKey に反映する。
    return { ...DEFAULT_SETTINGS, ...stored, hasApiKey: hasApiKeyLocal() };
  },

  async setApiKey(key: string | null): Promise<void> {
    // BYOK：APIキーはこの端末(localStorage)にのみ保存。サーバーには送らない。
    setApiKeyLocal(key);
  },

  async updateSettings(patch: Partial<Omit<AppSettings, 'apiKey' | 'hasApiKey'>>): Promise<void> {
    const userId = await currentUserId();
    const cur = await this.getSettings();
    const { hasApiKey: _h, ...curVals } = cur;
    void _h;
    const next = { ...curVals, ...patch };
    const { error } = await supabase.from('settings')
      .upsert({ user_id: userId, key: SETTINGS_KEY, value: JSON.stringify(next) }, { onConflict: 'user_id,key' });
    if (error) throw error;
  },

  // Cost --------------------------------------------------------
  async estimateMonthlyCost(year: number, month: number): Promise<CostEstimate> {
    const start = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
    const next = month === 12
      ? `${year + 1}-01-01T00:00:00.000Z`
      : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;
    const { data, error } = await supabase.from('api_usage')
      .select('estimated_yen').gte('occurred_at', start).lt('occurred_at', next);
    if (error) throw error;
    const rows = data ?? [];
    const totalYen = rows.reduce((s, r) => s + (Number(r.estimated_yen) || 0), 0);
    const settings = await this.getSettings();
    return {
      receiptCount: rows.length,
      totalYen,
      perReceiptYen: perReceiptYen(settings.model),
      model: settings.model,
      monthStart: `${year}-${String(month).padStart(2, '0')}-01`,
    };
  },

  // Exports（M4で実装予定）--------------------------------------
  async chooseSaveDestination(_kind: 'file' | 'folder', suggestedName?: string): Promise<string | null> {
    // ブラウザにファイルパス概念はない。ダウンロード時のファイル名候補だけ返す。
    return suggestedName ?? 'arisa-export';
  },

  async exportData(_opts: ExportOptions): Promise<{ outputPath: string; count: number }> {
    throw new Error('エクスポート機能は現在準備中です（M4で対応）。');
  },

  async revealInFinder(_path: string): Promise<void> {
    // ブラウザでは何もしない（ダウンロード済みファイルはOS側で管理）。
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
