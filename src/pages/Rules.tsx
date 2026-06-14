import { useEffect, useState } from 'react';
import { useApp } from '../stores/app-store';
import type { Rule } from '@shared/types';
import { ACCOUNT_CATEGORIES, PAYMENT_METHODS, PAYMENT_METHOD_LABEL } from '@shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export function Rules() {
  const { rules, refreshRules, pushToast } = useApp();
  const [draft, setDraft] = useState<Partial<Rule>>({ keyword: '', priority: 100 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { refreshRules().then(() => setLoaded(true)); }, [refreshRules]);

  async function save() {
    if (!draft.keyword?.trim()) return;
    try {
      await window.api.upsertRule({ keyword: draft.keyword.trim(), account_category: draft.account_category ?? null, payment_method: draft.payment_method ?? null, priority: draft.priority ?? 100, id: draft.id });
      setDraft({ keyword: '', priority: 100 });
      await refreshRules();
      pushToast({ kind: 'success', message: '保存しました' });
    } catch (e) { pushToast({ kind: 'error', message: (e as Error).message }); }
  }

  async function remove(id: number) {
    await window.api.deleteRule(id);
    await refreshRules();
  }

  const sel = "h-9 px-3 border border-border rounded-md text-sm bg-input focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors";

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>自動分類ルール</h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          店名にキーワードが含まれていたら、勘定科目や支払方法を自動で割り当てます。優先度が小さいほど先に評価されます。
        </p>
      </div>

      <Card className="mb-6 shadow-card border-border bg-card">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {draft.id ? 'ルールを編集' : '新しいルールを追加'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-40">
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">キーワード（店名の一部）</Label>
              <Input value={draft.keyword ?? ''} onChange={(e) => setDraft({ ...draft, keyword: e.target.value })}
                placeholder="例: タクシー" className="h-9 text-sm bg-input border-border"
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">勘定科目</Label>
              <select value={draft.account_category ?? ''} onChange={(e) => setDraft({ ...draft, account_category: (e.target.value || null) as Rule['account_category'] })} className={sel}>
                <option value="">(変更しない)</option>
                {ACCOUNT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">支払方法</Label>
              <select value={draft.payment_method ?? ''} onChange={(e) => setDraft({ ...draft, payment_method: (e.target.value || null) as Rule['payment_method'] })} className={sel}>
                <option value="">(変更しない)</option>
                {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{PAYMENT_METHOD_LABEL[p]}</option>)}
              </select>
            </div>
            <div className="w-20">
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">優先度</Label>
              <Input type="number" min={0} value={draft.priority ?? 100} onChange={(e) => setDraft({ ...draft, priority: Math.max(0, Number(e.target.value) || 0) })} className="h-9 text-sm tabular-nums bg-input border-border" />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={save} size="sm" className="bg-brand-500 hover:bg-brand-600 text-white gap-1.5">
                <Plus size={13} />{draft.id ? '更新' : '追加'}
              </Button>
              {draft.id && <Button variant="ghost" size="sm" onClick={() => setDraft({ keyword: '', priority: 100 })}>キャンセル</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent bg-muted/50">
              <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4 w-16">優先度</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">キーワード</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">勘定科目</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">支払方法</TableHead>
              <TableHead className="h-9 px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loaded && [...Array(3)].map((_, i) => (
              <TableRow key={`sk-${i}`} className="border-b border-border/60">
                <TableCell colSpan={5} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
              </TableRow>
            ))}
            {loaded && rules.map((r) => (
              <TableRow key={r.id} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                <TableCell className="px-4 py-3 text-muted-foreground tabular-nums text-xs">{r.priority}</TableCell>
                <TableCell className="px-4 py-3 font-medium text-sm text-foreground">{r.keyword}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground text-xs">
                  {r.account_category ?? <span className="text-muted-foreground/30">—</span>}
                </TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground text-xs">
                  {r.payment_method ? PAYMENT_METHOD_LABEL[r.payment_method] : <span className="text-muted-foreground/30">—</span>}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="ghost" size="icon" onClick={() => setDraft(r)}
                      className="h-7 w-7 text-muted-foreground hover:text-brand-600 hover:bg-brand-100" aria-label="編集">
                      <Pencil size={13} />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50" aria-label="削除">
                          <Trash2 size={13} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>ルールを削除しますか？</AlertDialogTitle>
                          <AlertDialogDescription>キーワード「{r.keyword}」のルールを削除します。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(r.id)} className="bg-red-600 hover:bg-red-700 text-white">削除する</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {loaded && rules.length === 0 && (
              <TableRow><TableCell colSpan={5} className="px-4 py-16 text-center text-muted-foreground text-sm">
                ルールがまだありません。上のフォームから追加できます。
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
