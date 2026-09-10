import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeChat,
  getSettings,
  type ContentPart,
} from '@lapis/core';
import {
  dayIndexFromName,
  parseScheduleText,
  weekStartOf,
  type SessionDraft,
} from '@lapis/lms-vcbi';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { AlertIcon, FileIcon, RefreshIcon } from '../icons';
import { importLmsSessions, requestLmsSessions } from '../../lib/lmsSync';
import { s } from '../../strings';

interface ImportScheduleDialogProps {
  open: boolean;
  onClose: () => void;
}

type Mode = 'image' | 'text';
type Phase = 'input' | 'analyzing' | 'preview' | 'done' | 'error';

const EXTRACT_PROMPT =
  'Bạn là trợ lý đọc ảnh lịch học. Trích xuất DUY NHẤT một JSON object (không markdown, không giải thích):\n' +
  '{"weekStart": "YYYY-MM-DD" (ngày THỨ HAI đầu tuần, tìm trong banner dạng "Sep 7 — Sep 13, 2026"; null nếu không thấy), ' +
  '"sessions": [{"courseName": "tên lớp/khóa học", "title": "Session 9 hoặc tên buổi", ' +
  '"day": "MON|TUE|WED|THU|FRI|SAT|SUN", "startTime": "HH:MM", "endTime": "HH:MM", ' +
  '"rooms": "phòng học hoặc chuỗi rỗng"}]}\n' +
  'Bao gồm MỌI card/buổi có giờ bắt đầu. Nếu thiếu endTime, bỏ trống. Chỉ trả JSON thuần.';

const TEXT_EXTRACT_PROMPT =
  'Từ nội dung lịch học (copy từ web), trích xuất DUY NHẤT JSON (không markdown):\n' +
  '{"weekStart": "YYYY-MM-DD" (thứ hai đầu tuần) hoặc null, ' +
  '"sessions": [{"courseName": "...", "title": "...", "day": "MON|TUE|WED|THU|FRI|SAT|SUN", ' +
  '"startTime": "HH:MM", "endTime": "HH:MM", "rooms": ""}]}\n' +
  'Chỉ thêm ngày khi văn bản cho phép xác định; không suy đoán. Chỉ trả JSON thuần.';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "T2 06:45–09:10" — T2..T7 cho Mon..Sat, CN cho Sunday */
function sessionTimeLabel(start: number, end: number): string {
  const ds = new Date(start);
  const dow = ds.getDay();
  const day = dow === 0 ? 'CN' : `T${dow + 1}`;
  const de = new Date(end);
  return `${day} ${pad2(ds.getHours())}:${pad2(ds.getMinutes())}–${pad2(de.getHours())}:${pad2(de.getMinutes())}`;
}

/** Thu nhỏ ảnh, cạnh dài tối đa 1600 px, JPEG quality 0.85 → data URL */
function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const longest = Math.max(img.width, img.height);
      const scale = Math.min(1, 1600 / longest);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

interface ParsedExtract {
  weekStart?: string | null;
  sessions?: Array<{
    courseName?: string;
    title?: string;
    day?: string;
    startTime?: string;
    endTime?: string;
    rooms?: string;
  }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})/;
const DAY_MS = 86_400_000;

