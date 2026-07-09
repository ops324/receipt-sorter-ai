import { useEffect, useRef, useState } from 'react';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { isGateEnabled, isUnlocked, markUnlocked, verifyCode, canVerify } from '@/lib/access-gate';
import logo from '../assets/logo.png';

/**
 * 合言葉ゲート。ゲートが有効（合言葉ハッシュが設定済み）で、かつこの端末が未解錠の
 * ときだけ合言葉入力画面を出し、<App/> 自体をアンマウント状態に保つ。ゲートが
 * 無効（未設定）なら素通りする。純クライアント側・サーバー非依存。
 *
 * ※ 部外者の締め出しは casual deterrent。静的公開アプリのため技術者は回避し得る。
 */
export function AccessGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(() => !isGateEnabled() || isUnlocked());
  if (ok) return <>{children}</>;
  return <Gate onUnlock={() => setOk(true)} />;
}

function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const usable = canVerify();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    const pass = await verifyCode(code);
    setBusy(false);
    if (pass) {
      markUnlocked();
      onUnlock();
    } else {
      setError('合言葉が正しくありません');
      setCode('');
      inputRef.current?.focus();
    }
  }

  return (
    <div className="min-h-screen bg-[#0e2318] flex items-center justify-center p-6 select-none">
      <div className="w-full max-w-sm">
        {/* ロゴ + タイトル */}
        <div className="flex flex-col items-center mb-8">
          <img
            src={logo}
            alt="アリサ"
            className="w-14 h-14 rounded-[16px] object-cover ring-1 ring-white/10 shadow-lg mb-4"
          />
          <h1
            className="text-xl font-bold tracking-wide text-emerald-50"
            style={{ fontFamily: '"Hiragino Mincho ProN", "Yu Mincho", serif' }}
          >
            アリサ
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-[13px] text-emerald-100/45">
            <Lock size={12} className="text-brand-400" />
            合言葉を入力してください
          </p>
        </div>

        {/* 合言葉入力カード */}
        <form onSubmit={submit} className="bg-[#122b1e] border border-emerald-900/50 rounded-2xl shadow-2xl p-6">
          <label className="text-xs font-medium text-emerald-100/60 mb-1.5 block">合言葉</label>
          <div className="relative">
            <Input
              ref={inputRef}
              type={show ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="••••••••"
              disabled={!usable}
              className="h-11 text-base bg-[#0e2318] border-emerald-900/60 text-emerald-50 pr-10"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-100/40 hover:text-emerald-100/80 transition-colors"
              aria-label={show ? '合言葉を隠す' : '合言葉を表示'}
            >
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>

          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
          {!usable && (
            <p className="mt-2 text-xs text-amber-400">
              安全な接続（https）でのみ合言葉を確認できます。
            </p>
          )}

          <Button
            type="submit"
            disabled={busy || !usable || code.trim().length === 0}
            className="mt-4 w-full h-11 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold gap-1.5"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            開く
          </Button>
        </form>

        <p className="mt-5 px-2 text-center text-[10px] leading-relaxed text-emerald-100/25">
          合言葉が分からない場合は提供者にお問い合わせください。
        </p>
      </div>
    </div>
  );
}
