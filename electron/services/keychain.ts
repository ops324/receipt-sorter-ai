import { safeStorage } from 'electron';
import { getSetting, setSetting } from './db';

const KEY = 'anthropic.api_key.encrypted';

export function saveApiKey(plaintext: string | null): void {
  if (plaintext === null || plaintext === '') {
    setSetting(KEY, null);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // フォールバック: 暗号化が使えなければ平文保存しない方が安全。
    throw new Error('OS の暗号化機能が利用できません。Keychain の権限を確認してください。');
  }
  const buf = safeStorage.encryptString(plaintext);
  setSetting(KEY, buf.toString('base64'));
}

export function readApiKey(): string | null {
  const raw = getSetting(KEY);
  if (!raw) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(raw, 'base64'));
  } catch {
    return null;
  }
}

export function hasApiKey(): boolean {
  return !!getSetting(KEY);
}
