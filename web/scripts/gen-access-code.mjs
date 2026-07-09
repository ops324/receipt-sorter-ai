#!/usr/bin/env node
// ───────────────────────────────────────────────────────────
// パスワード（アクセスコード）のハッシュ生成ツール。
//
// 使い方:
//   node web/scripts/gen-access-code.mjs '顧客に渡すパスワード'
//
// 出力された ACCESS_SALT_B64 / ACCESS_HASH_B64 を web/src/lib/access-gate.ts の
// 同名定数に貼り付けると、パスワードゲートが有効になる。パスワードを変えたいときは再実行して
// 差し替えるだけ（既存端末は自動で再ゲートされる）。パスワードそのものはコミットしない。
//
// access-gate.ts の verifyCode() と同一パラメータ（PBKDF2-SHA256 / salt16B /
// 210,000回 / 256bit）で計算するので、Node と WebCrypto で結果が一致する。
// ───────────────────────────────────────────────────────────
import { pbkdf2Sync, randomBytes } from 'node:crypto';

const code = process.argv[2];
if (!code || !code.trim()) {
  console.error("使い方: node web/scripts/gen-access-code.mjs '<パスワード>'");
  process.exit(1);
}
if (code.trim().length < 8) {
  console.error('⚠ パスワードは8文字以上を推奨します（バンドルにハッシュが載るため）。');
}

const ITERATIONS = 210_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(Buffer.from(code.trim(), 'utf8'), salt, ITERATIONS, 32, 'sha256');

console.log('\n// ▼ web/src/lib/access-gate.ts の定数に貼り付けてください');
console.log(`const ACCESS_SALT_B64 = '${salt.toString('base64')}';`);
console.log(`const ACCESS_HASH_B64 = '${hash.toString('base64')}';`);
console.log(`const ACCESS_ITERATIONS = ${ITERATIONS};\n`);
