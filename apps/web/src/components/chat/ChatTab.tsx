import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  getOrExtractText,
  searchChunks,
  runCourseAgent,
  TEXT_EXTRACTABLE,
  buildGroundingSystem,
  uid,
  type ChatTurn,
  type Course,
  type TextFile,
} from '@lapis/core';
import { Button } from '../ui/Button';
import { RefreshIcon } from '../icons';
import { s } from '../../strings';

interface ChatTabProps {
  course: Course;
  hasFolder: boolean;
  onOpenSettings: () => void;
}

const HISTORY_LIMIT = 16;

export function ChatTab({ course, hasFolder, onOpenSettings }: ChatTabProps) {
  const settings = useLiveQuery(
    async () => {
      const row = await db.settings.get('app');
      return row?.value as { openrouterKey?: string; model?: string } | undefined;
    },
    [],
    undefined,
  );
  const key = settings?.openrouterKey;
  const model = settings?.model ?? 'openai/gpt-4o-mini';

  const materials =
    useLiveQuery(() => db.materials.where('courseId').equals(course.id).toArray(), [course.id]) ??
    [];

  const [chatId, setChatId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const existing = await db.chats.where('courseId').equals(course.id).first();
      if (!alive) return;
      if (existing) setChatId(existing.id);
      else {
        const chat = { id: uid(), courseId: course.id, title: course.name, createdAt: Date.now() };
        await db.chats.add(chat);
        if (alive) setChatId(chat.id);
      }
    })();
    return () => {
      alive = false;
    };
  }, [course.id, course.name]);

  const messages =
    useLiveQuery(
      async () => {
        if (!chatId) return [];
        const rows = await db.messages.where('chatId').equals(chatId).sortBy('createdAt');
        return rows;
      },
      [chatId],
    ) ?? [];

  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [toolStep, setToolStep] = useState<string | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingText, toolStep]);

  const send = async () => {
    const content = input.trim();
    if (!content || busy || !chatId) return;
    if (!key) {
      onOpenSettings();
      return;
    }

    setInput('');
    setError(null);
    setBusy(true);
    const root = course.folderHandle;
    const userMessage = { id: uid(), chatId, role: 'user' as const, content, createdAt: Date.now() };
    await db.messages.add(userMessage);

    // Chuẩn bị ngữ cảnh: trích xuất text (có cache) từ các tệp liên quan
    const files: TextFile[] = [];
    if (root) {
      const extractable = materials.filter((m) => TEXT_EXTRACTABLE.has(m.ext));
      let done = 0;
      for (const material of extractable) {
        done += 1;
        setReading({ done, total: extractable.length });
        const fileText = await getOrExtractText(material, root);
        if (fileText && fileText.text) {
          files.push({ path: material.path, text: fileText.text });
        }
      }
      setReading(null);
    }

    const historyRows = await db.messages.where('chatId').equals(chatId).sortBy('createdAt');
    const history: ChatTurn[] = historyRows.slice(-HISTORY_LIMIT).map((m) => ({
      role: m.role === 'system' ? 'user' : m.role,
      content: m.content,
    }));
    const chunks = searchChunks(files, content);
    const baseTurns: ChatTurn[] = [
      { role: 'system', content: buildGroundingSystem(course.name, materials, chunks) },
      ...history,
    ];

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';
    setStreamingText('');
    try {
      const result = await runCourseAgent({
        course,
        root: root ?? null,
        materials,
        getTextFiles: () => Promise.resolve(files),
        baseTurns,
        key,
        model,
        signal: controller.signal,
        onDelta: (delta) => {
          full += delta;
          setStreamingText((prev) => (prev ?? '') + delta);
        },
        onTool: (info) => {
          setToolStep(info.label);
        },
      });
      await db.messages.add({
        id: uid(),
        chatId,
        role: 'assistant',
        content: result.text || full || '(Không có nội dung trả về.)',
        createdAt: Date.now(),
      });
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      if (!aborted) {
        setError(e instanceof Error ? e.message : String(e));
      }
      if (full) {
        await db.messages.add({
          id: uid(),
          chatId,
          role: 'assistant',
          content: aborted ? `${full}\n\n(Đã dừng)` : full,
          createdAt: Date.now(),
        });
      }
    } finally {
      setStreamingText(null);
      setToolStep(null);
      setBusy(false);
      abortRef.current = null;
      setReading(null);
    }
  };

  const onInputKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const extractableCount = materials.filter((m) => TEXT_EXTRACTABLE.has(m.ext)).length;

  return (
    <div className="flex h-[70vh] min-h-[460px] flex-col overflow-hidden rounded-2xl border border-line bg-card">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{s.course.chat}</p>
          <p className="truncate text-xs text-ink-soft">
            {hasFolder
              ? `${extractableCount} ${s.chat.filesInContext}`
              : s.chat.noFolderHint}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
          {model}
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && !busy ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-ink">{s.chat.emptyTitle}</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-soft">
              {s.chat.emptyHint}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {s.chat.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setInput(suggestion)}
                  className="rounded-full border border-line bg-paper px-3.5 py-2 text-xs text-ink-soft transition-colors hover:border-accent hover:text-accent"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages
              .filter((m) => m.role !== 'system')
              .map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'ml-auto max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-white'
                      : 'mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-paper px-4 py-2.5 text-sm text-ink'
                  }
                >
                  {m.content}
                </div>
              ))}
            {toolStep ? (
              <div className="mr-auto inline-flex max-w-[85%] items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent">
                <RefreshIcon width={12} height={12} className="animate-spin" />
                {toolStep}
              </div>
            ) : null}
            {streamingText !== null ? (
              <div className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-line bg-paper px-4 py-2.5 text-sm text-ink">
                {streamingText === '' ? '…' : streamingText}
                <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />
              </div>
            ) : null}
          </>
        )}
      </div>

      {error ? (
        <p className="mx-4 mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
      ) : null}
      {!key ? (
        <div className="mx-4 mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2">
          <p className="text-xs text-amber-900">{s.chat.noKey}</p>
          <Button variant="secondary" size="sm" onClick={onOpenSettings}>
            {s.chat.addKey}
          </Button>
        </div>
      ) : null}

      <div className="border-t border-line p-3">
        {reading ? (
          <p className="mb-2 text-xs text-ink-soft">
            {s.chat.reading} ({reading.done}/{reading.total})…
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={s.chat.placeholder}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-line bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-stone-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
          {busy ? (
            <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
              {s.chat.stop}
            </Button>
          ) : (
            <Button onClick={send} disabled={!input.trim()}>
              {s.chat.send}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
