import { useApp } from '../stores/app-store';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Toasts() {
  const { toasts, dismissToast } = useApp();

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const config = {
          success: {
            icon: <CheckCircle2 size={14} className="text-sage-500 shrink-0 mt-0.5" />,
            accent: 'border-l-sage-400',
          },
          error: {
            icon: <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />,
            accent: 'border-l-red-500',
          },
          info: {
            icon: <Info size={14} className="text-brand-500 shrink-0 mt-0.5" />,
            accent: 'border-l-brand-500',
          },
        }[t.kind];

        return (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            role="status"
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 pl-3 pr-3 py-3 rounded-xl shadow-lg',
              'text-sm text-foreground max-w-sm cursor-pointer animate-fade-up',
              'bg-card border border-border border-l-2 shadow-card-hover',
              config.accent
            )}
          >
            {config.icon}
            <span className="flex-1 leading-snug text-[13px]">{t.message}</span>
            <button
              onClick={(e) => { e.stopPropagation(); dismissToast(t.id); }}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="閉じる"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
