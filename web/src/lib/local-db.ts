// ───────────────────────────────────────────────────────────
// 都度処理（transient）版のローカルデータ層。
// Supabase(DB/Storage/Auth) の代替として、この端末の IndexedDB に
// receipts / projects / rules / images / usage / meta(設定・採番) を保持する。
// ログイン不要・端末内完結。ブラウザ保存なので「作業中に閉じても消えない」保険になる
// （履歴は不要な運用だが、書き出し前の消失を防ぐ）。
// ───────────────────────────────────────────────────────────

const DB_NAME = 'arisa';
const DB_VERSION = 1;
const STORES = ['receipts', 'projects', 'rules', 'images', 'usage', 'meta'] as const;
type StoreName = (typeof STORES)[number];

// 数値IDを採番する対象ストア（meta以外＝keyPath 'id'）。
type SeqEntity = 'receipts' | 'projects' | 'rules' | 'usage';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          db.createObjectStore(s, { keyPath: s === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function request<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

export function getAll<T>(store: StoreName): Promise<T[]> {
  return request<T[]>(store, 'readonly', (s) => s.getAll());
}

export function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return request<T | undefined>(store, 'readonly', (s) => s.get(key));
}

export function put<T>(store: StoreName, value: T): Promise<void> {
  return request<IDBValidKey>(store, 'readwrite', (s) => s.put(value)).then(() => undefined);
}

export function del(store: StoreName, key: IDBValidKey): Promise<void> {
  return request<undefined>(store, 'readwrite', (s) => s.delete(key)).then(() => undefined);
}

/**
 * 数値IDを採番する。get→put を単一の readwrite トランザクションで行うため、
 * 同一ストアへの並行呼び出しは IndexedDB により直列化され、重複IDが出ない
 * （取込は並列度3で走るのでこの原子性が必要）。
 */
export function nextId(entity: SeqEntity): Promise<number> {
  const key = `seq_${entity}`;
  return openDb().then((db) => new Promise<number>((resolve, reject) => {
    const t = db.transaction('meta', 'readwrite');
    const store = t.objectStore('meta');
    let value = 1;
    const getReq = store.get(key);
    getReq.onsuccess = () => {
      value = ((getReq.result?.value as number) ?? 0) + 1;
      store.put({ key, value });
    };
    t.oncomplete = () => resolve(value);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('採番に失敗しました'));
  }));
}
