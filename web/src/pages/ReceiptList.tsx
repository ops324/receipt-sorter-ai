import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../stores/app-store';
import type { Receipt, AccountCategory } from '@shared/types';
import { ACCOUNT_CATEGORIES, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@shared/types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  Search, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff, Trash2,
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown,
  RefreshCw, Check, Receipt as ReceiptIcon, FileText, FolderOpen,
} from 'lucide-react';

type FilterStatus = 'all' | Receipt['status'];
type SortKey = 'date' | 'amount';
type SortDir = 'asc' | 'desc';

const STATUS_TABS: { value: FilterStatus; label: string }[] = [
  { value: 'all',        label: 'すべて' },
  { value: 'processing', label: '処理中' },
  { value: 'pending',    label: '要確認' },
  { value: 'confirmed',  label: '確定済' },
  { value: 'failed',     label: '失敗' },
];

export function ReceiptList() {
  const { receipts, projects, refreshReceipts, removeReceiptLocal, upsertReceiptLocal, pushToast } = useApp();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { refreshReceipts().then(() => setLoaded(true)); }, [refreshReceipts]);

  // フィルタ・検索が変わったら一括選択をクリア（見えない行を選択したまま残さない）
  useEffect(() => { setSelectedIds(new Set()); }, [filter, search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = receipts.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (q) { const blob = `${r.vendor ?? ''} ${r.memo ?? ''}`.toLowerCase(); if (!blob.includes(q)) return false; }
      return true;
    });
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (sortKey === 'date') {
          const av = a.issued_on ?? ''; const bv = b.issued_on ?? '';
          if (!av && !bv) return 0;
          if (!av) return 1;       // 未入力は常に末尾
          if (!bv) return -1;
          return av < bv ? -dir : av > bv ? dir : 0;
        }
        const av = a.amount; const bv = b.amount;
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        return (av - bv) * dir;
      });
    }
    return list;
  }, [receipts, filter, search, sortKey, sortDir]);

  const selectedIdx = useMemo(() => filtered.findIndex((r) => r.id === selectedId), [filtered, selectedId]);
  const selected = selectedIdx >= 0 ? filtered[selectedIdx] : null;
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  const allSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map((r) => r.id)));
  }

  async function update(patch: Partial<Receipt>) {
    if (!selected) return;
    const updated = await window.api.updateReceipt(selected.id, patch);
    upsertReceiptLocal(updated);
  }

  async function remove() {
    if (!selected) return;
    await window.api.deleteReceipt(selected.id);
    removeReceiptLocal(selected.id);
    setSelectedId(null);
    pushToast({ kind: 'success', message: '削除しました' });
  }

  async function bulkConfirm() {
    const ids = [...selectedIds];
    for (const id of ids) upsertReceiptLocal(await window.api.updateReceipt(id, { status: 'confirmed' }));
    setSelectedIds(new Set());
    pushToast({ kind: 'success', message: `${ids.length}件を確定しました` });
  }

  async function bulkSetCategory(cat: AccountCategory) {
    const ids = [...selectedIds];
    for (const id of ids) upsertReceiptLocal(await window.api.updateReceipt(id, { account_category: cat }));
    setSelectedIds(new Set());
    pushToast({ kind: 'success', message: `${ids.length}件の科目を「${cat}」に設定しました` });
  }

  async function bulkDelete() {
    const ids = [...selectedIds];
    for (const id of ids) { await window.api.deleteReceipt(id); removeReceiptLocal(id); }
    if (selectedId !== null && ids.includes(selectedId)) setSelectedId(null);
    setSelectedIds(new Set());
    pushToast({ kind: 'success', message: `${ids.length}件を削除しました` });
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-border bg-card flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input placeholder="店名・メモで検索" value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-7 h-8 text-sm border-border bg-input" />
          </div>

          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterStatus)}>
            <TabsList className="h-8 bg-muted p-0.5">
              {STATUS_TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}
                  className="h-7 px-2.5 text-xs data-[state=active]:bg-card data-[state=active]:shadow-sm">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {filtered.length} / {receipts.length}
          </span>
        </div>

        {/* 一括操作バー */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2 bg-brand-50 border-b border-brand-200 flex items-center gap-2.5">
            <span className="text-xs font-semibold text-brand-800 tabular-nums">{selectedIds.size}件を選択中</span>
            <div className="w-px h-4 bg-brand-200" />
            <Button size="sm" onClick={bulkConfirm} className="h-7 bg-brand-500 hover:bg-brand-600 text-white gap-1 text-xs">
              <CheckCircle2 size={12} />一括確定
            </Button>
            <select
              value=""
              onChange={(e) => { if (e.target.value) bulkSetCategory(e.target.value as AccountCategory); }}
              className="h-7 px-2 border border-brand-200 rounded-md text-xs bg-card focus:outline-none focus:ring-1 focus:ring-ring">
              <option value="">科目を一括設定…</option>
              {ACCOUNT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-red-600 hover:text-red-700 hover:bg-red-100 gap-1 text-xs">
                  <Trash2 size={12} />一括削除
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{selectedIds.size}件の領収書を削除しますか？</AlertDialogTitle>
                  <AlertDialogDescription>選択した領収書を完全に削除します。この操作は取り消せません。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction onClick={bulkDelete} className="bg-red-600 hover:bg-red-700 text-white">削除する</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <button onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs text-brand-700 hover:text-brand-900 transition-colors">
              選択を解除
            </button>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur-sm z-10">
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="h-9 px-3 w-10">
                  <Checkbox checked={allSelected} indeterminate={someSelected}
                    onChange={toggleAll} aria-label="表示中のすべてを選択"
                    disabled={filtered.length === 0} />
                </TableHead>
                <SortHead label="日付" col="date" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('date')} />
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">取引先</TableHead>
                <SortHead label="金額" col="amount" sortKey={sortKey} sortDir={sortDir} onClick={() => toggleSort('amount')} align="right" />
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">科目</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">案件</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">支払</TableHead>
                <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">状態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!loaded
                ? [...Array(6)].map((_, i) => (
                    <TableRow key={`sk-${i}`} className="border-b border-border/60">
                      <TableCell colSpan={8} className="px-4 py-3">
                        <div className="h-4 bg-muted rounded animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))
                : (
                  <>
                    {filtered.map((r) => (
                      <TableRow key={r.id}
                        tabIndex={0} role="button"
                        onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedId(r.id === selectedId ? null : r.id);
                          }
                        }}
                        className={cn(
                          'cursor-pointer border-b border-border/60 transition-colors outline-none',
                          'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                          selectedId === r.id ? 'bg-brand-50 hover:bg-brand-50'
                            : selectedIds.has(r.id) ? 'bg-brand-50/50 hover:bg-brand-50/70'
                            : 'hover:bg-muted/50',
                        )}>
                        <TableCell className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)}
                            aria-label={`${r.vendor ?? '領収書'} を選択`} />
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-muted-foreground tabular-nums text-xs whitespace-nowrap">{r.issued_on ?? '—'}</TableCell>
                        <TableCell className="px-4 py-2.5 font-medium text-sm">
                          {r.vendor ?? <span className="text-muted-foreground/50 font-normal text-xs">未抽出</span>}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-right tabular-nums text-sm font-medium">
                          {r.amount !== null ? `¥${r.amount.toLocaleString()}` : <span className="text-muted-foreground/30 font-normal">—</span>}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-muted-foreground text-xs">{r.account_category ?? '—'}</TableCell>
                        <TableCell className="px-4 py-2.5 text-muted-foreground text-xs">
                          {r.project_id ? projectMap.get(r.project_id) ?? '—' : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-muted-foreground text-xs">
                          {r.payment_method ? PAYMENT_METHOD_LABEL[r.payment_method] : '—'}
                        </TableCell>
                        <TableCell className="px-4 py-2.5"><StatusBadge status={r.status} /></TableCell>
                      </TableRow>
                    ))}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="px-4 py-20 text-center">
                          {receipts.length === 0 ? (
                            <div className="flex flex-col items-center gap-1.5">
                              <ReceiptIcon size={28} className="text-muted-foreground/30 mb-1" />
                              <div className="text-sm text-muted-foreground">領収書がまだありません</div>
                              <div className="text-xs text-muted-foreground/70">
                                「インボックス」画面から写真やPDFを追加してください
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">該当する領収書がありません</span>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <SheetContent side="right" className="w-[400px] sm:w-[440px] p-0 flex flex-col bg-card border-border">
          {selected && (
            <Editor
              key={selected.id}
              receipt={selected}
              onChange={update}
              onDelete={remove}
              hasPrev={selectedIdx > 0}
              hasNext={selectedIdx >= 0 && selectedIdx < filtered.length - 1}
              onPrev={() => setSelectedId(filtered[selectedIdx - 1].id)}
              onNext={() => setSelectedId(filtered[selectedIdx + 1].id)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SortHead({ label, col, sortKey, sortDir, onClick, align }: {
  label: string; col: SortKey; sortKey: SortKey | null; sortDir: SortDir;
  onClick: () => void; align?: 'right';
}) {
  const active = sortKey === col;
  return (
    <TableHead className={cn('text-xs font-medium text-muted-foreground h-9 px-4', align === 'right' && 'text-right')}>
      <button onClick={onClick}
        className={cn('inline-flex items-center gap-1 transition-colors hover:text-foreground',
          align === 'right' && 'flex-row-reverse', active && 'text-foreground')}>
        {label}
        {active
          ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
          : <ChevronsUpDown size={11} className="text-muted-foreground/40" />}
      </button>
    </TableHead>
  );
}

function StatusBadge({ status }: { status: Receipt['status'] }) {
  const configs: Record<Receipt['status'], { className: string; label: string; icon: React.ReactNode }> = {
    processing: { className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50',   label: '処理中', icon: <Loader2 size={10} className="animate-spin" /> },
    pending:    { className: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50', label: '要確認', icon: <AlertCircle size={10} /> },
    confirmed:  { className: 'bg-sage-50 text-sage-700 border-sage-200 hover:bg-sage-50',         label: '確定済', icon: <CheckCircle2 size={10} /> },
    failed:     { className: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50',             label: '失敗',   icon: <AlertCircle size={10} /> },
  };
  const { className, label, icon } = configs[status];
  return (
    <Badge variant="outline" className={cn('gap-1 px-1.5 py-0.5 text-[11px] font-medium', className)}>
      {icon}{label}
    </Badge>
  );
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const cls = value >= 0.7
    ? 'bg-sage-50 text-sage-700 border-sage-200'
    : value >= 0.4
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200';
  return (
    <Badge variant="outline" className={cn('gap-1 px-1.5 py-0.5 text-[11px] font-medium tabular-nums', cls)}
      title="AIによる読み取りの信頼度。低いほど見直しをおすすめします。">
      信頼度 {pct}%
    </Badge>
  );
}

function Editor({ receipt, onChange, onDelete, hasPrev, hasNext, onPrev, onNext }: {
  receipt: Receipt;
  onChange: (p: Partial<Receipt>) => Promise<void>;
  onDelete: () => void;
  hasPrev: boolean; hasNext: boolean;
  onPrev: () => void; onNext: () => void;
}) {
  const projects = useApp((s) => s.projects);
  const upsertReceiptLocal = useApp((s) => s.upsertReceiptLocal);
  const pushToast = useApp((s) => s.pushToast);
  const [preview, setPreview] = useState<{ dataUrl: string; mime: string } | null>(null);
  const [showOcr, setShowOcr] = useState(false);
  const [savedTick, setSavedTick] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => { window.api.getReceiptOriginal(receipt.id).then(setPreview); }, [receipt.id]);

  useEffect(() => {
    if (savedTick === 0) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [savedTick]);

  async function handleChange(patch: Partial<Receipt>) {
    await onChange(patch);
    setSavedTick((t) => t + 1);
  }

  async function retry() {
    setRetrying(true);
    try {
      const updated = await window.api.retryOcr(receipt.id);
      upsertReceiptLocal(updated);
      pushToast(updated.status === 'failed'
        ? { kind: 'error', message: '再読み取りに失敗しました' }
        : { kind: 'success', message: 'OCRを再実行しました' });
    } catch (e) {
      pushToast({ kind: 'error', message: (e as Error).message });
    } finally {
      setRetrying(false);
    }
  }

  const sel = "w-full h-9 px-3 border border-border rounded-md text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors";
  const busy = receipt.status === 'processing' || retrying;
  const warnVendor = receipt.status === 'pending' && !receipt.vendor;
  const warnDate   = receipt.status === 'pending' && !receipt.issued_on;
  const warnAmount = receipt.status === 'pending' && receipt.amount === null;
  const canRetry = receipt.status === 'failed' || receipt.status === 'pending';

  return (
    <>
      <SheetHeader className="px-4 py-3 border-b border-border shrink-0 bg-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <button onClick={onPrev} disabled={!hasPrev} aria-label="前の領収書"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors">
              <ChevronLeft size={15} />
            </button>
            <button onClick={onNext} disabled={!hasNext} aria-label="次の領収書"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-colors">
              <ChevronRight size={15} />
            </button>
            <SheetTitle className="text-sm font-semibold text-foreground ml-1 truncate">領収書 #{receipt.id}</SheetTitle>
            {showSaved && (
              <span className="flex items-center gap-0.5 text-[11px] text-sage-600 font-medium animate-fade-in shrink-0">
                <Check size={11} />保存済み
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ConfidenceBadge value={receipt.confidence} />
            <StatusBadge status={receipt.status} />
          </div>
        </div>
      </SheetHeader>

      <div className="flex-1 overflow-auto p-4 space-y-3.5 bg-background">
        {preview && (
          preview.mime === 'application/pdf'
            ? (
              <div className="rounded-xl border border-border p-4 bg-muted flex flex-col items-center gap-2">
                <FileText size={20} className="text-muted-foreground" />
                <div className="text-xs text-muted-foreground">PDFのプレビュー画像は未生成です</div>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => window.api.revealInFinder(receipt.source_path)}>
                  <FolderOpen size={12} />Finderで原本を開く
                </Button>
              </div>
            )
            : <img src={preview.dataUrl} alt="領収書" className="w-full rounded-xl border border-border object-contain max-h-52 bg-muted" />
        )}

        {receipt.status === 'pending' && (warnVendor || warnDate || warnAmount) && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
            <AlertCircle size={13} className="shrink-0 mt-0.5 text-amber-600" />
            <span>AIが読み取れなかった項目があります。下の「要確認」マークの欄を確認してください。</span>
          </div>
        )}

        <FF label="取引先" warn={warnVendor}>
          <Input value={receipt.vendor ?? ''} onChange={(e) => handleChange({ vendor: e.target.value })} className="h-9 text-sm bg-input border-border" />
        </FF>
        <FF label="日付" warn={warnDate}>
          <Input type="date" value={receipt.issued_on ?? ''} onChange={(e) => handleChange({ issued_on: e.target.value || null })} className="h-9 text-sm bg-input border-border" />
        </FF>
        <FF label="金額（税込）" warn={warnAmount}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">¥</span>
              <Input type="number" min={0} step={1} value={receipt.amount ?? ''}
                onChange={(e) => handleChange({ amount: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) : null })}
                className="pl-6 h-9 text-sm tabular-nums bg-input border-border" />
            </div>
            <Input type="number" min={0} step={1} placeholder="うち消費税" value={receipt.tax_amount ?? ''}
              onChange={(e) => handleChange({ tax_amount: e.target.value ? Math.max(0, Math.round(Number(e.target.value))) : null })}
              className="w-32 h-9 text-sm tabular-nums bg-input border-border" />
          </div>
        </FF>
        <FF label="勘定科目">
          <select value={receipt.account_category ?? ''} onChange={(e) => handleChange({ account_category: (e.target.value || null) as Receipt['account_category'] })} className={sel}>
            <option value="">(未分類)</option>
            {ACCOUNT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </FF>
        <FF label="案件">
          <select value={receipt.project_id ?? ''} onChange={(e) => handleChange({ project_id: e.target.value ? Number(e.target.value) : null })} className={sel}>
            <option value="">(未割当)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </FF>
        <FF label="支払方法">
          <select value={receipt.payment_method ?? ''} onChange={(e) => handleChange({ payment_method: (e.target.value || null) as Receipt['payment_method'] })} className={sel}>
            <option value="">(不明)</option>
            {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{PAYMENT_METHOD_LABEL[p]}</option>)}
          </select>
        </FF>
        <FF label="メモ">
          <Textarea value={receipt.memo ?? ''} onChange={(e) => handleChange({ memo: e.target.value })} rows={3} className="text-sm resize-none bg-input border-border" />
        </FF>

        {receipt.error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 whitespace-pre-wrap leading-relaxed">{receipt.error}</div>
        )}
        {receipt.ocr_raw && (
          <div>
            <button onClick={() => setShowOcr((v) => !v)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
              {showOcr ? <EyeOff size={12} /> : <Eye size={12} />} AIの読み取り元データ
            </button>
            {showOcr && (
              <pre className="mt-2 p-3 bg-muted border border-border rounded-lg text-[11px] text-muted-foreground overflow-auto max-h-40 leading-relaxed">{receipt.ocr_raw}</pre>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3 flex items-center justify-between gap-2 bg-card">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1.5">
              <Trash2 size={13} />削除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>領収書を削除しますか？</AlertDialogTitle>
              <AlertDialogDescription>「{receipt.vendor ?? '無題'}」を完全に削除します。この操作は取り消せません。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700 text-white">削除する</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="flex items-center gap-2">
          {canRetry && (
            <Button variant="outline" size="sm" onClick={retry} disabled={busy}
              title="AIで領収書を読み直します"
              className="gap-1.5">
              <RefreshCw size={13} className={retrying ? 'animate-spin' : ''} />OCR再実行
            </Button>
          )}
          {receipt.status !== 'confirmed'
            ? <Button size="sm" onClick={() => handleChange({ status: 'confirmed' })} className="bg-brand-500 hover:bg-brand-600 text-white gap-1.5">
                <CheckCircle2 size={13} />確定
              </Button>
            : <Button variant="ghost" size="sm" onClick={() => handleChange({ status: 'pending' })} className="text-muted-foreground">
                未確定に戻す
              </Button>
          }
        </div>
      </div>
    </>
  );
}

function FF({ label, warn, children }: { label: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        {warn && (
          <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
            <AlertCircle size={9} />要確認
          </span>
        )}
      </div>
      <div className={cn('rounded-md', warn && 'ring-1 ring-amber-300')}>{children}</div>
    </div>
  );
}
