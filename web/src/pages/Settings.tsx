import { useEffect, useState } from 'react';
import { useApp } from '../stores/app-store';
import type { AppSettings } from '@shared/types';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KeyRound, Eye, EyeOff, CheckCircle2, Trash2, Loader2, AlertCircle } from 'lucide-react';

export function Settings() {
  const { settings, refreshSettings, pushToast } = useApp();
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { refreshSettings(); }, [refreshSettings]);

  const sel = "w-full h-9 px-3 border border-border rounded-md text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors";
  const hasKey = settings?.hasApiKey ?? false;
  const looksInvalid = keyInput.trim().length > 0 && !keyInput.trim().startsWith('sk-ant-');

  async function saveKey() {
    const value = keyInput.trim();
    if (!value) return;
    setSaving(true);
    try {
      await window.api.setApiKey(value);
      setKeyInput('');
      setShowKey(false);
      await refreshSettings();
      pushToast({ kind: 'success', message: 'APIキーをこの端末に保存しました' });
    } finally { setSaving(false); }
  }

  async function clearKey() {
    setSaving(true);
    try {
      await window.api.setApiKey(null);
      await refreshSettings();
      pushToast({ kind: 'success', message: 'APIキーを削除しました' });
    } finally { setSaving(false); }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>設定</h1>
      </div>

      {/* Anthropic APIキー（BYOK：この端末にのみ保存） */}
      <Card className="mb-5 shadow-card border-border bg-card">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <KeyRound size={15} className="text-brand-600" />Anthropic APIキー
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {hasKey && (
            <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
              <span className="flex items-center gap-1.5 text-sm text-emerald-800">
                <CheckCircle2 size={14} className="text-emerald-600" />この端末に設定済み
              </span>
              <Button variant="ghost" size="sm" onClick={clearKey} disabled={saving}
                className="h-7 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 gap-1">
                <Trash2 size={12} />削除
              </Button>
            </div>
          )}

          <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">
            {hasKey ? 'キーを更新する場合は貼り直してください' : 'sk-ant- から始まるキーを貼り付けてください'}
          </Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="sk-ant-..."
                autoComplete="off"
                spellCheck={false}
                className="h-9 text-sm bg-input border-border pr-9 font-mono"
              />
              <button type="button" onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showKey ? 'キーを隠す' : 'キーを表示'}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Button onClick={saveKey} disabled={saving || keyInput.trim().length === 0}
              className="h-9 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold gap-1.5">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}保存
            </Button>
          </div>
          {looksInvalid && (
            <p className="mt-2 flex items-center gap-1 text-xs text-amber-600">
              <AlertCircle size={11} className="shrink-0" />通常のキーは <span className="font-mono">sk-ant-</span> で始まります（このまま保存も可能です）
            </p>
          )}

          <div className="mt-3 space-y-1 text-xs text-muted-foreground leading-relaxed">
            <p>キーは<span className="font-medium text-foreground">この端末（ブラウザ）内にのみ</span>保存され、領収書の読み取り時にAnthropicへ直接使われます。サーバーには送信しません。</p>
            <p>万一に備え、<a href="https://console.anthropic.com/settings/limits" target="_blank" rel="noreferrer" className="text-brand-600 underline underline-offset-2">Anthropicコンソール</a>で<span className="font-medium text-foreground">Spend Limit（月間の上限）</span>を設定しておくことを推奨します。キーの発行は<a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-brand-600 underline underline-offset-2">API Keys</a>から行えます。</p>
          </div>
        </CardContent>
      </Card>

      {/* Defaults */}
      <Card className="shadow-card border-border bg-card">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-foreground">既定値</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">既定の勘定科目</Label>
              <select value={settings?.defaultCategory ?? '消耗品費'}
                onChange={async (e) => { await window.api.updateSettings({ defaultCategory: e.target.value as AppSettings['defaultCategory'] }); await refreshSettings(); }}
                className={sel}>
                {['交通費','旅費交通費','交際費','会議費','消耗品費','通信費','新聞図書費','材料費','外注費','雑費'].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">CSV形式（会計ソフト）</Label>
              <select value={settings?.csvDialect ?? 'generic'}
                onChange={async (e) => { await window.api.updateSettings({ csvDialect: e.target.value as AppSettings['csvDialect'] }); await refreshSettings(); }}
                className={sel}>
                <option value="generic">汎用</option>
                <option value="freee">freee</option>
                <option value="mf">マネーフォワード</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
