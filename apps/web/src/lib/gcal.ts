// Google Calendar API v3 từ browser — OAuth token client (GIS), không cần backend.
// Setup một lần duy nhất: Google Cloud → OAuth Client ID (Web) → Authorized origins = origin của Lapis.

interface GsiTokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GsiOauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: { access_token?: string; error?: string }) => void;
  }): GsiTokenClient;
}

interface GsiWindow extends Window {
  google?: {
    accounts: {
      oauth2: GsiOauth2;
    };
  };
}

let gsiPromise: Promise<void> | null = null;

function loadGsi(): Promise<void> {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được Google Identity Services'));
    document.head.appendChild(script);
  });
  return gsiPromise;
}

export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

/** Client ID baked vào bản build (đặt bởi admin qua VITE_GOOGLE_CLIENT_ID). */
const BUILD_CLIENT_ID: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID ?? '';

/** Ưu tiên override thủ công trong Cài đặt; ngược lại dùng ID mặc định của bản build. */
export function getClientId(userOverride?: string): string {
  return (userOverride ?? '').trim() || BUILD_CLIENT_ID;
}

export async function requestGcalToken(clientIdOverride?: string): Promise<string> {
  const clientId = getClientId(clientIdOverride);
  if (!clientId) throw new Error(LAPIS_ENV_MISSING_ID);
  const w = window as GsiWindow;
  await loadGsi();
  const google = w.google;
  if (!google?.accounts?.oauth2) throw new Error('Google Identity Services không sẵn sàng');
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GCAL_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error('Xác thực Google thất bại'));
      },
    });
    client.requestAccessToken({});
  });
}

const LAPIS_ENV_MISSING_ID =
  'Lapis chưa được cấu hình Google Client ID (VITE_GOOGLE_CLIENT_ID) — báo cho admin.';

export interface GcalSession {
  id: string;
  courseName: string;
  title: string;
  start: number;
  end: number;
  rooms?: string;
}

export interface GcalSyncResult {
  created: number;
  skipped: number;
  failed: number;
}

function toEvent(session: GcalSession): Record<string, unknown> {
  const id = session.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const eventId = id.length >= 5 ? id : `lapis${id}`;
  return {
    id: eventId,
    summary: session.courseName,
    description: `${session.title} — xuất từ Lapis`,
    ...(session.rooms ? { location: session.rooms } : {}),
    start: { dateTime: new Date(session.start).toISOString() },
    end: { dateTime: new Date(session.end).toISOString() },
  };
}

/** Đẩy events lên calendar chính; event id cố định → 409 nghĩa là đã tồn tại (bỏ qua, không trùng). */
export async function syncSessionsToGcal(
  sessions: GcalSession[],
  token: string,
): Promise<GcalSyncResult> {
  const result: GcalSyncResult = { created: 0, skipped: 0, failed: 0 };
  const queue = [...sessions];
  const workerCount = Math.min(4, queue.length);

  const worker = async (): Promise<void> => {
    for (;;) {
      const session = queue.pop();
      if (!session) return;
      try {
        const res = await fetch(
          'https://www.googleapis.com/calendar/v3/calendars/primary/events',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(toEvent(session)),
          },
        );
        if (res.status === 200 || res.status === 201) result.created += 1;
        else if (res.status === 409) result.skipped += 1;
        else result.failed += 1;
      } catch {
        result.failed += 1;
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return result;
}
