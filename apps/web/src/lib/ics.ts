import { db, type LmsSession } from '@lapis/core';

const pad = (n: number): string => String(n).padStart(2, '0');

/** epoch ms → "20260908T024500Z" (UTC). */
function toUtcStamp(epochMs: number): string {
  const d = new Date(epochMs);
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function esc(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export function buildIcs(sessions: LmsSession[]): string {
  const now = toUtcStamp(Date.now());
  const events = sessions
    .slice()
    .sort((a, b) => a.start - b.start)
    .map((session) => {
      const lines = [
        'BEGIN:VEVENT',
        `UID:${session.id}@lapis`,
        `DTSTAMP:${now}`,
        `DTSTART:${toUtcStamp(session.start)}`,
        `DTEND:${toUtcStamp(session.end)}`,
        `SUMMARY:${esc(session.courseName)}`,
        `DESCRIPTION:${esc(`${session.title}${session.rooms ? ` · ${session.rooms}` : ''} — xuất từ Lapis`)}`,
      ];
      if (session.rooms) lines.push(`LOCATION:${esc(session.rooms)}`);
      lines.push('END:VEVENT');
      return lines.join('\r\n');
    });
  return (
    ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lapis//Schedule//VI', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join(
      '\r\n',
    ) + '\r\n'
  );
}

function downloadIcs(filename: string, sessions: LmsSession[]): number {
  if (sessions.length === 0) return 0;
  const blob = new Blob([buildIcs(sessions)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return sessions.length;
}

/** Xuất toàn bộ lịch đã capture. */
export async function exportAllIcs(): Promise<number> {
  const rows = await db.lmsSessions.toArray();
  return downloadIcs(`lapis-lich-hoc-${new Date().toISOString().slice(0, 10)}.ics`, rows);
}

/** Xuất một tuần (theo weekStart). */
export async function exportWeekIcs(weekStart: number): Promise<number> {
  const rows = await db.lmsSessions.where('weekStart').equals(weekStart).toArray();
  const date = new Date(weekStart);
  const label = `${pad(date.getDate())}${pad(date.getMonth() + 1)}`;
  return downloadIcs(`lapis-tuan-${label}.ics`, rows);
}

/** Link "thêm sự kiện" prefilled của Google Calendar (1 click → confirm trong GCal). */
export function googleCalendarLink(session: LmsSession): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: session.courseName,
    dates: `${toUtcStamp(session.start)}/${toUtcStamp(session.end)}`,
  });
  if (session.rooms) params.set('location', session.rooms);
  params.set('details', `${session.title} — xuất từ Lapis`);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
