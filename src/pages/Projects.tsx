import { useEffect, useState } from 'react';
import { useApp } from '../stores/app-store';
import type { Project } from '@shared/types';
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

export function Projects() {
  const { projects, refreshProjects, pushToast } = useApp();
  const [draft, setDraft] = useState<Partial<Project>>({ name: '' });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { refreshProjects().then(() => setLoaded(true)); }, [refreshProjects]);

  async function save() {
    if (!draft.name?.trim()) return;
    if (draft.start_on && draft.end_on && draft.end_on < draft.start_on) {
      pushToast({ kind: 'error', message: '終了日は開始日以降にしてください' });
      return;
    }
    try {
      await window.api.upsertProject({ name: draft.name.trim(), start_on: draft.start_on ?? null, end_on: draft.end_on ?? null, color: draft.color ?? null, id: draft.id });
      setDraft({ name: '' });
      await refreshProjects();
      pushToast({ kind: 'success', message: '保存しました' });
    } catch (e) { pushToast({ kind: 'error', message: (e as Error).message }); }
  }

  async function remove(id: number) {
    await window.api.deleteProject(id);
    await refreshProjects();
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>案件</h1>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
          撮影現場やプロジェクトごとに領収書を集計したい場合は、ここに案件を登録します。
        </p>
      </div>

      <Card className="mb-6 shadow-card border-border bg-card">
        <CardHeader className="pb-3 pt-5 px-5">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {draft.id ? '案件を編集' : '新しい案件を追加'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-48">
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">案件名</Label>
              <Input value={draft.name ?? ''} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="例: 2026春 CM撮影" className="h-9 text-sm bg-input border-border"
                onKeyDown={(e) => { if (e.key === 'Enter') save(); }} />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">開始日</Label>
              <Input type="date" value={draft.start_on ?? ''} onChange={(e) => setDraft({ ...draft, start_on: e.target.value || null })} className="h-9 text-sm bg-input border-border" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">終了日</Label>
              <Input type="date" value={draft.end_on ?? ''} onChange={(e) => setDraft({ ...draft, end_on: e.target.value || null })} className="h-9 text-sm bg-input border-border" />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1.5 block">カラー</Label>
              <input type="color" value={draft.color ?? '#6366f1'} onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="h-9 w-12 rounded-md border border-border cursor-pointer bg-input p-0.5" />
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={save} size="sm" className="bg-brand-500 hover:bg-brand-600 text-white gap-1.5">
                <Plus size={13} />{draft.id ? '更新' : '追加'}
              </Button>
              {draft.id && <Button variant="ghost" size="sm" onClick={() => setDraft({ name: '' })}>キャンセル</Button>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent bg-muted/50">
              <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">案件名</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">期間</TableHead>
              <TableHead className="text-xs font-medium text-muted-foreground h-9 px-4">カラー</TableHead>
              <TableHead className="h-9 px-4" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loaded && [...Array(3)].map((_, i) => (
              <TableRow key={`sk-${i}`} className="border-b border-border/60">
                <TableCell colSpan={4} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
              </TableRow>
            ))}
            {loaded && projects.map((p) => (
              <TableRow key={p.id} className="border-b border-border/60 hover:bg-muted/40 transition-colors">
                <TableCell className="px-4 py-3 font-medium text-sm text-foreground">{p.name}</TableCell>
                <TableCell className="px-4 py-3 text-muted-foreground text-xs tabular-nums">
                  {(p.start_on ?? '—')} 〜 {(p.end_on ?? '—')}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <span className="inline-block w-5 h-5 rounded-md border border-black/10 shadow-sm" style={{ background: p.color ?? '#cbd5e1' }} />
                </TableCell>
                <TableCell className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button variant="ghost" size="icon" onClick={() => setDraft(p)}
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
                          <AlertDialogTitle>案件を削除しますか？</AlertDialogTitle>
                          <AlertDialogDescription>「{p.name}」を削除します。領収書側の案件割当は外れます。</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>キャンセル</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(p.id)} className="bg-red-600 hover:bg-red-700 text-white">削除する</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {loaded && projects.length === 0 && (
              <TableRow><TableCell colSpan={4} className="px-4 py-16 text-center text-muted-foreground text-sm">
                案件がまだありません。上のフォームから撮影現場やプロジェクトを登録できます。
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
