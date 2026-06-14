import fs from 'node:fs';
import path from 'node:path';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { app } from 'electron';
import type { Project, Receipt } from '../../../shared/types';
import { PAYMENT_METHOD_LABEL } from '../../../shared/types';

function fontPath(): string {
  // 開発時は assets/fonts/ipag.ttf、配布時は process.resourcesPath/assets/fonts/ipag.ttf
  const candidates = [
    path.join(process.resourcesPath ?? '', 'assets', 'fonts', 'ipag.ttf'),
    path.join(app.getAppPath(), 'assets', 'fonts', 'ipag.ttf'),
    path.join(app.getAppPath(), '..', 'assets', 'fonts', 'ipag.ttf'),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error('IPAGothic フォントが見つかりません: ' + candidates.join(' / '));
}

interface DrawCursor { y: number; }

const PAGE_W = 595.28;   // A4 portrait pt
const PAGE_H = 841.89;
const MARGIN = 40;

export async function exportPdfReport(outputPath: string, receipts: Receipt[], projects: Project[], periodLabel: string): Promise<number> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const fontBytes = fs.readFileSync(fontPath());
  const font = await doc.embedFont(fontBytes, { subset: true });
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  const drawTextLine = (page: ReturnType<typeof doc.addPage>, text: string, x: number, y: number, size: number, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x, y, size, font, color });
  };

  // ===== 表紙 =====
  let page = doc.addPage([PAGE_W, PAGE_H]);
  drawTextLine(page, 'アリサ 領収書集計レポート', MARGIN, PAGE_H - MARGIN - 24, 20);
  drawTextLine(page, `期間: ${periodLabel}`, MARGIN, PAGE_H - MARGIN - 60, 12);
  drawTextLine(page, `総件数: ${receipts.length} 件`, MARGIN, PAGE_H - MARGIN - 80, 12);
  const total = receipts.reduce((s, r) => s + (r.amount ?? 0), 0);
  drawTextLine(page, `総額: ¥${total.toLocaleString()}`, MARGIN, PAGE_H - MARGIN - 100, 12);
  drawTextLine(page, `生成日時: ${new Date().toLocaleString('ja-JP')}`, MARGIN, PAGE_H - MARGIN - 120, 10, rgb(0.4, 0.4, 0.4));

  // ===== 科目別小計 =====
  const byCategory = new Map<string, { count: number; total: number }>();
  for (const r of receipts) {
    const key = r.account_category ?? '(未分類)';
    const v = byCategory.get(key) ?? { count: 0, total: 0 };
    v.count += 1; v.total += r.amount ?? 0;
    byCategory.set(key, v);
  }
  let y = PAGE_H - MARGIN - 170;
  drawTextLine(page, '勘定科目別小計', MARGIN, y, 14); y -= 22;
  drawTextLine(page, '科目', MARGIN, y, 10, rgb(0.3, 0.3, 0.3));
  drawTextLine(page, '件数', MARGIN + 220, y, 10, rgb(0.3, 0.3, 0.3));
  drawTextLine(page, '金額', MARGIN + 320, y, 10, rgb(0.3, 0.3, 0.3));
  y -= 14;
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  for (const [cat, v] of byCategory) {
    drawTextLine(page, cat, MARGIN, y, 11);
    drawTextLine(page, `${v.count}`, MARGIN + 220, y, 11);
    drawTextLine(page, `¥${v.total.toLocaleString()}`, MARGIN + 320, y, 11);
    y -= 16;
    if (y < MARGIN + 40) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  }

  // ===== 案件別小計 =====
  if (projects.length > 0) {
    if (y < MARGIN + 80) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    y -= 24;
    drawTextLine(page, '案件別小計', MARGIN, y, 14); y -= 22;
    const byProject = new Map<string, { count: number; total: number }>();
    for (const r of receipts) {
      const key = r.project_id ? projectMap.get(r.project_id) ?? '(削除済み案件)' : '(未割当)';
      const v = byProject.get(key) ?? { count: 0, total: 0 };
      v.count += 1; v.total += r.amount ?? 0;
      byProject.set(key, v);
    }
    for (const [name, v] of byProject) {
      drawTextLine(page, name, MARGIN, y, 11);
      drawTextLine(page, `${v.count}`, MARGIN + 220, y, 11);
      drawTextLine(page, `¥${v.total.toLocaleString()}`, MARGIN + 320, y, 11);
      y -= 16;
      if (y < MARGIN + 40) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    }
  }

  // ===== 明細一覧 =====
  page = doc.addPage([PAGE_W, PAGE_H]);
  y = PAGE_H - MARGIN;
  drawTextLine(page, '明細一覧', MARGIN, y, 16); y -= 24;
  const headers = ['日付', '取引先', '科目', '案件', '支払', '金額'];
  const xs = [MARGIN, MARGIN + 70, MARGIN + 230, MARGIN + 320, MARGIN + 410, MARGIN + 470];
  for (let i = 0; i < headers.length; i++) drawTextLine(page, headers[i], xs[i], y, 10, rgb(0.3, 0.3, 0.3));
  y -= 14;
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  for (const r of receipts) {
    if (y < MARGIN + 30) { page = doc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
    const cells = [
      r.issued_on ?? '',
      truncate(r.vendor ?? '', 14),
      r.account_category ?? '',
      r.project_id ? truncate(projectMap.get(r.project_id) ?? '', 8) : '',
      r.payment_method ? PAYMENT_METHOD_LABEL[r.payment_method] : '',
      `¥${(r.amount ?? 0).toLocaleString()}`,
    ];
    for (let i = 0; i < cells.length; i++) drawTextLine(page, cells[i], xs[i], y, 10);
    y -= 14;
  }

  const bytes = await doc.save();
  fs.writeFileSync(outputPath, bytes);
  return receipts.length;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
