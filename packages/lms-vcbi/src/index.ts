// Capture layer cho LMS của trường (custom SPA).
// v0.2: normalize JSON payload (fetch-patch + SSR script tags) + helper DOM card.

export interface SessionDraft {
  courseName: string;
  title: string;
  start: number;
  end: number;
  rooms?: string;
  weekStart: number;
}

type AnyRecord = Record<string, unknown>;

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const normKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]+/g, '_');
const isObj = (v: unknown): v is AnyRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Thứ Hai 00:00 của tuần chứa epoch cho sẵn. */
export function weekStartOf(epochMs: number): number {
  const d = new Date(epochMs);
  const day = (d.getDay() + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/** "Sep 7 — Sep 13, 2026" → epoch ms của Sep 7 (coi như đầu tuần). */
export function parseWeekRange(text: string): number | null {
  const m = text.match(
    /([A-Za-zÀ-ỹ]{3,9})\s+(\d{1,2})\s*[—–-]\s*[A-Za-zÀ-ỹ]{3,9}\s+\d{1,2},?\s*(\d{4})/,
  );
  if (!m) return null;
  const month = MONTHS[(m[1] as string).toLowerCase()];
  if (month === undefined) return null;
  const date = new Date(Number(m[3]), month, Number(m[2]));
  return weekStartOf(date.getTime());
}

function toMidnightMs(v: unknown): number | null {
  if (typeof v === 'number' && v > 1e9) {
    const d = new Date(v > 1e12 ? v : v * 1000);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    }
    const t = Date.parse(v);
    if (Number.isFinite(t)) {
      const d = new Date(t);
      const y = d.getFullYear();
      if (y >= 2000 && y <= 2100) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      }
    }
  }
  return null;
}

function toTimeOfDayMs(v: unknown): number | null {
  if (typeof v === 'string') {
    const m = v.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      const h = Number(m[1]);
      const min = Number(m[2]);
      if (h <= 23 && min <= 59) return h * 3_600_000 + min * 60_000;
    }
  }
  return null;
}

/** Tìm "HH:mm" trong các trường giờ của object. */
function findTimeOfDay(obj: AnyRecord): number | null {
  for (const [k, v] of Object.entries(obj)) {
    const nk = normKey(k);
    if (/(?:^|_)(?:start|end|begin|from)?_?time(?:_|$)/.test(nk) || /hour/.test(nk)) {
      const tod = toTimeOfDayMs(v);
      if (tod != null) return tod;
    }
  }
  return null;
}

function findDateMidnight(obj: AnyRecord): number | null {
  for (const [k, v] of Object.entries(obj)) {
    const nk = normKey(k);
    if (/date|day|start|begin|from/.test(nk)) {
      const ms = toMidnightMs(v);
      if (ms != null) return ms;
    }
  }
  return null;
}

/** Parse giá trị bất kỳ thành epoch ms: epoch | ISO | "YYYY-MM-DD[ T]HH:mm" | "HH:mm" (kết hợp ngày trong obj). */
function toMoment(v: unknown, obj: AnyRecord): number | null {
  if (typeof v === 'number') {
    if (v >= 1e12) return v;
    if (v >= 1e9) return v * 1000;
    return null;
  }
  if (typeof v !== 'string') return null;

  const dateTime = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (dateTime && dateTime[1] && dateTime[2] && dateTime[3]) {
    const midnight = new Date(
      Number(dateTime[1]),
      Number(dateTime[2]) - 1,
      Number(dateTime[3]),
    ).getTime();
    if (dateTime[4] && dateTime[5]) {
      return midnight + Number(dateTime[4]) * 3_600_000 + Number(dateTime[5]) * 60_000;
    }
    const tod = findTimeOfDay(obj);
    return tod != null ? midnight + tod : null;
  }
  const todOnly = toTimeOfDayMs(v);
  if (todOnly != null) {
    const base = findDateMidnight(obj);
    return base != null ? base + todOnly : null;
  }
  const t = Date.parse(v);
  if (Number.isFinite(t)) {
    const y = new Date(t).getFullYear();
    if (y >= 2000 && y <= 2100) return t;
  }
  return null;
}

