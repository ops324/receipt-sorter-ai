import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // 開発時の取り違え防止。.env(.local) に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY を設定する。
  // eslint-disable-next-line no-console
  console.error('[arisa-web] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定です。.env を確認してください。');
}

export const supabase = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Storage バケット名（schema.sql と一致させる）。 */
export const RECEIPTS_BUCKET = 'receipts';
