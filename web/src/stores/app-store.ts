import { create } from 'zustand';
import type { AppSettings, Project, Receipt, Rule } from '@shared/types';

interface Toast { id: number; kind: 'info' | 'error' | 'success'; message: string; }

interface AppState {
  settings: Omit<AppSettings, 'apiKey'> | null;
  receipts: Receipt[];
  projects: Project[];
  rules: Rule[];
  toasts: Toast[];
  load: () => Promise<void>;
  refreshReceipts: () => Promise<void>;
  upsertReceiptLocal: (r: Receipt) => void;
  removeReceiptLocal: (id: number) => void;
  refreshProjects: () => Promise<void>;
  refreshRules: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const useApp = create<AppState>((set, get) => ({
  settings: null,
  receipts: [],
  projects: [],
  rules: [],
  toasts: [],

  async load() {
    await Promise.all([get().refreshReceipts(), get().refreshProjects(), get().refreshRules(), get().refreshSettings()]);
    window.api.onReceiptChanged((r) => get().upsertReceiptLocal(r));
  },
  async refreshReceipts() {
    const list = await window.api.listReceipts();
    set({ receipts: list });
  },
  upsertReceiptLocal(r) {
    set((s) => {
      const idx = s.receipts.findIndex((x) => x.id === r.id);
      if (idx < 0) return { receipts: [r, ...s.receipts] };
      const next = s.receipts.slice();
      next[idx] = r;
      return { receipts: next };
    });
  },
  removeReceiptLocal(id) {
    set((s) => ({ receipts: s.receipts.filter((r) => r.id !== id) }));
  },
  async refreshProjects() { set({ projects: await window.api.listProjects() }); },
  async refreshRules() { set({ rules: await window.api.listRules() }); },
  async refreshSettings() { set({ settings: await window.api.getSettings() }); },

  pushToast(t) {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, ...t }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));
