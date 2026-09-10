interface Snapshot {
  url: string;
  at: number;
  count: number;
}

interface ScrapeDiag {
  ok?: boolean;
  cards?: number;
  headers?: number;
  embedded?: number;
  drafts?: number;
  regionHtml?: string;
}

interface ExtensionState {
  sessions?: unknown[];
  snapshots?: Snapshot[];
  rawSnapshots?: Array<{ url: string; at: number; count: number; body: string }>;
}

const statusEl = document.getElementById('status') as HTMLElement | null;
const notesEl = document.getElementById('notes') as HTMLElement | null;
const hintEl = document.getElementById('hint') as HTMLElement | null;

function sendRuntime<T>(message: unknown): Promise<T> {
  return new Promise<T>((resolve) =>
    chrome.runtime.sendMessage(message, (response: unknown) => {
      void chrome.runtime.lastError;
      resolve(response as T);
    }),
  );
}

function sendTab<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise<T>((resolve) =>
    chrome.tabs.sendMessage(tabId, message, (response: unknown) => {
      void chrome.runtime.lastError;
      resolve(response as T);
    }),
  );
}

function render(): void {
  void sendRuntime<ExtensionState>({ type: 'lapis:get-state' }).then((state) => {
    const sessions = state?.sessions ?? [];
    const snapshots = state?.snapshots ?? [];
    if (statusEl) {
      statusEl.textContent =
        sessions.length > 0
          ? `Đã bắt ${sessions.length} phiên học từ API LMS.`
          : 'Chưa bắt được dữ liệu nào.';
      statusEl.classList.toggle('ok', sessions.length > 0);
    }
    if (notesEl) {
      const latest = snapshots[snapshots.length - 1];
      notesEl.textContent = latest
        ? `Bắt gần nhất: ${latest.url.slice(0, 60)}… (${latest.count} phiên)`
        : '';
    }
  });
}

interface ScrapeDiag {
  ok?: boolean;
  cards?: number;
  headers?: number;
  embedded?: number;
  drafts?: number;
}

document.getElementById('capture')?.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return;
  try {
    const response = await sendTab<ScrapeDiag>(tab.id, {
      type: 'lapis:scrape-now',
    });
    if (hintEl) {
      hintEl.textContent = response?.ok
        ? `Đã chụp: ${response.drafts ?? 0} phiên mới · ${response.cards ?? 0} card · ${response.headers ?? 0} header ngày · ${response.embedded ?? 0} script JSON. (F12 console xem log [Lapis])`
        : 'Extension chưa nạp vào trang — hãy TẢI LẠI trang LMS (F5) rồi bấm lại.';
    }
  } catch {
    if (hintEl) hintEl.textContent = 'Extension chưa nạp vào trang — hãy TẢI LẠI trang LMS (F5) rồi bấm lại.';
  }
});

document.getElementById('copy')?.addEventListener('click', async () => {
  const state = await sendRuntime<ExtensionState>({ type: 'lapis:get-state' });
  let diag: { cards?: number; headers?: number; embedded?: number; drafts?: number; regionHtml?: string } | null = null;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (tab?.id) {
    try {
      diag = await sendTab<ScrapeDiag>(tab.id, { type: 'lapis:scrape-now' });
    } catch {
      diag = null;
    }
  }
  const payload = {
    sessions: state?.sessions ?? [],
    rawSnapshots: state?.rawSnapshots ?? [],
    diag: diag
      ? {
          cards: diag.cards,
          headers: diag.headers,
          embedded: diag.embedded,
          drafts: diag.drafts,
        }
      : null,
    regionHtml: diag?.regionHtml ?? null,
  };
  await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  if (hintEl) hintEl.textContent = 'Đã sao chép: sessions + raw JSON + chẩn đoán DOM.';
});

document.getElementById('clear')?.addEventListener('click', async () => {
  if (!window.confirm('Xóa toàn bộ dữ liệu đã bắt?')) return;
  await sendRuntime({ type: 'lapis:clear' });
  render();
});

void render();
