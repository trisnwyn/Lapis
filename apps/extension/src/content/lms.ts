// Isolated world: relay capture từ MAIN world + SSR scan + DOM grid scrape.

import {
  isValidDraft,
  parseSessionCard,
  parseWeekRange,
  sessionIdOf,
  weekStartOf,
  type SessionDraft,
} from '@lapis/lms-vcbi';

interface CaptureMessage {
  source?: string;
  kind?: string;
  url?: string;
  payload?: unknown;
}

const IS_VJCB = /(^|\.)vjcbi\.study$/.test(location.hostname);

function relay(json: unknown, url: string): void {
  chrome.runtime.sendMessage(
    { type: 'lapis:capture-json', url, payload: json },
    () => void chrome.runtime.lastError,
  );
}

function relayDom(drafts: SessionDraft[]): void {
  chrome.runtime.sendMessage(
    { type: 'lapis:capture-dom', url: location.href, payload: drafts },
    () => void chrome.runtime.lastError,
  );
}

/* ---------- Nhánh 1: relay JSON bắt được ở MAIN world (fetch/XHR patch) ---------- */

window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  const data = event.data as CaptureMessage | null;
  if (!data || data.source !== 'lapis-injected' || data.kind !== 'http') return;
  relay(data.payload, data.url ?? location.href);
});

/* ---------- Nhánh 2: JSON nhúng sẵn trong trang (SSR/state) ---------- */

function scanEmbeddedJson(): void {
  const scripts = document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__');
  let sent = 0;
  for (const script of scripts) {
    const text = script.textContent ?? '';
    if (text.length < 20 || text.length > 500_000) continue;
    try {
      relay(JSON.parse(text) as unknown, `${location.href}#embedded`);
      sent += 1;
    } catch {
      // không parse được
    }
    if (sent >= 12) break;
  }
}

/* ---------- Nhánh 3: DOM grid scrape ---------- */

const DAY_HEADER = /^(mon|tue|wed|thu|fri|sat|sun)(day|nesday|rsday|urday|sday)?(?:\s*\d{0,2})?(?:\s*(?:w\d+))?\.?$/i;
const NAMES: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };
const TIME_RANGE = /\d{1,2}:\d{2}\s*[—–-]\s*\d{1,2}:\d{2}/;

/** Leaf card thường chỉ chứa "Session N" — leo lên ancestor cho tới khi đến khoảng thời gian. */
function resolveCardText(el: Element): string | null {
  if (TIME_RANGE.test(el.textContent ?? '')) return el.textContent ?? null;
  let node = el.parentElement;
  for (let depth = 0; depth < 4 && node; depth++) {
    if (TIME_RANGE.test(node.textContent ?? '')) return node.innerText;
    node = node.parentElement;
  }
  return null;
}

interface GridCard {
  element: Element;
  card: NonNullable<ReturnType<typeof parseSessionCard>>;
  centerX: number;
}

function collectGridCards(): GridCard[] {
  const candidates = Array.from(document.querySelectorAll('div, li, article, td, a, span'));
  const matched = candidates.filter((el) => /^sessions?\s+\d+/im.test((el.textContent ?? '').trim()));
  const leaves = matched.filter(
    (el) => !matched.some((other) => other !== el && el.contains(other)),
  );
  const seenText = new Set<string>();
  const cards: GridCard[] = [];
  for (const el of leaves) {
    const cardText = resolveCardText(el);
    if (!cardText) continue;
    const card = parseSessionCard(cardText);
    if (!card) continue;
    const fingerprint = `${card.title}|${card.startMinutes}|${card.courseName}`.toLowerCase();
    if (seenText.has(fingerprint)) continue;
    seenText.add(fingerprint);
    const rect = el.getBoundingClientRect();
    cards.push({ element: el, card, centerX: rect.left + rect.width / 2 });
  }
  return cards;
}

interface DayHeader {
  dayIndex: number;
  centerX: number;
}

