import {
  isValidDraft,
  sessionIdOf,
  weekStartOf,
  type SessionDraft,
} from '@lapis/lms-vcbi';
import { createCourse, db } from '@lapis/core';
import { COURSE_COLORS } from '../components/ColorPicker';

export type LmsSyncResult =
  | { ok: true; imported: number; newCourses: number }
  | { ok: false; reason: 'no-extension' | 'empty' };

export function requestLmsSessions(
  timeoutMs = 1800,
): Promise<{ ok: true; drafts: SessionDraft[] } | { ok: false; reason: 'no-extension' }> {
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => window.removeEventListener('message', onMessage);
    const finish = (result: { ok: true; drafts: SessionDraft[] } | { ok: false; reason: 'no-extension' }) => {
      cleanup();
      window.clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return;
      const data = event.data as { source?: string; type?: string; drafts?: SessionDraft[] } | null;
      if (!data || data.source !== 'lapis-extension' || data.type !== 'lapis:sessions') return;
      finish({ ok: true, drafts: Array.isArray(data.drafts) ? data.drafts : [] });
    };
    const timer = window.setTimeout(() => finish({ ok: false, reason: 'no-extension' }), timeoutMs);
    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'lapis-webapp', type: 'lapis:get-sessions' }, '*');
  });
}

export async function importLmsSessions(
  drafts: SessionDraft[],
): Promise<{ ok: true; imported: number; newCourses: number }> {
  const now = Date.now();
  let newCourses = 0;
  const valid = drafts.filter(isValidDraft).slice(0, 2000);

  await db.transaction('rw', [db.courses, db.lmsSessions], async () => {
    await db.lmsSessions.clear();
    for (const draft of valid) {
      let course = await db.courses.where('name').equals(draft.courseName).first();
      if (!course) {
        course = await createCourse({
          name: draft.courseName,
          color: COURSE_COLORS[newCourses % COURSE_COLORS.length] as string,
        });
        newCourses += 1;
      }
      await db.lmsSessions.put({
        id: sessionIdOf(draft),
        courseName: draft.courseName,
        title: draft.title || 'Buổi học',
        start: draft.start,
        end: draft.end,
        rooms: draft.rooms,
        weekStart: draft.weekStart || weekStartOf(draft.start),
        capturedAt: now,
      });
    }
  });

  const unique = new Set(valid.map((d) => `${d.courseName}|${d.start}|${d.end}`)).size;
  return { ok: true, imported: unique, newCourses };
}
