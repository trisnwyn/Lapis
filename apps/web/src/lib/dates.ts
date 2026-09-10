export function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Thứ Hai của tuần chứa ngày cho trước (epoch ms). */
export function startOfWeek(date: Date | number = new Date()): number {
  const d = new Date(date);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function formatShortDate(epochMs: number): string {
  const d = new Date(epochMs);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

export function formatWeekRange(weekStartMs: number): string {
  const start = new Date(weekStartMs);
  const end = new Date(weekStartMs);
  end.setDate(end.getDate() + 6);
  return `${formatShortDate(start.getTime())} – ${formatShortDate(end.getTime())}`;
}
