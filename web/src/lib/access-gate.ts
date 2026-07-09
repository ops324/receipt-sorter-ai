// ───────────────────────────────────────────────────────────
// 合言葉（アクセスコード）ゲート。公開URLを「特定の顧客本人」だけに使わせ、
// 部外者（URLを知っただけの人）を締め出すための簡易ゲート。サーバー非依存。
//
// 重要（限界）: これはクライアント側だけの締め出しであり、厳密な遮断ではない。
// アプリは静的公開されるため、技術者はバンドルを読んだりチェックを書き換えれば
// 回避できる。狙いは「URLを偶然知った部外者が気軽には使えない」抑止（casual
// deterrent）。本当に遮断したい場合はエッジ/サーバー側の認証が必要（本版は未実装）。
//
// 期待コードはビルドに焼き込む（下記の定数 or VITE_ACCESS_* 環境変数）。平文では
// なく PBKDF2-SHA256 + salt のハッシュを埋め込むため、バンドルを覗いても合言葉は
// 読めない。部外者はまっさらなブラウザで来るため、期待値を localStorage 保存に
// すると新規ブラウザで素通りしてしまう → 必ずビルド側に持たせる。
//
// 合言葉は 8 文字以上の推測しにくい語句を推奨（ハッシュがバンドルにあるため、
// 短い数字では総当たりされ得る）。
// ───────────────────────────────────────────────────────────

// ▼ ここに合言葉のハッシュを設定するとゲートが有効になる（空ならゲート無効=素通り）。
//   値は `node web/scripts/gen-access-code.mjs '<合言葉>'` で生成して貼り付ける。
//   （代わりに VITE_ACCESS_SALT / VITE_ACCESS_HASH / VITE_ACCESS_ITER でも上書き可能）
const ACCESS_SALT_B64 = '';
const ACCESS_HASH_B64 = '';
const ACCESS_ITERATIONS = 210_000;

// 環境変数があればそちらを優先（Vercel等でハッシュを commit したくない場合の逃げ道）。
const SALT_B64 = ((import.meta.env.VITE_ACCESS_SALT as string | undefined)?.trim() || ACCESS_SALT_B64);
const HASH_B64 = ((import.meta.env.VITE_ACCESS_HASH as string | undefined)?.trim() || ACCESS_HASH_B64);
const ITERATIONS = Number(import.meta.env.VITE_ACCESS_ITER) || ACCESS_ITERATIONS;

const ACCESS_KEY = 'arisa.access'; // localStorage: 解錠済みフラグ（現ハッシュの指紋）

function toBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function derive(code: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(code), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// crypto.subtle はセキュアコンテキスト（https / localhost）でのみ利用可能。
function subtleAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle;
}

// この環境で合言葉の検証ができるか（非セキュア接続では不可）。
export function canVerify(): boolean {
  return subtleAvailable();
}

// ゲートが有効か（＝合言葉ハッシュが設定されているか）。未設定なら素通り（fail-open, opt-in）。
export function isGateEnabled(): boolean {
  return !!HASH_B64 && !!SALT_B64;
}

// 解錠済みフラグは「現在のハッシュの指紋」で保存する。合言葉を変更（ハッシュ差し替え）
// すると指紋が変わり、既存端末も再度ゲートに掛かる（＝流出コードの失効に対応）。
function fingerprint(): string {
  return HASH_B64.slice(0, 16);
}

export function isUnlocked(): boolean {
  if (!isGateEnabled()) return true;
  try {
    return localStorage.getItem(ACCESS_KEY) === fingerprint();
  } catch {
    return false;
  }
}

export function markUnlocked(): void {
  try {
    localStorage.setItem(ACCESS_KEY, fingerprint());
  } catch {
    /* localStorage が使えない環境では黙って無視 */
  }
}

export async function verifyCode(input: string): Promise<boolean> {
  if (!isGateEnabled() || !subtleAvailable()) return false;
  try {
    const hash = await derive(input.trim(), toBytes(SALT_B64), ITERATIONS);
    return timingSafeEqual(hash, toBytes(HASH_B64));
  } catch {
    return false;
  }
}
