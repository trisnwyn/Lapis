// Google Calendar API v3 từ trong extension — token qua chrome.identity.getAuthToken
// (consent popup native Chrome, token do Chrome cache), event id cố định → không trùng.

import { sessionIdOf, type SessionDraft } from '@lapis/lms-vcbi';

export type GcalSession = SessionDraft;

export interface GcalSyncResult {
  created: number;
  skipped: number;
  failed: number;
}

export async function getGcalToken(interactive = true): Promise<string> {
  const token = await (chrome.identity.getAuthToken as unknown as (
    details: { interactive: boolean },
  ) => Promise<string | undefined>)({ interactive });
  if (!token) {
    throw new Error('Không lấy được Google token');
  }
  return token;
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

export async function pushSessionsToGcal(
  authBy: { sessions: GcalSession[]; token: string },
): Promise<GcalSyncResult> {
  const result: GcalSyncResult = { created: 0, skipped: 0, failed: 0 };
  const queue = [...authBy.sessions];
  const workerCount = Math.min(4, queue.length);
  if (workerCount === 0) return result;

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
              Authorization: `Bearer ${authBy.token}`,
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
