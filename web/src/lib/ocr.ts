import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ACCOUNT_CATEGORIES, PAYMENT_METHODS } from '@shared/types';

// ───────────────────────────────────────────────────────────
// ブラウザ直叩き OCR（BYOK）。
// 旧 web/api/ocr.ts（Vercelサーバー関数）のプロンプト/スキーマ/パースを移植し、
// クライアント本人の鍵で Anthropic Vision を直接呼ぶ。サーバー(/api/ocr)は不要。
// dangerouslyAllowBrowser: 本人の鍵を本人の端末から使う用途（共有ホストではない）。
// ───────────────────────────────────────────────────────────

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

export type OcrExtraction = z.infer<typeof OcrSchema>;

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

export interface OcrResult {
  ext: OcrExtraction;
  rawText: string;
  usage: { input_tokens: number; output_tokens: number } | null;
}

/**
 * 領収書画像1枚をブラウザから Anthropic に直接投げて構造化抽出する。
 * @param base64     画像のbase64（PNG/JPEG）
 * @param mediaType  'image/png' | 'image/jpeg'
 * @param apiKey     クライアント本人の Anthropic キー（端末内保存）
 * @param model      使用モデルID
 */
export async function runOcr(
  base64: string,
  mediaType: 'image/png' | 'image/jpeg',
  apiKey: string,
  model: string,
): Promise<OcrResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
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

  const block = res.content.find((c) => c.type === 'text');
  const rawText = block && block.type === 'text' ? block.text : '';
  const parsed = OcrSchema.safeParse(tryParseJson(rawText));
  if (!parsed.success) throw new Error('OCRレスポンスのパースに失敗しました');

  const usage = res.usage
    ? { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens }
    : null;
  return { ext: parsed.data, rawText, usage };
}
