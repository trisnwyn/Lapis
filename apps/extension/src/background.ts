import {
  normalizeScheduleJson,
  sessionIdOf,
  type SessionDraft,
} from '@lapis/lms-vcbi';

interface Snapshot {
  url: string;
  at: number;
  count: number;
}

interface PageNote {
  url: string;
  cards?: number;
  at: number;
}

interface ChromeMessage {
  type?: string;
  url?: string;
  payload?: unknown;
  note?: PageNote;
}

function mergeSessionDrafts(current: SessionDraft[], fresh: SessionDraft[]): SessionDraft[] {
  const map = new Map<string, SessionDraft>();
  for (const item of [...current, ...fresh]) {
    map.set(sessionIdOf(item), item);
  }
  return [...map.values()].slice(-3000);
}

const storageGet = (keys: unknown): Promise<Record<string, unknown>> =>
  new Promise((resolve) =>
    chrome.storage.local.get(
      keys as string | string[] | null,
      (items: Record<string, unknown>) => resolve(items),
    ),
  );

const storageSet = (items: Record<string, unknown>): Promise<void> =>
  new Promise((resolve) => chrome.storage.local.set(items, () => resolve()));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  void (async () => {
    const typed = msg as ChromeMessage;
    try {
      if (typed.type === 'lapis:capture-json') {
        const drafts = normalizeScheduleJson(typed.payload);
        const stored = await storageGet({ sessions: [] });
        const current = (stored.sessions as SessionDraft[]) ?? [];
        const merged = mergeSessionDrafts(current, drafts);
        const snapStored = await storageGet({ snapshots: [], rawSnapshots: [] });
        const snapshots = ((snapStored.snapshots as Snapshot[]) ?? [])
          .filter((snapshot) => snapshot.url !== typed.url)
          .concat({ url: typed.url ?? '', at: Date.now(), count: drafts.length })
          .slice(-10);
        // giữ raw JSON (giảm kích thước) để siết parser theo shape thật
        const rawBody = typeof typed.payload === 'object' && typed.payload !== null
          ? JSON.stringify(typed.payload).slice(0, 120_000)
          : String(typed.payload ?? '');
        const isVjcbi = /vjcbi\.study/.test(typed.url ?? '');
        const rawSnapshots = ((snapStored.rawSnapshots as Array<{ url: string; at: number; count: number; body: string }>) ?? [])
          .filter((raw) => raw.url !== typed.url)
          .concat({
            url: typed.url ?? '',
            at: Date.now(),
            count: drafts.length,
            body: (isVjcbi || drafts.length > 0) ? rawBody : '',
          })
          .filter((raw) => raw.body)
          .slice(-5);
        await storageSet({ sessions: merged, snapshots, rawSnapshots });
        sendResponse({ ok: true, count: drafts.length, total: merged.length });
        return;
      }

      if (typed.type === 'lapis:capture-dom') {
        const drafts = Array.isArray(typed.payload)
          ? (typed.payload as SessionDraft[])
          : [];
        const stored = await storageGet({ sessions: [] });
        const current = (stored.sessions as SessionDraft[]) ?? [];
        const merged = mergeSessionDrafts(current, drafts);
        const snapStored = await storageGet({ snapshots: [] });
        const snapshots = ((snapStored.snapshots as Snapshot[]) ?? [])
          .filter((snapshot) => snapshot.url !== typed.url)
          .concat({ url: `${typed.url ?? ''}#dom`, at: Date.now(), count: drafts.length })
          .slice(-10);
        await storageSet({ sessions: merged, snapshots });
        sendResponse({ ok: true, count: drafts.length, total: merged.length });
        return;
      }

      if (typed.type === 'lapis:get-state') {
        const state = await storageGet(null);
        sendResponse({ ok: true, ...state });
        return;
      }

      if (typed.type === 'lapis:capture-note') {
        const stored = await storageGet({ notes: [] });
        const notes = ((stored.notes as PageNote[]) ?? [])
          .filter((note) => note.url !== typed.note?.url)
          .concat(typed.note as PageNote)
          .slice(-5);
        await storageSet({ notes });
        sendResponse({ ok: true });
        return;
      }

      if (typed.type === 'lapis:clear') {
        await chrome.storage.local.clear(() => sendResponse({ ok: true }));
        return;
      }

      sendResponse({ ok: false, error: 'unknown message' });
    } catch (e) {
      sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  })();
  return true; // async sendResponse
});
