import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';

// 招待制：公開サインアップ UI は出さない。アカウントは所有者が Supabase で発行する。
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError('メールアドレスまたはパスワードが正しくありません。');
    // 成功時は onAuthStateChange が拾って画面が切り替わる
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0e2318] px-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand-400 flex items-center justify-center shadow-lg mb-4">
            <Sparkles size={24} className="text-[#0e2318]" />
          </div>
          <h1 className="text-xl font-bold text-emerald-50" style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}>
            アリサ
          </h1>
          <p className="text-[13px] text-emerald-100/50 mt-1">領収書仕分けAI</p>
        </div>

        <form onSubmit={signIn} className="bg-[#13301f] rounded-2xl p-6 space-y-4 ring-1 ring-emerald-900/40">
          <div>
            <Label htmlFor="email" className="text-xs text-emerald-100/70 mb-1.5 block">メールアドレス</Label>
            <Input id="email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} required
              className="h-10 bg-[#0e2318] border-emerald-900/60 text-emerald-50 placeholder:text-emerald-100/30" />
          </div>
          <div>
            <Label htmlFor="password" className="text-xs text-emerald-100/70 mb-1.5 block">パスワード</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} required
              className="h-10 bg-[#0e2318] border-emerald-900/60 text-emerald-50" />
          </div>
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-300">
              <AlertCircle size={12} className="shrink-0" />{error}
            </p>
          )}
          <Button type="submit" disabled={busy}
            className="w-full h-10 bg-brand-500 hover:bg-brand-600 text-white font-semibold gap-2">
            {busy ? <><Loader2 size={15} className="animate-spin" />サインイン中…</> : 'サインイン'}
          </Button>
        </form>

        <p className="text-center text-[11px] text-emerald-100/30 mt-5 leading-relaxed">
          アカウントは招待制です。<br />ログインできない場合は管理者にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
