// Google Calendar API v3 từ trong extension — hoạt động cả trên Chrome lẫn Edge.
//   Chrome: chrome.identity.getAuthToken (consent popup native, token do Chrome cache)
//   Edge  : getAuthToken KHÔNG hỗ trợ → launchWebAuthFlow (implicit) + tự cache token.
// Event id cố định (sessionIdOf) → push lại không bao giờ trùng.

import { sessionIdOf, type SessionDraft } from '@lapis/lms-vcbi';

export type GcalSession = SessionDraft;

export interface GcalSyncResult {
  created: number;
  skipped: number;
  failed: number;
}

export const GCAL_CLIENT_ID =
  '458322241332-joqocs5d506ajj0mbb56jkr167lk8sh0.apps.googleusercontent.com';
export const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const TOKEN_CACHE_KEY = 'gcalWebAuthToken';

interface CachedToken {
  token: string;
  expiresAt: number;
}

function storageGet(key: string): Promise<CachedToken | undefined> {
  return new Promise((resolve) =>
    chrome.storage.local.get([key], (items: Record<string, unknown>) =>
      resolve(items[key] as CachedToken | undefined),
    ),
  );
}

function storageSetToken(cached: CachedToken): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ [TOKEN_CACHE_KEY]: cached }, () => resolve()));
}

function storageRemoveToken(): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.remove([TOKEN_CACHE_KEY], () => resolve()));
}

/** getAuthToken (Chrome). Edge ném lỗi "not supported" → caller fallback. */
function authTokenChrome(interactive: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      chrome.identity.getAuthToken({ interactive }, (token) => {
        if (chrome.runtime.lastError || !token) resolve(null);
        else resolve(String(token));
      });
    } catch {
      resolve(null);
    }
  });
}

/** launchWebAuthFlow implicit flow — chạy được trên Edge. Token cache 90% thời gian sống. */
async function webAuthFlowToken(): Promise<string> {
  const cached = await storageGet(TOKEN_CACHE_KEY);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GCAL_CLIENT_ID);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', GCAL_SCOPE);
  authUrl.searchParams.set('prompt', 'consent');

  const responseUrl: string = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (result: string | undefined) => {
        const err = chrome.runtime.lastError?.message;
        if (err || !result) {
          reject(new Error(err ?? 'Google popup bị đóng'));
          return;
        }
        resolve(result);
      },
    );
  });

  const fragment = new URL(responseUrl).hash.replace(/^#/, '');
  const params = new URLSearchParams(fragment);
  const token = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') ?? '3600');
  if (!token) throw new Error('Google không trả về access token');

  await storageSetToken({
    token,
    expiresAt: Date.now() + expiresIn * 900,
  });
  return token;
}

/** Token: Chrome → identity cache; Edge → webAuthFlow cache. */
export async function getGcalToken(): Promise<string> {
  const chromeToken = await authTokenChrome(true);
  if (chromeToken) return chromeToken;
  return webAuthFlowToken();
}

function toEvent(session: GcalSession): Record<string, unknown> {
  const id = sessionIdOf(session).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return {
    id: id.length >= 5 ? id : `lapis${id}`,
    summary: session.courseName,
    description: `${session.title} — xuất từ Lapis`,
    ...(session.rooms ? { location: session.rooms } : {}),
    start: { dateTime: new Date(session.start).toISOString() },
    end: { dateTime: new Date(session.end).toISOString() },
  };
}

export async function pushSessionsToGcal(push: {
  sessions: GcalSession[];
  token: string;
}): Promise<GcalSyncResult> {
  const result: GcalSyncResult = { created: 0, skipped: 0, failed: 0 };
  const queue = [...push.sessions];
  if (queue.length === 0) return result;
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
              Authorization: `Bearer ${push.token}`,
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
  if (result.failed > 0 && result.created === 0) {
    // token có thể hết hạn → xóa cache, lần sau xin token mới
    await storageRemoveToken();
  }
  return result;
}
