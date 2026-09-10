import { useState } from 'react';
import { GearIcon } from './components/icons';
import { SettingsModal } from './components/SettingsModal';
import { Dashboard } from './pages/Dashboard';
import { CoursePage } from './pages/CoursePage';
import { useRoute } from './router';
import { useSettings } from './hooks/useSettings';
import { s } from './strings';

export function App() {
  const route = useRoute();
  const { settings, save } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent font-display text-base italic font-semibold text-white">
              L
            </div>
            <span className="font-display text-lg font-semibold tracking-tight">
              {s.app.name}
            </span>
            <span className="hidden text-xs text-ink-soft sm:inline">— {s.app.tagline}</span>
          </div>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="relative rounded-lg p-2 text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent"
            aria-label={s.nav.settings}
            title={s.nav.settings}
          >
            <GearIcon width={18} height={18} />
            {settings && !settings.openrouterKey ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-500" />
            ) : null}
          </button>
        </div>
      </header>

      <main>
        {route.name === 'dashboard' ? (
          <Dashboard settings={settings} onOpenSettings={() => setSettingsOpen(true)} />
        ) : (
          <CoursePage id={route.id} onOpenSettings={() => setSettingsOpen(true)} />
        )}
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={save}
      />
    </div>
  );
}
