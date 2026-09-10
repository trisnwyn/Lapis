import { getGcalToken, pushSessionsToGcal } from './gcal';
import type { SessionDraft } from '@lapis/lms-vcbi';

interface Snapshot {
  url: string;
  at: number;
  count: number;
}

interface ExtensionState {
  sessions?: unknown[];
  snapshots?: Snapshot[];
  rawSnapshots?: Array<{ url: string; at: number; count: number; body: string }>;
}

const statusEl = document.getElementById('status') as HTMLElement | null;
const notesEl = document.getElementById('notes') as HTMLElement | null;
const hintEl = document.getElementById('hint') as HTMLElement | null;
const gcalEl = document.getElementById('gcal') as HTMLElement | null;

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
          ? `Đã bắt ${sessions.length} phiên học từ LMS.`
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

/* ---------- Đồng bộ Google Calendar (feature chính) ---------- */

let pushing = false;

async function syncGcal(): Promise<void> {
  if (pushing || !gcalEl) return;
  pushing = true;
  gcalEl.classList.add('disabled');
  gcalEl.textContent = 'Đang đẩy lên Google Calendar…';
  if (hintEl) hintEl.textContent = '';
  try {
    const state = await sendRuntime<{ sessions?: unknown[] }>({ type: 'lapis:get-state' });
    const sessions = (state?.sessions ?? []) as SessionDraft[];
    if (sessions.length === 0) {
      if (hintEl) {
        hintEl.textContent =
          'Chưa có phiên học nào đã bắt. Mở trang Lịch học trên LMS trước (extension tự quét).';
      }
      return;
    }
    const token = await getGcalToken();
    const result = await pushSessionsToGcal({ sessions, token });
    if (hintEl) {
      hintEl.textContent =
        `Google Calendar: tạo ${result.created} · bỏ qua ${result.skipped} (đã có) · lỗi ${result.failed}`;
    }
  } catch (e) {
    if (hintEl) hintEl.textContent = `Lỗi: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    pushing = false;
    if (gcalEl) gcalEl.textContent = 'Đồng bộ lên Google Calendar';
    void render();
  }
}

/** Chụp trang hiện tại ngay (dọn dữ liệu lâu) rồi đẩy thẳng lên Google Calendar. */
async function captureAndSync(): Promise<void> {
  if (pushing) return;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return;
  try {
    await sendTab<{ ok?: boolean; cards?: number }>(tab.id, { type: 'lapis:scrape-now' });
    if (hintEl) hintEl.textContent = 'Đã chụp trang — đang chuẩn bị dữ liệu…';
  } catch {
    // tab không nạp content script — dùng dữ liệu-cached như thường
  }
  window.setTimeout(() => void syncGcal(), 1200);
}

document.getElementById('gcal')?.addEventListener('click', () => void syncGcal());

/* ---------- Hành động phụ ---------- */

document.getElementById('capture')?.addEventListener('click', async () => {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id) return;
  try {
    const response = await sendTab<{
      ok?: boolean;
      cards?: number;
      headers?: number;
      embedded?: number;
      drafts?: number;
    }>(tab.id, {
      type: 'lapis:scrape-now',
    });
    if (hintEl) {
      hintEl.textContent = response?.ok
        ? `Đã chụp: ${response.drafts ?? 0} phiên mới · ${response.cards ?? 0} card · ${response.headers ?? 0} header ngày · ${response.embedded ?? 0} script JSON.`
        : 'Extension chưa nạp vào trang — hãy TẢI LẠI trang LMS (F5) rồi bấm lại.';
    }
  } catch {
    if (hintEl)
      hintEl.textContent =
        'Extension chưa nạp vào trang — hãy TẢI LẠI trang LMS (F5) rồi bấm lại.';
  }
});

document.getElementById('copy')?.addEventListener('click', async () => {
  const state = await sendRuntime<ExtensionState>({ type: 'lapis:get-state' });
  const exportData = {
    sessions: state?.sessions ?? [],
    rawSnapshots: state?.rawSnapshots ?? [],
  };
  await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2));
  if (hintEl) hintEl.textContent = 'Đã sao chép sessions + raw JSON vào clipboard.';
});

document.getElementById('clear')?.addEventListener('click', async () => {
  if (!window.confirm('Xóa toàn bộ dữ liệu đã bắt?')) return;
  await sendRuntime({ type: 'lapis:clear' });
  render();
});

void render();
