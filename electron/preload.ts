import { contextBridge, ipcRenderer } from 'electron';
import type { AppApi, ImportItem, ImportProgress, ReceiptFilter } from '../shared/ipc';
import type { ExportOptions, Receipt } from '../shared/types';

const api: AppApi = {
  importItems: (items: ImportItem[]) => ipcRenderer.invoke('receipts:import', items),
  listReceipts: (filter?: ReceiptFilter) => ipcRenderer.invoke('receipts:list', filter),
  updateReceipt: (id, patch) => ipcRenderer.invoke('receipts:update', id, patch),
  deleteReceipt: (id) => ipcRenderer.invoke('receipts:delete', id),
  getReceiptOriginal: (id) => ipcRenderer.invoke('receipts:original', id),
  retryOcr: (id) => ipcRenderer.invoke('receipts:retry', id),

  listProjects: () => ipcRenderer.invoke('projects:list'),
  upsertProject: (p) => ipcRenderer.invoke('projects:upsert', p),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),

  listRules: () => ipcRenderer.invoke('rules:list'),
  upsertRule: (r) => ipcRenderer.invoke('rules:upsert', r),
  deleteRule: (id) => ipcRenderer.invoke('rules:delete', id),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  setApiKey: (key) => ipcRenderer.invoke('settings:setApiKey', key),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),

  estimateMonthlyCost: (year, month) => ipcRenderer.invoke('cost:estimate', year, month),

  chooseSaveDestination: (kind, suggested) => ipcRenderer.invoke('export:chooseDestination', kind, suggested),
  exportData: (opts: ExportOptions) => ipcRenderer.invoke('export:run', opts),

  revealInFinder: (path) => ipcRenderer.invoke('os:reveal', path),

  onReceiptChanged: (cb: (r: Receipt) => void) => {
    const handler = (_e: unknown, r: Receipt) => cb(r);
    ipcRenderer.on('receipt:changed', handler);
    return () => ipcRenderer.removeListener('receipt:changed', handler);
  },
  onImportProgress: (cb: (p: ImportProgress) => void) => {
    const handler = (_e: unknown, p: ImportProgress) => cb(p);
    ipcRenderer.on('receipts:import-progress', handler);
    return () => ipcRenderer.removeListener('receipts:import-progress', handler);
  },
};

contextBridge.exposeInMainWorld('api', api);