const START_KEY = /(?:^|_)(start|from|begin)/;
const END_KEY = /(?:^|_)(end|until|finish)/;
const ROOMS_KEY = /room|place|location|building|venue/;
const TITLE_KEY = /(?:^|_)(title|name|lesson|session|course|subject|class)(?:$|_)/;
const COURSE_KEY = /course|subject|class_name|classname/;
const DURATION_KEY = /duration|length/;

function pickValueString(obj: AnyRecord, re: RegExp): string | undefined {
  for (const [k, v] of Object.entries(obj)) {
    if (re.test(normKey(k)) && typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export function sessionIdOf(d: SessionDraft): string {
  const key = `${d.courseName}|${d.title}|${d.start}|${d.end}`;
  let h = 5381;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) + h + key.charCodeAt(i)) | 0;
  }
  return `lms-${(h >>> 0).toString(36)}`;
}

/** Draft rác: tên lớp chứa mốc giờ ("Today · 06:45–09:10"), tag widget ("UP NEXT"), hoặc quá dài. */
export function isValidDraft(d: SessionDraft): boolean {
  const name = d.courseName;
  if (!name || name.length > 90) return false;
  if (/\d{1,2}:\d{2}/.test(name)) return false;
  if (/(today|now|up\s*next|hôm\s*nay)/i.test(name)) return false;
  if (/^(buổi học|không rõ)/i.test(name) && name.includes(':')) return false;
  return true;
}

/** Buổi học khả dĩ: giờ trong ngày hợp lệ, dài không quá 8h, năm hợp lệ. */
function plausible(start: number, end: number): boolean {
  const startHour = new Date(start).getHours();
  const startYear = new Date(start).getFullYear();
  return (
    startYear >= 2020 &&
    startYear <= 2100 &&
    startHour >= 4 &&
    startHour <= 22 &&
    end > start &&
    end - start <= 8 * 3_600_000
  );
}

/** Đi toàn bộ payload JSON, với mỗi object có cặp ngày/giờ khả dĩ → SessionDraft. Generic vì LMS là custom. */
export function normalizeScheduleJson(payload: unknown): SessionDraft[] {
  const seen = new Set<string>();
  const out: SessionDraft[] = [];
  let nodes = 0;

  const walk = (node: unknown): void => {
    if (nodes > 20000) return;
    nodes += 1;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isObj(node)) return;

    const entries = Object.entries(node);
    const pickRaw = (re: RegExp): unknown => {
      for (const [k, v] of entries) if (re.test(normKey(k))) return v;
      return undefined;
    };

    const rawStart = pickRaw(START_KEY);
    const rawEnd = pickRaw(END_KEY);
    if (rawStart !== undefined) {
      const start = toMoment(rawStart, node);
      let end = rawEnd !== undefined ? toMoment(rawEnd, node) : null;
      if (start != null && (end == null || end <= start)) {
        const durationRaw = pickRaw(DURATION_KEY);
        const minutes =
          typeof durationRaw === 'number' && durationRaw > 0 && durationRaw < 720
            ? durationRaw
            : 60;
        end = start + minutes * 60_000;
      }
      if (start != null && end != null && end > start && plausible(start, end)) {
        const title = pickValueString(node, TITLE_KEY) ?? '';
        const courseName = pickValueString(node, COURSE_KEY) || title || 'Không rõ lớp';
        const draft: SessionDraft = {
          courseName,
          title,
          start,
          end,
          rooms: pickValueString(node, ROOMS_KEY),
          weekStart: weekStartOf(start),
        };
        const id = sessionIdOf(draft);
        if (!seen.has(id)) {
          seen.add(id);
          out.push(draft);
        }
      }
    }

    for (const value of Object.values(node)) {
      if (isObj(value) || Array.isArray(value)) walk(value);
    }
  };

  walk(payload);
  return out;
}

/* ---- DOM card parser (fallback khi API/SSR không lộ dữ liệu) ---- */

export interface SessionCard {
  title: string;
  startMinutes: number;
  endMinutes: number;
  rooms?: string;
  courseName: string;
}