function draftsFromJson(raw: string, fallbackWeekStart?: number | null): SessionDraft[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  let parsed: ParsedExtract;
  try {
    parsed = JSON.parse(jsonMatch[0]) as ParsedExtract;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.sessions)) return [];

  let weekStartBase: number;
  if (parsed.weekStart && DATE_RE.test(parsed.weekStart)) {
    const d = new Date(parsed.weekStart + 'T00:00:00');
    weekStartBase = isNaN(d.getTime())
      ? (fallbackWeekStart ?? weekStartOf(Date.now()))
      : d.getTime();
  } else {
    weekStartBase = fallbackWeekStart ?? weekStartOf(Date.now());
  }

  const results: SessionDraft[] = [];
  for (const ses of parsed.sessions) {
    if (!ses.day || !ses.startTime || !ses.courseName) continue;
    const dayIndex = dayIndexFromName(ses.day);
    if (dayIndex === null) continue;

    const sm = ses.startTime.match(TIME_RE);
    if (!sm) continue;
    const startH = parseInt(sm[1]!, 10);
    const startM = parseInt(sm[2]!, 10);
    if (startH < 4 || startH > 23) continue;

    let endH: number;
    let endM: number;
    const em = ses.endTime?.match(TIME_RE);
    if (em) {
      endH = parseInt(em[1]!, 10);
      endM = parseInt(em[2]!, 10);
    } else {
      endH = startH + 1;
      endM = startM;
    }

    const startMs = weekStartBase + dayIndex * DAY_MS + startH * 3_600_000 + startM * 60_000;
    const endMs = weekStartBase + dayIndex * DAY_MS + endH * 3_600_000 + endM * 60_000;
    if (endMs <= startMs) continue;

    results.push({
      courseName: ses.courseName,
      title: ses.title || '',
      start: startMs,
      end: endMs,
      rooms: ses.rooms || undefined,
      weekStart: weekStartOf(startMs),
    });
  }

  results.sort((a, b) => a.start - b.start);
  return results.slice(0, 60);
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function ImportScheduleDialog({ open, onClose }: ImportScheduleDialogProps) {
  const [mode, setMode] = useState<Mode>('image');
  const [phase, setPhase] = useState<Phase>('input');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<SessionDraft[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [spinnerText, setSpinnerText] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setPhase('input');
    setMode('image');
    setImageUrl(null);
    setText('');
    setDrafts([]);
    setErrorText(null);
    setResultText(null);
    setSpinnerText('');
  }, []);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // Hủy LLM call khi đóng dialog hoặc rời phase analyzing
  useEffect(() => {
    if (!open || phase !== 'analyzing') {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open, phase]);

  const handleImageFile = useCallback(async (file: File) => {
    const dataUrl = await downscaleImage(file);
    setImageUrl(dataUrl);
    setPhase('input');
    setErrorText(null);
  }, []);

  // Dán ảnh từ clipboard
  useEffect(() => {
    if (!open || mode !== 'image') return;
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        void handleImageFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [open, mode, handleImageFile]);

  // Tự đóng sau khi nhập xong
  useEffect(() => {
    if (phase !== 'done') return;
    const timer = setTimeout(onClose, 1400);
    return () => clearTimeout(timer);
  }, [phase, onClose]);

  const analyze = async () => {
    setErrorText(null);
    const settings = await getSettings();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (mode === 'image') {
        if (!imageUrl) return;
        if (!settings.openrouterKey) {
          setErrorText(s.importLms.noKey);
          setPhase('error');
          return;
        }
        setSpinnerText(s.importLms.analyzing);
        setPhase('analyzing');

        const content: ContentPart[] = [
          { type: 'text', text: EXTRACT_PROMPT },
          { type: 'image_url', image_url: { url: imageUrl } },
        ];
        const raw = await completeChat({
          key: settings.openrouterKey,
          model: settings.model ?? 'openai/gpt-4o-mini',
          messages: [{ role: 'user', content }],
          json: true,
          signal: controller.signal,
        });
        const parsed = draftsFromJson(raw);
        if (parsed.length === 0) {
          setErrorText(`${s.importLms.errorParse} ${s.importLms.tryAnother}`);
          setPhase('error');
          return;
        }
        setDrafts(parsed);
        setPhase('preview');
      } else {
        setSpinnerText(s.importLms.parseText);
        setPhase('analyzing');

        const result = parseScheduleText(text);
        if (result.drafts.length > 0) {
          setDrafts(result.drafts);
          setPhase('preview');
          return;
        }
        // Parse cứng thất bại → LLM nếu có key
        if (!settings.openrouterKey || text.trim().length < 40) {
          setErrorText(
            settings.openrouterKey
              ? s.importLms.errorParse
              : `${s.importLms.noParseText} ${s.importLms.tryLlm}`,
          );
          setPhase('error');
          return;
        }
        const raw = await completeChat({
          key: settings.openrouterKey,
          model: settings.model ?? 'openai/gpt-4o-mini',
          messages: [
            { role: 'system', content: TEXT_EXTRACT_PROMPT },
            { role: 'user', content: text.slice(0, 9000) },
          ],
          json: true,
          signal: controller.signal,
        });
        const parsed = draftsFromJson(raw, result.weekStart);
        if (parsed.length === 0) {
          setErrorText(s.importLms.errorParse);
          setPhase('error');
          return;
        }
        setDrafts(parsed);
        setPhase('preview');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorText(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const doImport = async () => {
    const result = await importLmsSessions(drafts);
    const parts = [`${result.imported} ${s.dashboard.syncImported}`];
    if (result.newCourses > 0) {
      parts.push(`${result.newCourses} ${s.dashboard.syncNew}`);
    }
    setResultText(parts.join(' · '));
    setPhase('done');
  };

  const syncFromExtension = async () => {
    setSpinnerText(s.dashboard.syncing);
    setPhase('analyzing');
    setErrorText(null);
    const response = await requestLmsSessions();
    if (!response.ok) {
      setErrorText(s.dashboard.syncFail);
      setPhase('error');
      return;
    }
    if (response.drafts.length === 0) {
      setErrorText(s.dashboard.syncEmpty);
      setPhase('error');
      return;
    }
    setDrafts(response.drafts);
    setPhase('preview');
  };

  return (
    <Dialog open={open} onClose={onClose} title={s.importLms.title} width="max-w-lg">
      {phase === 'input' && (
        <div className="space-y-4">
          <div className="flex gap-1 rounded-lg border border-line bg-paper p-1">
            {(['image', 'text'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => { setMode(tab); setErrorText(null); }}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  mode === tab
                    ? 'bg-accent-soft text-accent'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {tab === 'image' ? s.importLms.tabImage : s.importLms.tabText}
              </button>
            ))}
          </div>

          {mode === 'image' ? (
            <div className="rounded-xl border border-dashed border-line bg-paper/60 px-4 py-8 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
                <FileIcon width={16} height={16} />
              </div>
              <p className="text-xs text-ink-soft">{s.importLms.imageHint}</p>
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="schedule"
                  className="mx-auto mt-3 max-h-40 rounded-lg border border-line"
                />
              )}
              <label className="mt-3 inline-block cursor-pointer rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium hover:border-accent hover:text-accent">
                {s.importLms.chooseFile}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImageFile(file);
                  }}
                />
              </label>
            </div>
          ) : (
            <textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={s.importLms.textPlaceholder}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 font-mono text-xs focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          )}

          {errorText && (
            <p className="flex items-center gap-1.5 text-xs text-red-600">
              <AlertIcon width={14} height={14} />
              {errorText}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {s.common.cancel}
            </Button>
            <Button
              onClick={() => void analyze()}
              disabled={mode === 'image' ? !imageUrl : text.trim().length < 40}
            >
              {s.importLms.analyze}
            </Button>
          </div>

          <button
            type="button"
            onClick={() => void syncFromExtension()}
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            {s.importLms.extensionTrigger}
          </button>
        </div>
      )}

      {phase === 'analyzing' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <RefreshIcon width={22} height={22} className="animate-spin text-accent" />
          <p className="text-sm font-medium text-ink">{spinnerText}</p>
        </div>
      )}

      {phase === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-ink">
            <span className="font-semibold">{drafts.length}</span>{' '}
            {s.dashboard.syncImported}
          </p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-line bg-paper p-3">
            {drafts.slice(0, 40).map((draft) => (
              <div
                key={`${draft.start}-${draft.courseName}`}
                className="flex items-center gap-2 text-xs"
              >
                <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent">
                  {sessionTimeLabel(draft.start, draft.end)}
                </span>
                <span className="font-medium text-ink">{draft.courseName}</span>
                {draft.rooms && <span className="text-ink-soft">{draft.rooms}</span>}
                <span className="ml-auto truncate text-ink-soft">{draft.title}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={() => setPhase('input')}>
              {s.common.cancel}
            </Button>
            <Button onClick={() => void doImport()}>
              {s.importLms.importButton}
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="font-display text-2xl font-semibold text-emerald-600">
            {s.importLms.done}
          </p>
          {resultText && <p className="text-sm text-ink-soft">{resultText}</p>}
        </div>
      )}

      {phase === 'error' && (
        <div className="py-6 text-center">
          <p className="text-sm text-red-600">{errorText}</p>
          <Button variant="secondary" className="mt-4" onClick={() => setPhase('input')}>
            {s.common.cancel}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
