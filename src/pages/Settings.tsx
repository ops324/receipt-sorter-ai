import { useEffect, useState } from 'react';
import { useApp } from '../stores/app-store';
import type { AppSettings } from '@shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, ShieldCheck, ExternalLink, AlertCircle } from 'lucide-react';

const MODELS: Array<{ id: AppSettings['model']; label: string; cost: string; note: string }> = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5',          cost: '≈ ¥0.5/枚', note: 'コスト最優先。きれいなレシート向き' },
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6（推奨）', cost: '≈ ¥2/枚',   note: '精度とコストのバランスが最良' },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7',           cost: '≈ ¥7/枚',   note: '手書き・しわのある領収書向き' },
];

export function Settings() {
  const { settings, refreshSettings, pushToast } = useApp();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => { refreshSettings(); }, [refreshSettings]);

  async function saveApiKey() {
    if (!apiKeyInput.trim()) return;
    try {
      await window.api.setApiKey(apiKeyInput.trim());
      setApiKeyInput('');
      await refreshSettings();
      pushToast({ kind: 'success', message: 'APIキーを Keychain に保存しました' });
    } catch (e) { pushToast({ kind: 'error', message: (e as Error).message }); }
  }

  async function clearApiKey() {
    await window.api.setApiKey(null);
    await refreshSettings();
    pushToast({ kind: 'success', message: 'APIキーを削除しました' });
  }

  async function pickModel(id: AppSettings['model']) {
    await window.api.updateSettings({ model: id });
    await refreshSettings();
  }

  const sel = "w-full h-9 px-3 border border-border rounded-md text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors";

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>設定</h1>
      </div>

      {/* API Key */}
      <Card className="mb-4 shadow-card border-border bg-card">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-foreground">Anthropic APIキー</CardTitle>
          <CardDescription className="text-xs leading-relaxed text-muted-foreground">
            OCRに使用します。
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-500 transition-colors ml-0.5">
              console.anthropic.com<ExternalLink size={10} />
            </a>
            でキーを発行してください。保存されたキーは macOS Keychain で暗号化されます。
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          {settings?.hasApiKey ? (
            <div className="flex items-center justify-between px-4 py-3 bg-brand-50 border border-brand-200 rounded-xl">
              <div className="flex items-center gap-2 text-brand-700 text-sm font-medium">
                <ShieldCheck size={15} />
                <span>APIキーは保存済みです</span>
              </div>
              <Button variant="ghost" size="sm" onClick={clearApiKey} className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 h-7">削除</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input type={showKey ? 'text' : 'password'} value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder="sk-ant-..." className="font-mono h-9 text-sm pr-10 bg-input border-border"
                    onKeyDown={(e) => { if (e.key === 'Enter') saveApiKey(); }} />
                  <button onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={showKey ? 'キーを隠す' : 'キーを表示'}>
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <Button onClick={saveApiKey} size="sm" className="bg-brand-500 hover:bg-brand-600 text-white h-9">保存</Button>
              </div>
              {apiKeyInput.trim() !== '' && !apiKeyInput.trim().startsWith('sk-ant-') && (
                <p className="flex items-center gap-1 text-xs text-amber-600">
                  <AlertCircle size={11} className="shrink-0" />
                  APIキーは通常「sk-ant-」で始まります。入力内容をご確認ください。
                </p>
              )}
            </div>
          )}

          {/* 漏洩時の対処手順（常設） */}
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-muted/60 border border-border rounded-lg text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck size={13} className="shrink-0 mt-0.5 text-muted-foreground" />
            <span>
              <span className="font-medium text-foreground">万一キーが漏れたら：</span>
              <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-brand-600 hover:text-brand-500 transition-colors mx-0.5">
                Anthropic Console<ExternalLink size={9} />
              </a>
              で該当キーを失効（Revoke）→新しいキーを発行し、上の「削除」後にここへ貼り直してください。併せて Console で月額上限（Spend Limit）の設定を推奨します。漏れたキーはアプリ側では無効化できません。
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Model */}
      <Card className="mb-4 shadow-card border-border bg-card">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-sm font-semibold text-foreground">読み取りモデル</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">1枚あたりのおおよそのコストです。Anthropic の料金改定で変動します。</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-2">
          {MODELS.map((m) => {
            const active = settings?.model === m.id;
            return (
              <button key={m.id} onClick={() => pickModel(m.id)}
                className={cn(
                  'w-full text-left px-4 py-3.5 border-2 rounded-xl text-sm transition-all duration-150',
                  active ? 'border-brand-400 bg-brand-50' : 'border-border bg-background hover:border-brand-300 hover:bg-brand-50/40'
                )}>
                <div className="flex items-center justify-between">
                  <span className={cn('font-semibold', active ? 'text-brand-700' : 'text-foreground')}>{m.label}</span>
                  <span className={cn('text-xs tabular-nums', active ? 'text-brand-600' : 'text-muted-foreground')}>{m.cost}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{m.note}</div>
              </button>
            );
          })}
          <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
            Anthropic コンソール側でも月額上限（Spend Limit）を設定できます。初回は数千円程度に設定することをおすすめします。
          </p>
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
