import ExcelJS from 'exceljs';
import type { Project, Receipt } from '../../../shared/types';
import { PAYMENT_METHOD_LABEL } from '../../../shared/types';

export async function exportExcel(outputPath: string, receipts: Receipt[], projects: Project[]): Promise<number> {
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'アリサ';
  wb.created = new Date();

  const sheet = wb.addWorksheet('明細');
  sheet.columns = [
    { header: '日付', key: 'date', width: 12 },
    { header: '勘定科目', key: 'category', width: 14 },
    { header: '金額', key: 'amount', width: 12 },
    { header: '税額', key: 'tax', width: 10 },
    { header: '取引先', key: 'vendor', width: 24 },
    { header: '案件', key: 'project', width: 20 },
    { header: '支払方法', key: 'pm', width: 12 },
    { header: '摘要', key: 'memo', width: 40 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const r of receipts) {
    sheet.addRow({
      date: r.issued_on ?? '',
      category: r.account_category ?? '',
      amount: r.amount ?? 0,
      tax: r.tax_amount ?? 0,
      vendor: r.vendor ?? '',
      project: r.project_id ? projectMap.get(r.project_id) ?? '' : '',
      pm: r.payment_method ? PAYMENT_METHOD_LABEL[r.payment_method] : '',
      memo: r.memo ?? '',
    });
  }

  // 合計シート
  const summary = wb.addWorksheet('集計');
  summary.columns = [
    { header: '勘定科目', key: 'category', width: 16 },
    { header: '件数', key: 'count', width: 8 },
    { header: '金額合計', key: 'total', width: 16 },
  ];
  summary.getRow(1).font = { bold: true };
  const totals = new Map<string, { count: number; total: number }>();
  for (const r of receipts) {
    const key = r.account_category ?? '(未分類)';
    const cur = totals.get(key) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += r.amount ?? 0;
    totals.set(key, cur);
  }
  for (const [category, v] of totals) {
    summary.addRow({ category, count: v.count, total: v.total });
  }

  await wb.xlsx.writeFile(outputPath);
  return receipts.length;
}
