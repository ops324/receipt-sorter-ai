import { useMemo, useState } from 'react';
import { useApp } from '../stores/app-store';
import { PAYMENT_METHOD_LABEL } from '@shared/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Banknote, Coins, Receipt as ReceiptIcon, AlertCircle } from 'lucide-react';

// 円（整数）を ¥1,234 形式に。集計は税込・整数円が前提。
const yen = (n: number) => '¥' + Math.round(n).toLocaleString('ja-JP');

// タイムゾーンずれを避けるため toISOString ではなくローカル日付で YYYY-MM-DD を作る
const fmtDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function Summary() {
  const today = new Date();
  const firstOfMonth = fmtDate(new Date(today.getFullYear(), today.getMonth(), 1));
  const lastOfMonth = fmtDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

  const [fromDate, setFromDate] = useState(firstOfMonth);
  const [toDate, setToDate] = useState(lastOfMonth);
  const [projectId, setProjectId] = useState<number | ''>('');
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const { receipts, projects } = useApp();

  const invalidRange = fromDate > toDate;

  // 集計対象: 期間内 + 案件一致 +（確定のみ）。失敗/処理中は金額が不定のため常に除外。
  // 日付未設定の領収書は期間集計に含めると各月で重複するため除外し、件数だけ注記する。
  const { targets, undatedCount } = useMemo(() => {
    let undated = 0;
    const list = receipts.filter((r) => {
      if (r.status === 'failed' || r.status === 'processing') return false;
      if (confirmedOnly && r.status !== 'confirmed') return false;
      if (projectId !== '' && r.project_id !== projectId) return false;
      if (!r.issued_on) { undated++; return false; }
      if (r.issued_on < fromDate || r.issued_on > toDate) return false;
      return true;
    });
    return { targets: list, undatedCount: undated };
  }, [receipts, fromDate, toDate, projectId, confirmedOnly]);

  const totalAmount = useMemo(() => targets.reduce((s, r) => s + (r.amount ?? 0), 0), [targets]);
  const totalTax = useMemo(() => targets.reduce((s, r) => s + (r.tax_amount ?? 0), 0), [targets]);

  // 勘定科目別（金額合計の降順）
  const byCategory = useMemo(() => {
    const m = new Map<string, { count: number; amount: number; tax: number }>();
    for (const r of targets) {
      const key = r.account_category ?? '（未分類）';
      const cur = m.get(key) ?? { count: 0, amount: 0, tax: 0 };
      cur.count += 1;
      cur.amount += r.amount ?? 0;
      cur.tax += r.tax_amount ?? 0;
      m.set(key, cur);
    }
    return [...m.entries()]
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [targets]);

  // 支払方法別（金額合計の降順）
  const byPayment = useMemo(() => {
    const m = new Map<string, { count: number; amount: number }>();
    for (const r of targets) {
      const key = r.payment_method ? PAYMENT_METHOD_LABEL[r.payment_method] : '不明';
      const cur = m.get(key) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.amount ?? 0;
      m.set(key, cur);
    }
    return [...m.entries()]
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => b.amount - a.amount);
  }, [targets]);

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>
          集計
        </h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          期間・案件で絞り込み、勘定科目ごとの合計金額と消費税を自動計算します。
        </p>
      </div>

      {/* 絞り込み */}
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
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value === '' ? '' : Number(e.target.value))}
                className="h-9 px-3 border border-border rounded-md text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
              >
                <option value="">すべて</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground cursor-pointer select-none">
                <Checkbox checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} />
                確定済みのみ
              </label>
            </div>
          </div>
          {invalidRange && (
            <p className="mt-3 flex items-center gap-1 text-xs text-red-600">
              <AlertCircle size={11} className="shrink-0" />開始日が終了日より後になっています
            </p>
          )}
          {undatedCount > 0 && !invalidRange && (
            <p className="mt-3 text-xs text-muted-foreground/70">
              日付未設定の領収書 {undatedCount} 件は期間集計の対象外です
            </p>
          )}
        </CardContent>
      </Card>

      {invalidRange ? null : targets.length === 0 ? (
        <Card className="shadow-card border-border bg-card">
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            この期間・条件に該当する領収書がありません
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <KpiCard Icon={ReceiptIcon} label="対象件数" value={`${targets.length} 件`} />
            <KpiCard Icon={Banknote} label="税込合計" value={yen(totalAmount)} />
            <KpiCard Icon={Coins} label="うち消費税" value={yen(totalTax)} />
          </div>

          {/* 勘定科目別 */}
          <Card className="mb-5 shadow-card border-border bg-card">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">勘定科目別</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">勘定科目</TableHead>
                    <TableHead className="text-xs text-right">件数</TableHead>
                    <TableHead className="text-xs text-right">金額合計</TableHead>
                    <TableHead className="text-xs text-right">うち税額</TableHead>
                    <TableHead className="text-xs text-right w-28">構成比</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byCategory.map((row) => {
                    const ratio = totalAmount > 0 ? (row.amount / totalAmount) * 100 : 0;
                    return (
                      <TableRow key={row.category}>
                        <TableCell className="text-sm font-medium">{row.category}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{row.count}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums font-semibold">{yen(row.amount)}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{yen(row.tax)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-14 rounded-full bg-brand-100 overflow-hidden">
                              <div className="h-full rounded-full bg-brand-400" style={{ width: `${ratio}%` }} />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-9 text-right">{ratio.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="border-t-2 border-border">
                    <TableCell className="text-sm font-bold">合計</TableCell>
                    <TableCell className="text-sm text-right tabular-nums font-bold">{targets.length}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums font-bold">{yen(totalAmount)}</TableCell>
                    <TableCell className="text-sm text-right tabular-nums font-bold">{yen(totalTax)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 支払方法別 */}
          <Card className="shadow-card border-border bg-card">
            <CardHeader className="pb-2 pt-5 px-5">
              <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">支払方法別</CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">支払方法</TableHead>
                    <TableHead className="text-xs text-right">件数</TableHead>
                    <TableHead className="text-xs text-right">金額合計</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byPayment.map((row) => (
                    <TableRow key={row.label}>
                      <TableCell className="text-sm font-medium">{row.label}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums text-muted-foreground">{row.count}</TableCell>
                      <TableCell className="text-sm text-right tabular-nums font-semibold">{yen(row.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function KpiCard({ Icon, label, value }: { Icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-card p-4">
      <div className="flex items-center gap-1.5 mb-2 text-muted-foreground">
        <Icon size={13} className="shrink-0" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="text-xl font-bold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