/** Card kiểu: "Session 9\n06:45 – 09:10 · M2 + M3 · Kinh tế vi mô" */
export function parseSessionCard(text: string): SessionCard | null {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const titleLine = lines.find((line) => /^sessions?\s+\d+/i.test(line));
  if (!titleLine) return null;
  const rest = lines.filter((line) => line !== titleLine).join(' · ');
  const timeMatch = rest.match(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/);
  if (!timeMatch || !timeMatch[1]) return null;
  const startMinutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
  const endMinutes = Number(timeMatch[3]) * 60 + Number(timeMatch[4]);
  const timeSegment = `${timeMatch[1]}:${timeMatch[2]} – ${timeMatch[3]}:${timeMatch[4]}`;
  const segments = rest
    .split('·')
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== timeSegment);
  const rooms = segments.find(
    (segment) => /\+/.test(segment) && segment.length <= 20 && !/:\d{2}/.test(segment),
  );
  const courseName = segments.filter((segment) => segment !== rooms).join(' · ') || titleLine;
  return { title: titleLine, startMinutes, endMinutes, rooms, courseName };
}

export function countSessionCards(text: string): number {
  const matches = text.matchAll(/\bsessions?\s+\d+/gi);
  return new Set([...matches].map((match) => match[0].toLowerCase())).size;
}

/* ---- Text paste parser (nguồn chính: Ctrl+A → Copy nội dung trang Schedule) ---- */

const DAY_LINE = /^(mon|tue|wed|thu|fri|sat|sun)/i;
const SESSION_LINE = /^sessions?\s+\d+$/i;
const TIME_RANGE = /(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/;

export interface ScheduleTextResult {
  weekStart: number | null;
  drafts: SessionDraft[];
  foundCards: number;
}

/** Parse văn bản COPY từ trang lịch học: header "MON 7", card "Session 9
06:45 – 09:10 · M2 + M3 · Lớp". */
export function parseScheduleText(text: string): ScheduleTextResult {
  const weekStartRaw = parseWeekRange(text);
  // chuẩn hoá: weekStart phải là Thứ Hai; nếu ngày đầu tuần khác (vd tôi copy từ
  // trang bắt đầu khác thứ hai) thì lùi về thứ hai gần nhất
  const weekStart = weekStartRaw ?? weekStartOf(Date.now());

  const seen = new Set<string>();
  const drafts: SessionDraft[] = [];
  let currentDay: number | null = null;
  let pendingTitle: string | null = null;
  let foundCards = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    if (SESSION_CARD_HINT.test(line)) {
      pendingTitle = line;
      continue;
    }
    const timeMatch = line.match(TIME_RANGE);
    if (timeMatch) {
      foundCards += 1;
      if (currentDay == null) {
        pendingTitle = null;
        continue; // không biết ngày → bỏ card
      }
      const card = parseSessionCard(`${pendingTitle ?? 'Buổi học'}\n${line}`);
      pendingTitle = null;
      if (!card) continue;
      const dayMidnight = weekStart + currentDay * 86_400_000;
      const start = dayMidnight + card.startMinutes * 60_000;
      const end = dayMidnight + card.endMinutes * 60_000;
      const startHour = new Date(start).getHours();
      if (startHour < 0 || startHour > 23 || end <= start) continue;
      const draft: SessionDraft = {
        courseName: card.courseName,
        title: card.title,
        start,
        end,
        rooms: card.rooms,
        weekStart: weekStartOf(start),
      };
      const id = sessionIdOf(draft);
      if (!seen.has(id)) {
        seen.add(id);
        drafts.push(draft);
      }
      continue;
    }
    // header cột ngày: "MON 7", "TUE 8", …
    if (DAY_LINE.test(line) && line.length <= 7 && /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(line)) {
      const key = line.slice(0, 3).toLowerCase();
      const dayIndex = NAMES[key];
      if (dayIndex !== undefined) {
        currentDay = dayIndex;
        pendingTitle = null;
      }
    }
  }

  return { weekStart, drafts, foundCards };
}

const NAMES: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const SESSION_CARD_HINT = /^sessions?\s+\d+$/i;

/** "MON"/"TUESDAY" → 0..6, hoặc null nếu không khớp. */
export function dayIndexFromName(name: string): number | null {
  const dayIndex = NAMES[name.trim().toLowerCase().slice(0, 3)];
  return dayIndex === undefined ? null : dayIndex;
}
