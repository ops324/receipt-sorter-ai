import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ACCOUNT_CATEGORIES, PAYMENT_METHODS } from '../../shared/types';
import type { AccountCategory, PaymentMethod } from '../../shared/types';

// ───────────────────────────────────────────────────────────
// /api/ocr — Vercel サーバーレス関数（Node ランタイム / Web ハンドラ）
// クライアントは「原本/サムネを Storage にアップ + processing 行を insert」まで済ませ、
// この関数に { receiptId, thumbPath } を渡す。関数は鍵を保持し:
//   JWT検証 → 許可ユーザー照合 → 月次コスト上限 → Storageから画像取得
//   → Claude Vision → ルール適用 → status判定 → receipts 行 update → api_usage 記録
// を1関数1枚でアトミックに行う（Electron版 ocr-pipeline/anthropic の移植）。
// ───────────────────────────────────────────────────────────

export const config = { runtime: 'nodejs' };
export const maxDuration = 30;

const RECEIPTS_BUCKET = 'receipts';

// 既定モデル。Vision・日本語領収書・低コスト用途のため Haiku 4.5 を既定にする。
// クライアント設定の model を受け取りつつ、許可リストで検証する。
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4-8',
  'claude-opus-4-7',
]);
const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const PER_RECEIPT_YEN: Record<string, number> = {
  'claude-haiku-4-5-20251001': 0.5,
  'claude-haiku-4-5': 0.5,
  'claude-sonnet-4-6': 2.0,
  'claude-opus-4-8': 8.0,
  'claude-opus-4-7': 7.0,
};
function perReceiptYen(model: string): number {
  return PER_RECEIPT_YEN[model] ?? 2.0;
}

const OcrSchema = z.object({
  vendor: z.string().nullable(),
  issued_on: z.string().nullable(),
  amount: z.number().int().nullable(),
  tax_amount: z.number().int().nullable(),
  payment_method: z.enum(PAYMENT_METHODS).nullable(),
  items: z.array(z.string()).default([]),
  suggested_category: z.enum(ACCOUNT_CATEGORIES).nullable(),
  confidence: z.number().min(0).max(1).default(0.5),
  notes: z.string().nullable().default(null),
});

const SYSTEM_PROMPT = `あなたは日本の領収書・レシートを読み取って構造化データを返すアシスタントです。
出力は必ず単一のJSONオブジェクトのみとし、説明文・前置き・コードブロックは付けません。
スキーマ:
{
  "vendor": string | null,                // 店名・事業者名
  "issued_on": "YYYY-MM-DD" | null,       // 領収日
  "amount": integer | null,               // 税込合計 (円, 整数)
  "tax_amount": integer | null,           // 消費税額 (円, 整数)
  "payment_method": "cash" | "card" | "emoney" | "transfer" | "unknown" | null,
  "items": string[],                      // 品目 (最大5件、長い説明は要約)
  "suggested_category": "交通費" | "旅費交通費" | "交際費" | "会議費" | "消耗品費" | "通信費" | "新聞図書費" | "材料費" | "外注費" | "雑費" | null,
  "confidence": number,                   // 0.0-1.0 全体としての信頼度
  "notes": string | null                  // 注意点 (写真がぼけている等)
}
読めない値は null。日付の年が省略されている場合は今年と仮定し、月日のみは今年のYYYY-MM-DD形式に補完してください。`;

function redactSecrets(text: string): string {
  return text
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***REDACTED***')
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, 'sk-***REDACTED***');
}

function detectImageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
  return bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = fenced ? fenced[1] : trimmed;
  try { return JSON.parse(body); } catch { /* continue */ }
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(body.slice(first, last + 1)); } catch { /* fallthrough */ }
  }
  return {};
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE || !ANTHROPIC_API_KEY) {
    return json({ error: 'サーバー設定が未完了です（環境変数）。' }, 500);
  }
  const allowedUsers = new Set(
    (process.env.ALLOWED_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  const monthlyLimit = Number(process.env.MONTHLY_OCR_LIMIT ?? '1000');

  // 1. JWT 検証
  const authz = req.headers.get('authorization') ?? '';
  const token = authz.startsWith('Bearer ') ? authz.slice(7) : '';
  if (!token) return json({ error: '認証トークンがありません' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) return json({ error: '認証に失敗しました' }, 401);

  // 2. 許可ユーザー照合（鍵を持つ関数の課金ゲート。RLSとは別に必須）
  if (allowedUsers.size > 0 && !allowedUsers.has(userId)) {
    return json({ error: 'このアカウントはOCRを利用できません' }, 403);
  }

  // 3. 入力
  let payload: { receiptId?: number; thumbPath?: string; model?: string };
  try { payload = await req.json(); } catch { return json({ error: '不正なリクエスト' }, 400); }
  const { receiptId, thumbPath } = payload;
  if (!receiptId || !thumbPath) return json({ error: 'receiptId と thumbPath が必要です' }, 400);

  // 4. 月次コスト上限（api_usage の当月件数で判定）
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`;
  const { count: usedCount } = await admin
    .from('api_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('occurred_at', monthStart);
  if ((usedCount ?? 0) >= monthlyLimit) {
    await admin.from('receipts').update({
      status: 'failed',
      error: `今月のOCR上限(${monthlyLimit}枚)に達しました。`,
      updated_at: now.toISOString(),
    }).eq('id', receiptId).eq('user_id', userId);
    return json({ error: `今月のOCR上限(${monthlyLimit}枚)に達しました。` }, 429);
  }

  // 5. 対象 receipt（user_id スコープで取得）
  const { data: receiptRow, error: recErr } = await admin
    .from('receipts').select('*').eq('id', receiptId).eq('user_id', userId).single();
  if (recErr || !receiptRow) return json({ error: '領収書が見つかりません' }, 404);

  // model はオーナーが環境変数 OCR_MODEL で一元固定する（課金者＝オーナーのコスト管理のため、
  // クライアント設定からは選ばせない）。未設定/不正なら最安の DEFAULT_MODEL にフォールバック。
  const envModel = (process.env.OCR_MODEL ?? '').trim();
  const model = ALLOWED_MODELS.has(envModel) ? envModel : DEFAULT_MODEL;

  // 6. Storage からサムネ取得 → base64
  const dl = await admin.storage.from(RECEIPTS_BUCKET).download(thumbPath);
  if (dl.error || !dl.data) {
    await admin.from('receipts').update({
      status: 'failed', error: '読み取り用の画像が見つかりません。', updated_at: now.toISOString(),
    }).eq('id', receiptId).eq('user_id', userId);
    return json({ error: '画像の取得に失敗しました' }, 404);
  }
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const mediaType = detectImageMime(bytes);
  const base64 = Buffer.from(bytes).toString('base64');

  // 7. Claude Vision
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  let usageRecorded = false;
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: 'この領収書を読み取り、指定スキーマに従ったJSONのみを返してください。' },
          ],
        },
      ],
    });

    // usage は取れた時点で必ず記録（パース失敗でもAPI課金は発生しているため）
    if (res.usage) {
      await admin.from('api_usage').insert({
        user_id: userId,
        occurred_at: now.toISOString(),
        model,
        input_tokens: res.usage.input_tokens,
        output_tokens: res.usage.output_tokens,
        estimated_yen: perReceiptYen(model),
      });
      usageRecorded = true;
    }

    const block = res.content.find((c) => c.type === 'text');
    const rawText = block && block.type === 'text' ? block.text : '';
    const parsed = OcrSchema.safeParse(tryParseJson(rawText));
    if (!parsed.success) throw new Error('OCRレスポンスのパースに失敗しました');
    const ext = parsed.data;

    // ルール適用（店名キーワード一致, priority昇順）
    let category: AccountCategory | null = ext.suggested_category ?? null;
    let payment: PaymentMethod | null = ext.payment_method ?? null;
    if (ext.vendor) {
      const { data: rules } = await admin
        .from('rules').select('*').eq('user_id', userId)
        .order('priority', { ascending: true }).order('id', { ascending: true });
      for (const r of rules ?? []) {
        if (ext.vendor.includes(r.keyword)) {
          if (r.account_category) category = r.account_category as AccountCategory;
          if (r.payment_method) payment = r.payment_method as PaymentMethod;
          break;
        }
      }
    }

    const status =
      ext.amount !== null && ext.vendor !== null && ext.issued_on !== null && ext.confidence >= 0.7
        ? 'confirmed' : 'pending';

    const { data: updated, error: updErr } = await admin.from('receipts').update({
      ocr_raw: rawText,
      vendor: ext.vendor,
      issued_on: ext.issued_on,
      amount: ext.amount,
      tax_amount: ext.tax_amount,
      payment_method: payment,
      account_category: category,
      confidence: ext.confidence,
      memo: ext.notes ?? receiptRow.memo,
      error: null,
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', receiptId).eq('user_id', userId).select().single();
    if (updErr || !updated) throw new Error('DB更新に失敗しました');

    return json(updated);
  } catch (e) {
    const msg = redactSecrets((e as Error).message ?? 'OCRに失敗しました');
    const { data: failed } = await admin.from('receipts').update({
      status: 'failed', error: msg, updated_at: new Date().toISOString(),
    }).eq('id', receiptId).eq('user_id', userId).select().single();
    // usage 記録漏れを避けるための注記: 上で usageRecorded 済みなら二重計上しない
    void usageRecorded;
    return json(failed ?? { error: msg }, 502);
  }
}
