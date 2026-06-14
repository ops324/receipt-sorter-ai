import type { AppSettings } from '../../shared/types';
import { getSetting, setSetting } from './db';
import { hasApiKey } from './keychain';

const DEFAULTS: Omit<AppSettings, 'apiKey' | 'hasApiKey'> = {
  model: 'claude-sonnet-4-6',
  defaultCategory: '消耗品費',
  csvDialect: 'generic',
  folderRoot: null,
};

export function getAppSettings(): Omit<AppSettings, 'apiKey'> {
  const stored = getSetting('appSettings');
  let merged = { ...DEFAULTS };
  if (stored) {
    try { merged = { ...merged, ...JSON.parse(stored) }; } catch { /* ignore */ }
  }
  return { ...merged, hasApiKey: hasApiKey() };
}

export function updateAppSettings(patch: Partial<Omit<AppSettings, 'apiKey' | 'hasApiKey'>>): void {
  const cur = getAppSettings();
  // hasApiKey は保存対象外
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { hasApiKey: _omit, ...rest } = cur;
  const next = { ...rest, ...patch };
  setSetting('appSettings', JSON.stringify(next));
}
