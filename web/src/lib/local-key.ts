// ───────────────────────────────────────────────────────────
// BYOK: Anthropic APIキーを「この端末（ブラウザ）」にのみ保存する。
// Supabase等サーバーには絶対に送らない（クライアント本人の鍵を本人の端末に置く）。
// OCR時に api.ts からブラウザ直叩きで Anthropic に渡す。
// ───────────────────────────────────────────────────────────

const STORAGE_KEY = 'arisa.anthropicKey';

export function getApiKey(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setApiKeyLocal(key: string | null): void {
  try {
    if (key && key.trim()) localStorage.setItem(STORAGE_KEY, key.trim());
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* localStorage が使えない環境では黙って無視（鍵は保存できないだけ） */
  }
}

export function hasApiKeyLocal(): boolean {
  return getApiKey() !== null;
}
