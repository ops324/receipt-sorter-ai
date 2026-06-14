import { useMemo, useState } from 'react';
import { useApp } from '../stores/app-store';
import type { ExportFormat, ExportOptions } from '@shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { FileText, Table2, FileBarChart2, FolderOpen, Download, Loader2, AlertCircle } from 'lucide-react';

const FORMAT_META: Record<ExportFormat, {
  label: string; ext: string; kind: 'file' | 'folder';
  desc: string; Icon: React.ElementType;
}> = {
  csv:    { label: 'CSV',              ext: '.csv',  kind: 'file',   desc: '会計ソフト取込用・UTF-8 BOM付き',              Icon: FileText },
  excel:  { label: 'Excel ブック',     ext: '.xlsx', kind: 'file',   desc: '明細 + 科目別集計の2シート',                   Icon: Table2 },
  pdf:    { label: '月次PDFレポート',  ext: '.pdf',  kind: 'file',   desc: 'IPAGothicフォントで日本語PDFを生成',            Icon: FileBarChart2 },
  folder: { label: 'フォルダ整理',     ext: '',      kind: 'folder', desc: 'YYYY-MM/科目/案件/日付_店名_金額.ext で振り分け', Icon: FolderOpen },
};

export function Export() {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth  = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);
  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate]     = useState(lastOfMonth);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [format, setFormat]     = useState<ExportFormat>('csv');
  const [running, setRunning]   = useState(false);
  const { projects, settings, receipts, pushToast } = useApp();

  const invalidRange = fromDate > toDate;

  const targets = useMemo(() => receipts.filter((r) => {
    if (r.issued_on && r.issued_on < fromDate) return false;
    if (r.issued_on && r.issued_on > toDate) return false;
    if (projectId !== '' && r.project_id !== projectId) return false;
    return true;
  }), [receipts, fromDate, toDate, projectId]);

  async function run() {
    setRunning(true);
    try {
      const meta = FORMAT_META[format];
      const suggested = `arisa_${format}_${fromDate}_${toDate}${meta.ext}`;
      const outputPath = await window.api.chooseSaveDestination(meta.kind, suggested);
      if (!outputPath) return;
      const opts: ExportOptions = { format, fromDate, toDate, projectId: projectId === '' ? null : projectId, outputPath, csvDialect: settings?.csvDialect ?? 'generic' };
      const res = await window.api.exportData(opts);
      pushToast({ kind: 'success', message: `${res.count}件を書き出しました` });
      window.api.revealInFinder(res.outputPath);
    } catch (e) {
      pushToast({ kind: 'error', message: (e as Error).message });
    } finally { setRunning(false); }
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>エクスポート</h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          期間を絞って、会計ソフト用ファイルや整理済みフォルダを出力します。
        </p>
      </div>

      {/* Filters */}
      <Card className="mb-5 shadow-card border-border bg-card">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">対象期間・絞り込み</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-wrap gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">開始日</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-sm bg-input border-border" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">終了日</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-sm bg-input border-border" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">案件</Label>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-9 px-3 border border-border rounded-md text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors">
                <option value="">すべて</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          {invalidRange ? (
            <p className="mt-3 flex items-center gap-1 text-xs text-red-600">
              <AlertCircle size={11} className="shrink-0" />開始日が終了日より後になっています
            </p>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              対象: <span className="font-bold text-foreground tabular-nums">{targets.length}</span> 件
              {targets.length === 0 && (
                <span className="ml-1.5 text-muted-foreground/70">— この期間・案件に該当する領収書がありません</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Format cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {(Object.keys(FORMAT_META) as ExportFormat[]).map((f) => {
          const { label, desc, Icon } = FORMAT_META[f];
          const active = format === f;
          return (
            <button key={f} onClick={() => setFormat(f)}
              className={cn(
                'text-left p-4 rounded-xl border-2 transition-all duration-150',
                active
                  ? 'border-brand-400 bg-brand-50 shadow-card'
                  : 'border-border bg-card hover:border-brand-300 hover:shadow-card'
              )}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon size={15} className={active ? 'text-brand-600' : 'text-muted-foreground'} />
                <span className={cn('text-sm font-semibold', active ? 'text-brand-700' : 'text-foreground')}>{label}</span>
              </div>
              <div className="text-xs text-muted-foreground leading-relaxed">{desc}</div>
            </button>
          );
        })}
      </div>

      <Button disabled={running || targets.length === 0 || invalidRange} onClick={run}
        className="w-full h-11 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold gap-2">
        {running
          ? <><Loader2 size={15} className="animate-spin" />出力中…</>
          : <><Download size={15} />{targets.length} 件をエクスポート</>
        }
      </Button>
    </div>
  );
}
