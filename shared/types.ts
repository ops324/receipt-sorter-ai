export const ACCOUNT_CATEGORIES = [
  '交通費',
  '旅費交通費',
  '交際費',
  '会議費',
  '消耗品費',
  '通信費',
  '新聞図書費',
  '材料費',
  '外注費',
  '雑費',
] as const;
export type AccountCategory = (typeof ACCOUNT_CATEGORIES)[number];

export const PAYMENT_METHODS = ['cash', 'card', 'emoney', 'transfer', 'unknown'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: '現金',
  card: 'カード',
  emoney: '電子マネー',
  transfer: '振込',
  unknown: '不明',
};

export type ReceiptStatus = 'processing' | 'pending' | 'confirmed' | 'failed';

export interface Receipt {
  id: number;
  source_path: string;       // 原本のコピー先パス
  thumbnail_path: string | null;
  ocr_raw: string | null;    // LLM が返したJSON生(string)
  vendor: string | null;
  issued_on: string | null;  // YYYY-MM-DD
  amount: number | null;     // 税込合計(整数円)
  tax_amount: number | null;
  payment_method: PaymentMethod | null;
  account_category: AccountCategory | null;
  project_id: number | null;
  memo: string | null;
  status: ReceiptStatus;
  confidence: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: number;
  name: string;
  start_on: string | null;
  end_on: string | null;
  color: string | null;
}

export interface Rule {
  id: number;
  keyword: string;
  account_category: AccountCategory | null;
  payment_method: PaymentMethod | null;
  priority: number;
}

export interface AppSettings {
  apiKey: string | null;       // 復号後のキー (UI でのみ扱う)
  hasApiKey: boolean;          // 保存有無のみを返したい場合
  model: 'claude-haiku-4-5-20251001' | 'claude-sonnet-4-6' | 'claude-opus-4-7';
  defaultCategory: AccountCategory;
  csvDialect: 'freee' | 'mf' | 'generic';
  folderRoot: string | null;   // フォルダ整理エクスポートの初期出力先
}

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'folder';

export interface ExportOptions {
  format: ExportFormat;
  fromDate: string;     // inclusive YYYY-MM-DD
  toDate: string;       // inclusive
  projectId: number | null;
  outputPath: string;   // saveDialog で取得した絶対パス
  csvDialect?: 'freee' | 'mf' | 'generic';
}

export interface ImportResult {
  receiptId: number;
  fileName: string;
  ok: boolean;
  error?: string;
}

export interface OcrExtraction {
  vendor: string | null;
  issued_on: string | null;
  amount: number | null;
  tax_amount: number | null;
  payment_method: PaymentMethod | null;
  items: string[];
  suggested_category: AccountCategory | null;
  confidence: number;
  notes: string | null;
}

export interface CostEstimate {
  receiptCount: number;
  totalYen: number;
  perReceiptYen: number;
  model: AppSettings['model'];
  monthStart: string;  // YYYY-MM-01
}
