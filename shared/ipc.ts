import type {
  AppSettings,
  CostEstimate,
  ExportOptions,
  ImportResult,
  Project,
  Receipt,
  Rule,
} from './types';

export interface ImportItem {
  name: string;                            // 元ファイル名
  base64: string;                          // PNG/JPEG の base64 (PDFは renderer 側で 1ページ目をPNG化済み)
  mime: 'image/png' | 'image/jpeg';
  originalMime: string;                    // application/pdf or image/*
  originalBytesBase64: string;             // 元データ。フォルダ整理エクスポート時の原本コピーに使う
}

export interface ImportProgress {
  done: number;   // OCR 完了済み件数
  total: number;  // 取込対象の総件数
}

export interface AppApi {
  // Receipts
  importItems(items: ImportItem[]): Promise<ImportResult[]>;
  listReceipts(filter?: ReceiptFilter): Promise<Receipt[]>;
  updateReceipt(id: number, patch: Partial<Receipt>): Promise<Receipt>;
  deleteReceipt(id: number): Promise<void>;
  getReceiptOriginal(id: number): Promise<{ dataUrl: string; mime: string } | null>;
  retryOcr(id: number): Promise<Receipt>;

  // Projects
  listProjects(): Promise<Project[]>;
  upsertProject(p: Omit<Project, 'id'> & { id?: number }): Promise<Project>;
  deleteProject(id: number): Promise<void>;

  // Rules
  listRules(): Promise<Rule[]>;
  upsertRule(r: Omit<Rule, 'id'> & { id?: number }): Promise<Rule>;
  deleteRule(id: number): Promise<void>;

  // Settings
  getSettings(): Promise<Omit<AppSettings, 'apiKey'>>;
  setApiKey(key: string | null): Promise<void>;
  updateSettings(patch: Partial<Omit<AppSettings, 'apiKey' | 'hasApiKey'>>): Promise<void>;

  // Cost
  estimateMonthlyCost(year: number, month: number): Promise<CostEstimate>;

  // Exports
  chooseSaveDestination(kind: 'file' | 'folder', suggestedName?: string): Promise<string | null>;
  exportData(opts: ExportOptions): Promise<{ outputPath: string; count: number }>;

  // OS
  revealInFinder(path: string): Promise<void>;

  // Events
  onReceiptChanged(cb: (r: Receipt) => void): () => void;
  onImportProgress(cb: (p: ImportProgress) => void): () => void;
}

export interface ReceiptFilter {
  fromDate?: string;
  toDate?: string;
  status?: Receipt['status'] | 'all';
  projectId?: number | null;
  category?: string | null;
  search?: string;
}

declare global {
  interface Window {
    api: AppApi;
  }
}