function findDayHeaders(): DayHeader[] {
  const headers: DayHeader[] = [];
  for (const el of Array.from(document.querySelectorAll('th, div, span'))) {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!DAY_HEADER.test(text) || text.length > 12) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) continue;
    const dayIndex = NAMES[text.toLowerCase().replace(/[^\p{L}]/gu, '').slice(0, 3)];
    if (dayIndex === undefined) continue;
    headers.push({ dayIndex, centerX: rect.left + rect.width / 2 });
  }
  return headers;
}

function plausibleDom(start: number, end: number): boolean {
  const startHour = new Date(start).getHours();
  return (
    startHour >= 4 && startHour <= 22 && end > start && end - start <= 8 * 3_600_000
  );
}

function scrapeGrid(): SessionDraft[] {
  const pageWeekStart = parseWeekRange(document.body?.innerText ?? '');
  const cards = collectGridCards();
  if (cards.length === 0) return [];
  let headers = findDayHeaders();
  if (headers.length < 3) return []; // không xác định được cột → không gán ngày bừa

  const weekStart = pageWeekStart ?? weekStartOf(Date.now());
  const seen = new Set<string>();
  const drafts: SessionDraft[] = [];

  for (const { card, centerX } of cards) {
    let best: DayHeader | null = null;
    let bestDist = Infinity;
    for (const header of headers) {
      const dist = Math.abs(header.centerX - centerX);
      if (dist < bestDist) {
        bestDist = dist;
        best = header;
      }
    }
    if (!best) continue;
    const dayMidnight = weekStart + best.dayIndex * 86_400_000;
    const start = dayMidnight + card.startMinutes * 60_000;
    const end = dayMidnight + card.endMinutes * 60_000;
    if (!plausibleDom(start, end)) continue;
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
  }
  return drafts.filter(isValidDraft);
}

let lastFingerprint = '';

function autoCapture(): void {
  scanEmbeddedJson();
  const drafts = scrapeGrid();
  const fingerprint = [...drafts.map((d) => sessionIdOf(d))].sort().join('|');
  if (drafts.length > 0 && fingerprint !== lastFingerprint) {
    lastFingerprint = fingerprint;
    relayDom(drafts);
  }
}

function countEmbeddedScripts(): number {
  return document.querySelectorAll('script[type="application/json"], script#__NEXT_DATA__').length;
}

// auto chạy ngay (content script inject ở document_idle — 'load' đã nổ rồi,
// neo vào load sẽ khiến interval KHÔNG BAO GIỜ khởi động)
function autoCaptureVjcbi(): void {
  if (!IS_VJCB) return;
  autoCapture();
}
window.setTimeout(autoCaptureVjcbi, 1500);
window.setInterval(autoCaptureVjcbi, 8000);

/* ---------- Popup trigger ---------- */

/** OuterHTML vùng nhỏ nhất chứa mọi card (phục vụ chẩn đoán + siết parser). */
function scheduleRegionHtml(maxLength = 100_000): string | null {
  const cards = collectGridCards();
  if (cards.length < 2) return null;
  let node: Element | null = (cards[0] as GridCard).element ?? null;
  while (node && node !== document.body) {
    const covered = cards.filter((c) => node && node.contains(c.element)).length;
    if (covered >= cards.length) return node.outerHTML.slice(0, maxLength);
    if (node.parentElement) node = node.parentElement;
    else return null;
  }
  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const typed = msg as { type?: string } | undefined;
  if (typed?.type === 'lapis:scrape-now') {
    scanEmbeddedJson();
    const drafts = scrapeGrid();
    if (drafts.length > 0) relayDom(drafts);
    const diag = {
      cards: collectGridCards().length,
      headers: findDayHeaders().length,
      embedded: countEmbeddedScripts(),
      drafts: drafts.length,
      regionHtml: scheduleRegionHtml(),
    };
    console.debug('[Lapis] scrape-now:', { ...diag, regionHtml: diag.regionHtml?.length });
    sendResponse({ ok: true, ...diag, via: drafts.length > 0 ? 'dom' : 'none' });
  }
  return true;
});
