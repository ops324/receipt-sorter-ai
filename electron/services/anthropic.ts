import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ACCOUNT_CATEGORIES, PAYMENT_METHODS } from '../../shared/types';
import type { AccountCategory, AppSettings, OcrExtraction, PaymentMethod } from '../../shared/types';
import { recordUsage } from './db';

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

// 概算単価 (円/枚)。USD/JPY を 155 想定、controll image 1枚あたりおよそ 1100 input + 250 output tokens
// 参考値であり Anthropic の改定で変動するため、設定画面に「目安」と表記する。
const PER_RECEIPT_YEN: Record<AppSettings['model'], number> = {
  'claude-haiku-4-5-20251001': 0.5,
  'claude-sonnet-4-6': 2.0,
  'claude-opus-4-7': 7.0,
};

export function perReceiptYen(model: AppSettings['model']): number {
  return PER_RECEIPT_YEN[model] ?? 2.0;
}

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
読めない値は null。日付の年が省略されている場合は今年と仮定し、月日のみは "2026-MM-DD" 形式に補完してください。`;

export interface VisionResult {
  extraction: OcrExtraction;
  rawText: string;
  usage: { input_tokens: number; output_tokens: number };
}

export async function extractReceipt(
  apiKey: string,
  model: AppSettings['model'],
  imageBase64: string,
  mediaType: 'image/png' | 'image/jpeg',
): Promise<VisionResult> {
  const client = new Anthropic({ apiKey });
  const res = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: 'この領収書を読み取り、指定スキーマに従ったJSONのみを返してください。' },
        ],
      },
    ],
  });

  const block = res.content.find((c) => c.type === 'text');
  const rawText = block && block.type === 'text' ? block.text : '';
  const json = tryParseJson(rawText);
  const parsed = OcrSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`OCR レスポンスのパースに失敗しました: ${parsed.error.message}\n生応答: ${rawText.slice(0, 300)}`);
  }

  const usage = res.usage;
  recordUsage(model, usage.input_tokens, usage.output_tokens, perReceiptYen(model));

  // 強制的に PaymentMethod の型に絞る
  const pm: PaymentMethod | null = parsed.data.payment_method ?? null;
  const cat: AccountCategory | null = parsed.data.suggested_category ?? null;
  return {
    extraction: {
      ...parsed.data,
      payment_method: pm,
      suggested_category: cat,
    },
    rawText,
    usage: { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens },
  };
}

function tryParseJson(text: string): unknown {
  // モデルが ```json ... ``` で包む場合に対応
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const body = fenced ? fenced[1] : trimmed;
  try { return JSON.parse(body); } catch { /* 続行 */ }
  // 文中に余計な文字が混じった場合、最初の { から最後の } までを切り出す
  const first = body.indexOf('{');
  const last = body.lastIndexOf('}');
  if (first >= 0 && last > first) {
    try { return JSON.parse(body.slice(first, last + 1)); } catch { /* fallthrough */ }
  }
  return {};
}
