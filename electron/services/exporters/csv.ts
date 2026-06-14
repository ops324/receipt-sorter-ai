import fs from 'node:fs';
import type { Project, Receipt } from '../../../shared/types';
import { PAYMENT_METHOD_LABEL } from '../../../shared/types';

type Dialect = 'freee' | 'mf' | 'generic';

interface Row {
  date: string;
  vendor: string;
  amount: number;
  tax: number;
  category: string;
  project: string;
  paymentMethod: string;
  memo: string;
}

function buildRow(r: Receipt, projectName: string): Row {
  return {
    date: r.issued_on ?? '',
    vendor: r.vendor ?? '',
    amount: r.amount ?? 0,
    tax: r.tax_amount ?? 0,
    category: r.account_category ?? '',
    project: projectName,
    paymentMethod: r.payment_method ? PAYMENT_METHOD_LABEL[r.payment_method] : '',
    memo: r.memo ?? '',
  };
}

const HEADERS: Record<Dialect, string[]> = {
  generic: ['日付', '勘定科目', '金額', '税額', '取引先', '案件', '支払方法', '摘要'],
  freee:   ['発生日', '勘定科目', '金額', '税額', '取引先', 'メモタグ', '備考', '摘要'],
  mf:      ['取引日', '借方勘定科目', '借方金額', '消費税額', '取引先', '部門', '支払方法', '摘要'],
};

function rowToCells(row: Row, dialect: Dialect): string[] {
  switch (dialect) {
    case 'freee':
      return [row.date, row.category, String(row.amount), String(row.tax), row.vendor, row.project, row.paymentMethod, row.memo];
    case 'mf':
      return [row.date, row.category, String(row.amount), String(row.tax), row.vendor, row.project, row.paymentMethod, row.memo];
    default:
      return [row.date, row.category, String(row.amount), String(row.tax), row.vendor, row.project, row.paymentMethod, row.memo];
  }
}

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export function exportCsv(outputPath: string, receipts: Receipt[], projects: Project[], dialect: Dialect): number {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const rows = receipts.map((r) => buildRow(r, r.project_id ? projectMap.get(r.project_id) ?? '' : ''));
  const lines = [HEADERS[dialect].join(',')];
  for (const row of rows) lines.push(rowToCells(row, dialect).map(csvEscape).join(','));
  // Excel が文字化けしないように UTF-8 BOM を付与
  const data = '﻿' + lines.join('\r\n') + '\r\n';
  fs.writeFileSync(outputPath, data, 'utf8');
  return rows.length;
}
