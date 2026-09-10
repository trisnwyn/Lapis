import { useEffect, type ReactNode } from 'react';
import { XIcon } from '../icons';
import { s } from '../../strings';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  width?: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, title, width = 'max-w-md', children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${width} rounded-2xl border border-line bg-card p-6 shadow-xl`}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-soft transition-colors hover:bg-paper hover:text-ink"
            aria-label={s.nav.close}
          >
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
