import { useEffect, useState } from 'react';
import { useApp } from './stores/app-store';
import { Inbox } from './pages/Inbox';
import { ReceiptList } from './pages/ReceiptList';
import { Summary } from './pages/Summary';
import { Projects } from './pages/Projects';
import { Rules } from './pages/Rules';
import { Export } from './pages/Export';
import { Settings } from './pages/Settings';
import { Toasts } from './components/Toasts';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import logo from './assets/logo.png';
import {
  Inbox as InboxIcon,
  Receipt,
  Calculator,
  Clapperboard,
  Zap,
  ArrowUpFromLine,
  KeyRound,
  Sparkles,
} from 'lucide-react';

type Page = 'inbox' | 'list' | 'summary' | 'projects' | 'rules' | 'export' | 'settings';

const NAV_MAIN: { id: Page; label: string; Icon: React.ElementType }[] = [
  { id: 'inbox',    label: 'インボックス',   Icon: InboxIcon },
  { id: 'list',     label: '領収書一覧',     Icon: Receipt },
  { id: 'summary',  label: '集計',           Icon: Calculator },
  { id: 'projects', label: '案件',           Icon: Clapperboard },
  { id: 'rules',    label: '自動分類ルール', Icon: Zap },
];

const NAV_FOOTER: { id: Page; label: string; Icon: React.ElementType }[] = [
  { id: 'export',   label: 'エクスポート',   Icon: ArrowUpFromLine },
  { id: 'settings', label: '設定',           Icon: KeyRound },
];

export default function App() {
  const [page, setPage] = useState<Page>('inbox');
  const load = useApp((s) => s.load);
  const settings = useApp((s) => s.settings);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex h-full bg-[#fffdf5] text-stone-900 font-sans">
      {/* サイドバー：木行（深翡翠緑 #0e2318）— 仕様書 §2.1 */}
      <aside className="w-56 shrink-0 bg-[#0e2318] flex flex-col select-none">
        {/* Logo */}
        <div className="px-5 pt-8 pb-6">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <img
                src={logo}
                alt="アリサ"
                className="w-10 h-10 rounded-[14px] object-cover ring-1 ring-white/10 shadow-lg"
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-brand-400 rounded-full border-2 border-[#0e2318] flex items-center justify-center">
                <Sparkles size={6} className="text-[#0e2318]" />
              </div>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-emerald-100/80 leading-tight tracking-wide">
                領収書仕分けAI
              </div>
            </div>
          </div>
        </div>

        <Separator className="bg-emerald-900/40 mx-3" />

        {/* Main nav */}
        <nav className="flex-1 px-2.5 pt-3 space-y-0.5">
          {NAV_MAIN.map(({ id, label, Icon }) => (
            <NavItem key={id} id={id} label={label} Icon={Icon} active={page === id} onClick={() => setPage(id)} />
          ))}
        </nav>

        {/* Footer nav */}
        <div className="px-2.5 pb-2 space-y-0.5">
          <Separator className="bg-emerald-900/40 mx-1 mb-2" />
          {NAV_FOOTER.map(({ id, label, Icon }) => (
            <NavItem key={id} id={id} label={label} Icon={Icon} active={page === id} onClick={() => setPage(id)} />
          ))}
        </div>

        {/* モデル表示 */}
        <div className="px-4 py-3.5 border-t border-emerald-900/30 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full shrink-0 bg-brand-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
          <span className="text-[11px] text-emerald-100/35 truncate font-medium tracking-wide">
            {settings ? settings.model.replace('claude-', '').replace(/-\d{8}$/, '') : '…'}
          </span>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {page === 'inbox'    && <Inbox onNavigate={setPage} />}
        {page === 'list'     && <ReceiptList />}
        {page === 'summary'  && <Summary />}
        {page === 'projects' && <Projects />}
        {page === 'rules'    && <Rules />}
        {page === 'export'   && <Export />}
        {page === 'settings' && <Settings />}
      </main>

      <Toasts />
    </div>
  );
}

function NavItem({
  label, Icon, active, onClick,
}: {
  id: Page; label: string; Icon: React.ElementType; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150 relative',
        active
          ? 'bg-brand-600/20 text-brand-300'
          : 'text-emerald-100/45 hover:text-emerald-100/80 hover:bg-white/5'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-brand-400 rounded-r-full" />
      )}
      <Icon size={14} className="shrink-0" />
      <span>{label}</span>
    </button>
  );
}
