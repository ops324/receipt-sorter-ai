import { app, BrowserWindow, ipcMain, dialog, shell, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { initDb, listReceipts as dbListReceipts, updateReceipt as dbUpdateReceipt, deleteReceipt as dbDeleteReceipt,
  listProjects as dbListProjects, upsertProject as dbUpsertProject, deleteProject as dbDeleteProject,
  listRules as dbListRules, upsertRule as dbUpsertRule, deleteRule as dbDeleteRule,
  sumUsageForMonth, getReceipt } from './services/db';
import { saveApiKey, hasApiKey } from './services/keychain';
import { getAppSettings, updateAppSettings } from './services/settings';
import { processImports, retryOcr } from './services/ocr-pipeline';
import { perReceiptYen } from './services/anthropic';
import { exportCsv } from './services/exporters/csv';
import { exportExcel } from './services/exporters/excel';
import { exportPdfReport } from './services/exporters/pdf-report';
import { exportToFolders } from './services/exporters/folder';
import type { ImportItem } from '../shared/ipc';
import type { ExportOptions, Receipt } from '../shared/types';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

if (started) app.quit();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'アリサ',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // 新規ウィンドウ生成は一切許可しない（外部サイトのポップアップ等を遮断）
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // アプリ自身のオリジン以外への画面遷移を遮断（フィッシング遷移などを防止）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() ?? '';
    try {
      if (new URL(url).origin !== new URL(current).origin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
}

/** 本番ビルドでは厳格な CSP をレスポンスヘッダで強制する（開発時は Vite のため緩める）。 */
function applyContentSecurityPolicy() {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) return; // dev: index.html の meta CSP に委ねる
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: file:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.anthropic.com",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, cb) => {
    cb({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [csp] } });
  });
}

app.whenReady().then(() => {
  initDb();
  applyContentSecurityPolicy();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function emitReceiptChanged(r: Receipt) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('receipt:changed', r);
  }
}

/** IPC 越しに渡る ID は信頼せず整数であることを検証する（多層防御）。 */
function reqId(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error('不正なIDです');
  return v;
}

function reqString(v: unknown): string {
  if (typeof v !== 'string') throw new Error('不正な引数です');
  return v;
}

function registerIpc() {
  ipcMain.handle('receipts:import', async (_e, items: ImportItem[]) => {
    return processImports(items, {
      onReceiptChanged: emitReceiptChanged,
      onProgress: (done, total) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('receipts:import-progress', { done, total });
        }
      },
    });
  });
  ipcMain.handle('receipts:retry', async (_e, id: number) => {
    return retryOcr(reqId(id), { onReceiptChanged: emitReceiptChanged });
  });
  ipcMain.handle('receipts:list', async (_e, filter) => dbListReceipts(filter ?? {}));
  ipcMain.handle('receipts:update', async (_e, id: number, patch) => {
    const updated = dbUpdateReceipt(reqId(id), patch);
    emitReceiptChanged(updated);
    return updated;
  });
  ipcMain.handle('receipts:delete', async (_e, id: number) => {
    const r = getReceipt(reqId(id));
    dbDeleteReceipt(reqId(id));
    // 原本/サムネのファイルも削除
    if (r?.source_path && fs.existsSync(r.source_path)) try { fs.unlinkSync(r.source_path); } catch { /* ignore */ }
    if (r?.thumbnail_path && fs.existsSync(r.thumbnail_path)) try { fs.unlinkSync(r.thumbnail_path); } catch { /* ignore */ }
  });
  ipcMain.handle('receipts:original', async (_e, id: number) => {
    const r = getReceipt(reqId(id));
    if (!r) return null;
    const filePath = r.thumbnail_path && fs.existsSync(r.thumbnail_path) ? r.thumbnail_path : r.source_path;
    if (!filePath || !fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.pdf' ? 'application/pdf' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    return { dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime };
  });

  ipcMain.handle('projects:list', () => dbListProjects());
  ipcMain.handle('projects:upsert', (_e, p) => dbUpsertProject(p));
  ipcMain.handle('projects:delete', (_e, id: number) => { dbDeleteProject(reqId(id)); });

  ipcMain.handle('rules:list', () => dbListRules());
  ipcMain.handle('rules:upsert', (_e, r) => dbUpsertRule(r));
  ipcMain.handle('rules:delete', (_e, id: number) => { dbDeleteRule(reqId(id)); });

  ipcMain.handle('settings:get', () => getAppSettings());
  ipcMain.handle('settings:setApiKey', (_e, key: string | null) => { saveApiKey(key); });
  ipcMain.handle('settings:update', (_e, patch) => { updateAppSettings(patch); });

  ipcMain.handle('cost:estimate', (_e, year: number, month: number) => {
    const settings = getAppSettings();
    const usage = sumUsageForMonth(year, month);
    return {
      receiptCount: usage.count,
      totalYen: usage.totalYen,
      perReceiptYen: perReceiptYen(settings.model),
      model: settings.model,
      monthStart: `${year}-${String(month).padStart(2, '0')}-01`,
    };
  });

  ipcMain.handle('os:reveal', async (_e, p: string) => { shell.showItemInFolder(reqString(p)); });

  ipcMain.handle('export:chooseDestination', async (_e, kind: 'file' | 'folder', suggested?: string) => {
    if (!mainWindow) return null;
    if (kind === 'folder') {
      const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
      return r.canceled ? null : r.filePaths[0];
    }
    const r = await dialog.showSaveDialog(mainWindow, { defaultPath: suggested });
    return r.canceled ? null : r.filePath ?? null;
  });

  ipcMain.handle('export:run', async (_e, opts: ExportOptions) => {
    const receipts = dbListReceipts({ fromDate: opts.fromDate, toDate: opts.toDate, projectId: opts.projectId ?? undefined });
    const projects = dbListProjects();
    let count = 0;
    if (opts.format === 'csv') count = exportCsv(opts.outputPath, receipts, projects, opts.csvDialect ?? 'generic');
    else if (opts.format === 'excel') count = await exportExcel(opts.outputPath, receipts, projects);
    else if (opts.format === 'pdf')   count = await exportPdfReport(opts.outputPath, receipts, projects, `${opts.fromDate} 〜 ${opts.toDate}`);
    else if (opts.format === 'folder') count = exportToFolders(opts.outputPath, receipts, projects);
    return { outputPath: opts.outputPath, count };
  });
}
