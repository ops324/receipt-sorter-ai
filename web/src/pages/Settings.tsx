import { useEffect } from 'react';
import { useApp } from '../stores/app-store';
import type { AppSettings } from '@shared/types';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldCheck } from 'lucide-react';

export function Settings() {
  const { settings, refreshSettings } = useApp();

  useEffect(() => { refreshSettings(); }, [refreshSettings]);

  const sel = "w-full h-9 px-3 border border-border rounded-md text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors";

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>設定</h1>
      </div>

      {/* OCR提供の注記（Web版は鍵をサーバーが保持。クライアントはキー設定不要）*/}
      <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-brand-50 border border-brand-200 rounded-xl text-sm text-brand-800">
        <ShieldCheck size={15} className="shrink-0 mt-0.5 text-brand-600" />
        <span>領収書のAI読み取りはサービス側で提供されます。APIキーの設定は不要です。</span>
      </div>

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
