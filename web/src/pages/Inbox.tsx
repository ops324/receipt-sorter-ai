import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../stores/app-store';
import { prepareFile } from '../lib/file-to-base64';
import type { CostEstimate } from '@shared/types';
import type { ImportProgress } from '@shared/ipc';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { UploadCloud, Loader2, AlertCircle, CheckCircle2, Clock, ChevronRight, TrendingUp } from 'lucide-react';

interface InboxProps {
  onNavigate: (p: 'inbox' | 'list' | 'summary' | 'projects' | 'rules' | 'export' | 'settings') => void;
}

/** この枚数以上を一度に取り込む場合は、コスト確認ダイアログを挟む。 */
const LARGE_IMPORT_THRESHOLD = 20;

export function Inbox({ onNavigate }: InboxProps) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [ocrProgress, setOcrProgress] = useState<ImportProgress | null>(null);
  const [cost, setCost] = useState<CostEstimate | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const pushToast = useApp((s) => s.pushToast);
  const receipts = useApp((s) => s.receipts);

  const refreshCost = useCallback(() => {
    const now = new Date();
    window.api.estimateMonthlyCost(now.getFullYear(), now.getMonth() + 1).then(setCost);
  }, []);

  useEffect(() => { refreshCost(); }, [refreshCost]);

  useEffect(() => {
    const off = window.api.onImportProgress(setOcrProgress);
    return off;
  }, []);

  function handleFiles(files: File[]) {
    if (busy || files.length === 0) return;
    if (files.length >= LARGE_IMPORT_THRESHOLD) {
      setPendingFiles(files);
    } else {
      runImport(files);
    }
  }

  async function runImport(files: File[]) {
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    try {
      const prepared = [];
      for (let i = 0; i < files.length; i++) {
        try { prepared.push(await prepareFile(files[i])); }
        catch (e) { pushToast({ kind: 'error', message: `${files[i].name}: ${(e as Error).message}` }); }
        setProgress({ done: i + 1, total: files.length });
      }
      if (prepared.length === 0) return;
      setProgress(null);
      setOcrProgress({ done: 0, total: prepared.length });
      const results = await window.api.importItems(prepared);
      const ok = results.filter((r) => r.ok).length;
      const ng = results.length - ok;
      pushToast({ kind: ng > 0 ? 'error' : 'success', message: ng > 0 ? `${ok}件取込、${ng}件失敗` : `${ok}件取込完了` });
      refreshCost();
    } catch (e) {
      // importItems 自体が throw する場合（APIキー未設定・未ログイン等）をユーザーに通知
      pushToast({ kind: 'error', message: (e as Error).message });
    } finally {
      setBusy(false);
      setProgress(null);
      setOcrProgress(null);
    }
  }

  const processing = receipts.filter((r) => r.status === 'processing').length;
  const pending    = receipts.filter((r) => r.status === 'pending').length;
  const confirmed  = receipts.filter((r) => r.status === 'confirmed').length;
  const failed     = receipts.filter((r) => r.status === 'failed').length;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-2xl font-bold text-stone-900 tracking-tight"
          style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}
        >
          インボックス
        </h1>
        <p className="text-sm text-stone-500 mt-1.5 leading-relaxed">
          領収書の写真やPDFをドロップすると、Claude Vision で自動抽出・仕分けします。
        </p>
      </div>


      {/* Drop zone */}
      <label
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) handleFiles(files);
        }}
        className={cn(
          'block rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all duration-200',
          dragOver
            ? 'border-brand-400 bg-brand-50 scale-[1.01]'
            : 'border-stone-200 bg-white hover:border-brand-300 hover:bg-stone-50/50',
          busy && 'pointer-events-none opacity-60'
        )}
      >
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) handleFiles(files);
            e.target.value = '';
          }}
        />

        <div className={cn(
          'inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5 transition-all duration-200',
          dragOver ? 'bg-brand-100 scale-110' : 'bg-stone-100'
        )}>
          {busy
            ? <Loader2 size={26} className="text-brand-500 animate-spin" />
            : <UploadCloud size={26} className={dragOver ? 'text-brand-500' : 'text-stone-400'} />
          }
        </div>

        <div className="text-sm font-semibold text-stone-700 mb-1.5">
          {ocrProgress ? 'AIで読み取り中...' : busy ? 'ファイル準備中...' : 'ファイルをドラッグ＆ドロップ'}
        </div>
        <div className="text-xs text-stone-400">
          {busy ? '' : 'またはクリックして選択 · JPG / PNG / PDF'}
        </div>

        {(progress || ocrProgress) && (
          <div className="mt-6 max-w-xs mx-auto space-y-2">
            {progress && (
              <>
                <Progress value={(progress.done / progress.total) * 100} className="h-1.5" />
                <div className="text-xs text-stone-400 tabular-nums">
                  ファイル準備中 {progress.done} / {progress.total}
                </div>
              </>
            )}
            {ocrProgress && (
              <>
                <Progress value={ocrProgress.total ? (ocrProgress.done / ocrProgress.total) * 100 : 0} className="h-1.5" />
                <div className="text-xs text-stone-400 tabular-nums">
                  AIで読み取り中 {ocrProgress.done} / {ocrProgress.total}
                </div>
              </>
            )}
          </div>
        )}
      </label>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3 mt-5">
        <StatCard label="処理中" value={processing}
          icon={<Loader2 size={13} className={cn(processing > 0 && 'animate-spin')} />}
          colorClass="text-amber-600" bgClass="bg-amber-50" borderClass="border-amber-100" />
        <StatCard label="要確認" value={pending}
          icon={<AlertCircle size={13} />}
          colorClass="text-orange-600" bgClass="bg-orange-50" borderClass="border-orange-100"
          urgent={pending > 0} />
        <StatCard label="確定済" value={confirmed}
          icon={<CheckCircle2 size={13} />}
          colorClass="text-emerald-600" bgClass="bg-emerald-50" borderClass="border-emerald-100" />
        <StatCard label="失敗" value={failed}
          icon={<AlertCircle size={13} />}
          colorClass="text-red-600" bgClass="bg-red-50" borderClass="border-red-100" />
      </div>

      {/* Cost card */}
      {cost && (
        <Card className="mt-4 border-stone-200/80 shadow-none">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                <TrendingUp size={14} className="text-brand-600" />
              </div>
              <div>
                <div className="text-xs font-semibold text-stone-700">今月のAPI使用状況</div>
                <div className="text-xs text-stone-400 mt-0.5 tabular-nums">
                  {cost.receiptCount} 件 · 概算 ¥{Math.round(cost.totalYen).toLocaleString()}
                  <span className="text-stone-300 ml-1.5">({cost.model})</span>
                </div>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('settings')}
              className="text-xs text-brand-600 hover:text-brand-700 hover:bg-brand-50 gap-0.5 h-7">
              設定 <ChevronRight size={12} />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pending CTA */}
      {pending > 0 && (
        <button onClick={() => onNavigate('list')}
          className="mt-3 w-full py-3.5 px-5 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-sm font-medium flex items-center justify-between transition-all duration-150 hover:shadow-sm group">
          <span className="flex items-center gap-2.5">
            <Clock size={15} className="text-amber-600" />
            <span><span className="font-bold tabular-nums">{pending}</span> 件の要確認領収書があります</span>
          </span>
          <ChevronRight size={15} className="text-amber-400 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* 大量インポート前のコスト確認 */}
      <AlertDialog open={pendingFiles !== null} onOpenChange={(o) => { if (!o) setPendingFiles(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingFiles?.length ?? 0}枚の領収書を読み取ります</AlertDialogTitle>
            <AlertDialogDescription>
              {cost
                ? <>AIによる読み取りの概算コストは{' '}
                    <span className="font-semibold text-foreground">
                      ¥{Math.round((pendingFiles?.length ?? 0) * cost.perReceiptYen).toLocaleString()}
                    </span>
                    {' '}です（1枚あたり約 ¥{cost.perReceiptYen.toFixed(1)}）。続けますか？</>
                : 'まとまった枚数を一度に読み取ります。続けますか？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { const f = pendingFiles; setPendingFiles(null); if (f) runImport(f); }}
              className="bg-brand-500 hover:bg-brand-600 text-white">
              読み取りを開始
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({
  label, value, icon, colorClass, bgClass, borderClass, urgent,
}: {
  label: string; value: number; icon: React.ReactNode;
  colorClass: string; bgClass: string; borderClass: string; urgent?: boolean;
}) {
  return (
    <Card className={cn('shadow-none transition-all duration-150 hover:shadow-card', urgent && 'ring-1 ring-orange-200', borderClass)}>
      <CardContent className="p-4">
        <div className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium mb-3', colorClass)}>
          <span className={cn('p-1 rounded-md', bgClass)}>{icon}</span>
          {label}
        </div>
        <div className={cn('text-3xl font-bold tabular-nums tracking-tight', value > 0 ? colorClass : 'text-stone-300')}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
