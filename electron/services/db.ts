import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import type { Project, Receipt, Rule } from '../../shared/types';

let db: Database.Database | null = null;

export function getUserDataDir(): string {
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getOriginalsDir(): string {
  const dir = path.join(getUserDataDir(), 'originals');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getThumbsDir(): string {
  const dir = path.join(getUserDataDir(), 'thumbs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function initDb(): Database.Database {
  if (db) return db;
  const dbPath = path.join(getUserDataDir(), 'arisa.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(d: Database.Database) {
  d.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_path TEXT NOT NULL,
      thumbnail_path TEXT,
      ocr_raw TEXT,
      vendor TEXT,
      issued_on TEXT,
      amount INTEGER,
      tax_amount INTEGER,
      payment_method TEXT,
      account_category TEXT,
      project_id INTEGER,
      memo TEXT,
      status TEXT NOT NULL DEFAULT 'processing',
      confidence REAL,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_receipts_issued_on ON receipts(issued_on);
    CREATE INDEX IF NOT EXISTS idx_receipts_status ON receipts(status);

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      start_on TEXT,
      end_on TEXT,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      account_category TEXT,
      payment_method TEXT,
      priority INTEGER NOT NULL DEFAULT 100
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL,
      output_tokens INTEGER NOT NULL,
      estimated_yen REAL NOT NULL
    );
  `);
}

export function now(): string {
  return new Date().toISOString();
}

// ===== Receipts =====
export function insertReceipt(r: Omit<Receipt, 'id'>): Receipt {
  const d = initDb();
  const stmt = d.prepare(`
    INSERT INTO receipts (source_path, thumbnail_path, ocr_raw, vendor, issued_on, amount, tax_amount,
      payment_method, account_category, project_id, memo, status, confidence, error, created_at, updated_at)
    VALUES (@source_path, @thumbnail_path, @ocr_raw, @vendor, @issued_on, @amount, @tax_amount,
      @payment_method, @account_category, @project_id, @memo, @status, @confidence, @error, @created_at, @updated_at)
  `);
  const info = stmt.run(r as unknown as Record<string, unknown>);
  return getReceipt(Number(info.lastInsertRowid))!;
}

export function getReceipt(id: number): Receipt | null {
  const d = initDb();
  return (d.prepare('SELECT * FROM receipts WHERE id = ?').get(id) as Receipt | undefined) ?? null;
}

export function updateReceipt(id: number, patch: Partial<Receipt>): Receipt {
  const d = initDb();
  const cur = getReceipt(id);
  if (!cur) throw new Error('Receipt not found');
  const next: Receipt = { ...cur, ...patch, id, updated_at: now() };
  d.prepare(`
    UPDATE receipts SET source_path=@source_path, thumbnail_path=@thumbnail_path, ocr_raw=@ocr_raw,
      vendor=@vendor, issued_on=@issued_on, amount=@amount, tax_amount=@tax_amount,
      payment_method=@payment_method, account_category=@account_category, project_id=@project_id,
      memo=@memo, status=@status, confidence=@confidence, error=@error, updated_at=@updated_at
    WHERE id=@id
  `).run(next as unknown as Record<string, unknown>);
  return next;
}

export function deleteReceipt(id: number): void {
  initDb().prepare('DELETE FROM receipts WHERE id = ?').run(id);
}

export interface ListFilter {
  fromDate?: string;
  toDate?: string;
  status?: Receipt['status'] | 'all';
  projectId?: number | null;
  category?: string | null;
  search?: string;
}

export function listReceipts(f: ListFilter = {}): Receipt[] {
  const d = initDb();
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (f.fromDate) { where.push('(issued_on IS NULL OR issued_on >= @fromDate)'); params.fromDate = f.fromDate; }
  if (f.toDate)   { where.push('(issued_on IS NULL OR issued_on <= @toDate)');   params.toDate = f.toDate; }
  if (f.status && f.status !== 'all') { where.push('status = @status'); params.status = f.status; }
  if (f.projectId !== undefined && f.projectId !== null) { where.push('project_id = @projectId'); params.projectId = f.projectId; }
  if (f.category) { where.push('account_category = @category'); params.category = f.category; }
  if (f.search)   { where.push('(vendor LIKE @q OR memo LIKE @q)'); params.q = `%${f.search}%`; }
  const sql = `SELECT * FROM receipts ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(issued_on, created_at) DESC, id DESC`;
  return d.prepare(sql).all(params) as Receipt[];
}

// ===== Projects =====
export function listProjects(): Project[] {
  return initDb().prepare('SELECT * FROM projects ORDER BY name').all() as Project[];
}

export function upsertProject(p: Omit<Project, 'id'> & { id?: number }): Project {
  const d = initDb();
  if (p.id) {
    d.prepare('UPDATE projects SET name=@name, start_on=@start_on, end_on=@end_on, color=@color WHERE id=@id')
      .run(p as unknown as Record<string, unknown>);
    return d.prepare('SELECT * FROM projects WHERE id=?').get(p.id) as Project;
  }
  const info = d.prepare('INSERT INTO projects (name, start_on, end_on, color) VALUES (?, ?, ?, ?)')
    .run(p.name, p.start_on, p.end_on, p.color);
  return d.prepare('SELECT * FROM projects WHERE id=?').get(Number(info.lastInsertRowid)) as Project;
}

export function deleteProject(id: number): void {
  initDb().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ===== Rules =====
export function listRules(): Rule[] {
  return initDb().prepare('SELECT * FROM rules ORDER BY priority ASC, id ASC').all() as Rule[];
}

export function upsertRule(r: Omit<Rule, 'id'> & { id?: number }): Rule {
  const d = initDb();
  if (r.id) {
    d.prepare('UPDATE rules SET keyword=@keyword, account_category=@account_category, payment_method=@payment_method, priority=@priority WHERE id=@id')
      .run(r as unknown as Record<string, unknown>);
    return d.prepare('SELECT * FROM rules WHERE id=?').get(r.id) as Rule;
  }
  const info = d.prepare('INSERT INTO rules (keyword, account_category, payment_method, priority) VALUES (?, ?, ?, ?)')
    .run(r.keyword, r.account_category, r.payment_method, r.priority);
  return d.prepare('SELECT * FROM rules WHERE id=?').get(Number(info.lastInsertRowid)) as Rule;
}

export function deleteRule(id: number): void {
  initDb().prepare('DELETE FROM rules WHERE id = ?').run(id);
}

// ===== Settings =====
export function getSetting(key: string): string | null {
  const row = initDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null): void {
  const d = initDb();
  if (value === null) d.prepare('DELETE FROM settings WHERE key = ?').run(key);
  else d.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

// ===== API usage =====
export function recordUsage(model: string, inputTokens: number, outputTokens: number, estimatedYen: number): void {
  initDb().prepare('INSERT INTO api_usage (occurred_at, model, input_tokens, output_tokens, estimated_yen) VALUES (?, ?, ?, ?, ?)')
    .run(now(), model, inputTokens, outputTokens, estimatedYen);
}

export function sumUsageForMonth(year: number, month: number): { count: number; totalYen: number } {
  const start = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const next = month === 12 ? `${year + 1}-01-01T00:00:00.000Z` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00.000Z`;
  const row = initDb().prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(estimated_yen), 0) AS yen FROM api_usage WHERE occurred_at >= ? AND occurred_at < ?')
    .get(start, next) as { cnt: number; yen: number };
  return { count: row.cnt, totalYen: row.yen };
}
