import { useCallback, useEffect, useState } from 'react';
import { weekStartOf, type SessionDraft } from '@lapis/lms-vcbi';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { requestLmsSessions } from '../../lib/lmsSync';
import { formatShortDate } from '../../lib/dates';
import { s } from '../../strings';

interface ImportScheduleDialogProps {
  open: boolean;
  onClose: () => void;
}

type Phase = 'input' | 'preview' | 'done' | 'error';

type ParsedDraft = Pick<
  SessionDraft,
  'courseName' | 'title' | 'start' | 'end' | 'rooms' | 'weekStart'
>;

/**
 * Wizard nhập lịch Dashboard — đúng 2 đường:
 *   1) Đồng bộ trực tiếp qua browser extension Lapis (phương thức chính)
 *   2) Dán JSON (sao chép từ cửa sổ nhỏ của extension)
 */
export function ImportScheduleDialog({ open, onClose }: ImportScheduleDialogProps) {
  const [phase, setPhase] = useState<Phase>('input');
  const [syncingExtension, setSyncingExtension] = useState(false);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<SessionDraft[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);

  const reset = useCallback(() => {
    setPhase('input');
    setSyncingExtension(false);
    setText('');
    setDrafts([]);
    setErrorText(null);
    setImported(null);
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  useEffect(() => {
    if (phase !== 'done') return;
    const timer = window.setTimeout(onClose, 1400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const syncFromExtension = async () => {
    setSyncingExtension(true);
    setErrorText(null);
    try {
      const response = await requestLmsSessions();
      if (!response.ok) {
        setErrorText(s.dashboard.syncFail);
        return;
      }
      if (response.drafts.length === 0) {
        setErrorText(s.dashboard.syncEmpty);
        return;
      }
      setDrafts(response.drafts);
      setPhase('preview');
    } finally {
      setSyncingExtension(false);
    }
  };

  const parseJson = () => {
    setErrorText(null);
    let parsed:unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setErrorText(s.importLms.invalidJson);
      return;
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : ((parsed as { sessions?: unknown[] } | null)?.sessions ?? []);
    if (!Array.isArray(candidates)) {
      setErrorText(s.importLms.invalidJson);
      return;
    }
    const collected: SessionDraft[] = [];
    for (const raw of candidates) {
      if (typeof raw !== 'object' || raw === null) continue;
      const rec = raw as Partial<SessionDraft>;
      if (
        typeof rec.courseName !== 'string' ||
        typeof rec.start !== 'number' ||
        typeof rec.end !== 'number' ||
        rec.end <= rec.start
      ) {
        continue;
      }
      const start = rec.start;
      const end = rec.end;
      collected.push({
        courseName: rec.courseName,
        title: typeof rec.title === 'string' ? rec.title : 'Buổi học',
        start,
        end,
        rooms: typeof rec.rooms === 'string' ? rec.rooms : undefined,
        weekStart: typeof rec.weekStart === 'number' ? rec.weekStart : weekStartOf(start),
      });
    }
    if (collected.length === 0) {
      setErrorText(s.importLms.invalidJson);
      return;
    }
    collected.sort((a, b) => a.start - b.start);
    setDrafts(collected);
    setPhase('preview');
  };

  const doImport = async () => {
    const { importLmsSessions } = await import('../../lib/lmsSync');
    setPhase('done');
    const result = await importLmsSessions(drafts);
    setImported(
      `${result.imported} ${s.dashboard.syncImported}${result.newCourses > 0 ? ` · ${result.newCourses} ${s.dashboard.syncNew}` : ''}`,
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title={s.importLms.title} width="max-w-lg">
      {phase === 'input' ? (
        <div className="space-y-4">
          <div>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={s.importLms.pasteLabel}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={parseJson} disabled={!text.trim()}>
                {s.importLms.parse}
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>
              {s.common.cancel}
            </Button>
            <Button onClick={() => void syncFromExtension()} disabled={syncingExtension}>
              {syncingExtension ? s.importLms.syncing : s.importLms.extensionTrigger}
            </Button>
          </div>
          {errorText ? (
            <p className="text-xs font-medium text-red-600">{errorText}</p>
          ) : null}
        </div>
      ) : null}

      {phase === 'preview' ? (
        <div className="space-y-4">
          <p className="text-sm text-ink">
            Phát hiện <span className="font-semibold">{drafts.length}</span>{' '}
            {s.dashboard.syncImported}
          </p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper p-3">
            {drafts.slice(0, 40).map((draft) => (
              <div key={`${draft.start}-${draft.courseName}`} className="flex items-center gap-2 text-xs">
                <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent">
                  {formatShortDate(draft.start)}
                </span>
                <span className="font-medium text-ink">{draft.courseName}</span>
                {draft.rooms ? <span className="text-ink-soft">{draft.rooms}</span> : null}
                <span className="ml-auto text-ink-soft">{draft.title}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => setPhase('input')}>
              {s.common.cancel}
            </Button>
            <Button onClick={doImport}>{s.importLms.importButton}</Button>
          </div>
        </div>
      ) : null}

      {phase === 'done' ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="font-display text-2xl font-semibold text-emerald-600">{s.importLms.done}</p>
          {imported ? <p className="text-sm text-ink-soft">{imported}</p> : null}
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="py-6 text-center">
          <p className="text-sm text-red-600">{errorText}</p>
          <Button variant="secondary" className="mt-4" onClick={() => setPhase('input')}>
            {s.common.cancel}
          </Button>
        </div>
      ) : null}
    </Dialog>
  );
}
