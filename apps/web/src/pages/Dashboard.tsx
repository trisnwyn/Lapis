import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type AppSettings, type Course } from '@lapis/core';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { CourseCard } from '../components/CourseCard';
import { CourseDialog } from '../components/CourseDialog';
import { DeleteCourseDialog } from '../components/DeleteCourseDialog';
import { ImportScheduleDialog } from '../components/lms/ImportScheduleDialog';
import { BookIcon, CalendarIcon, ClockIcon, AlertIcon, PlusIcon } from '../components/icons';
import { useCourses } from '../hooks/useCourses';
import { formatShortDate, formatWeekRange, startOfToday, startOfWeek } from '../lib/dates';
import { exportWeekIcs, googleCalendarLink } from '../lib/ics';
import { getClientId, requestGcalToken, syncSessionsToGcal } from '../lib/gcal';
import { s } from '../strings';

interface DashboardProps {
  settings: AppSettings | undefined;
  onOpenSettings: () => void;
}

export function Dashboard({ settings, onOpenSettings }: DashboardProps) {
  const courses = useCourses();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Course | undefined>(undefined);
  const [deleting, setDeleting] = useState<Course | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [gcalState, setGcalState] = useState<
    { kind: 'idle' | 'syncing' } | { kind: 'ok'; created: number; skipped: number; failed: number } | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const syncGcalWeek = async () => {
    if (!getClientId(settings?.googleClientId)) {
      onOpenSettings();
      return;
    }
    setGcalState({ kind: 'syncing' });
    try {
      const rows = await db.lmsSessions.where('weekStart').equals(viewWeekStart).toArray();
      const result = await syncSessionsToGcal(
        rows,
        await requestGcalToken(settings?.googleClientId),
      );
      setGcalState({ kind: 'ok', ...result });
    } catch (e) {
      setGcalState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const weekStart = startOfWeek();
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const viewWeekStart = selectedWeek ?? weekStart;

  const allSessions = useLiveQuery(
    () => db.lmsSessions.orderBy('weekStart').toArray(),
    [],
    [],
  );
  const weekOptions = useLiveQuery(() => {
    // danh sách tuần có lịch — nhớ tuần hiện tại luôn có sẵn
    const all = new Set<number>([startOfWeek()]);
    for (const item of allSessions ?? []) all.add(item.weekStart);
    return [...all].sort((a, b) => b - a);
  }, [allSessions], [startOfWeek()]);

  const sessions = useLiveQuery(
    () => db.lmsSessions.where('weekStart').equals(viewWeekStart).toArray(),
    [viewWeekStart],
    [],
  );
  const weekHours =
    (sessions ?? []).reduce((acc, item) => acc + (item.end - item.start) / 3_600_000, 0) ?? 0;

  const todayKey = new Date().toDateString();
  const tomorrowKey = new Date(Date.now() + 86_400_000).toDateString();
  const dayRange = useLiveQuery(async () => {
    const rows = await db.lmsSessions.toArray();
    const today = new Date().toDateString();
    const tomorrow = tomorrowKey;
    const onThatDay = (item: { start: number }, target: string) =>
      new Date(item.start).toDateString() === target;
    return {
      today: rows.filter((row) => onThatDay(row, today)).sort((a, b) => a.start - b.start),
      tomorrow: rows.filter((row) => onThatDay(row, tomorrow)).sort((a, b) => a.start - b.start),
    };
  }, [tomorrowKey]);
  const todaySessions = dayRange?.today ?? [];
  const tomorrowSessions = dayRange?.tomorrow ?? [];
  void todayKey;

  const deadlineInfo = useLiveQuery(async () => {
    const today = startOfToday();
    const open = await db.tasks
      .filter((t) => t.dueDate != null && t.status !== 'done')
      .toArray();
    const upcoming = open
      .filter((t) => (t.dueDate ?? 0) >= today)
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
      .slice(0, 4);
    const overdue = open.filter((t) => (t.dueDate ?? 0) < today).length;
    return { upcoming, overdue };
  }, []);

  const hasKey = Boolean(settings?.openrouterKey);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-soft">
        {s.dashboard.eyebrow}
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold text-ink">
        {s.dashboard.titleA} <em className="italic text-accent">{s.dashboard.titleB}</em>
      </h1>

      {!hasKey ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-900">{s.settings.missingKeyBanner}</p>
          <Button variant="secondary" size="sm" onClick={onOpenSettings}>
            {s.settings.openSettings}
          </Button>
        </div>
      ) : null}

      <div className="mt-8 space-y-4">
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <ClockIcon className="text-accent" /> {s.dashboard.today}
            </h2>
            <span className="text-xs text-ink-soft">
              {new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' }).format(new Date())}
            </span>
          </div>
          {todaySessions && todaySessions.length > 0 ? (
            <ul className="mt-4 divide-y divide-line">
              {todaySessions.map((session) => (
                <DaySessionRow key={session.id} session={session} withGoogleLink />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              {s.dashboard.todayEmpty}
            </p>
          )}
          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs font-semibold text-ink-soft">{s.dashboard.tomorrow}</p>
            {tomorrowSessions.length > 0 ? (
              <ul className="mt-2 divide-y divide-line">
                {tomorrowSessions.map((session) => (
                  <DaySessionRow key={session.id} session={session} />
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                {s.dashboard.tomorrowEmpty}
              </p>
            )}
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
              <CalendarIcon className="text-accent" /> {s.dashboard.thisWeek}
            </h2>
            <div className="flex items-center gap-2">
              <select
                value={viewWeekStart}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                aria-label={s.dashboard.thisWeek}
                className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-ink-soft focus:border-accent focus:outline-none"
              >
                {(weekOptions ?? [viewWeekStart]).map((option) => (
                  <option key={option} value={option}>
                    {formatWeekRange(option)}
                    {option === weekStart ? ` — ${s.dashboard.currentWeek}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {sessions && sessions.length > 0 ? (
            <div className="mt-5 flex items-baseline gap-6">
              <p className="font-display text-3xl font-semibold text-ink">
                {sessions.length}
                <span className="ml-1.5 text-sm font-normal text-ink-soft">
                  {s.dashboard.sessions}
                </span>
              </p>
              <p className="font-display text-3xl font-semibold text-ink">
                {Math.round(weekHours)}
                <span className="ml-1.5 text-sm font-normal text-ink-soft">
                  {s.dashboard.hours}
                </span>
              </p>
            </div>
          ) : sessions ? (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              {s.dashboard.thisWeekEmpty}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              {s.dashboard.sync}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void syncGcalWeek()}
              disabled={gcalState.kind === 'syncing' || !sessions || sessions.length === 0}
            >
              {gcalState.kind === 'syncing' ? s.gcal.syncing : s.gcal.syncWeek}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void exportWeekIcs(viewWeekStart)}
              title={s.dashboard.exportWeekIcs}
            >
              {s.dashboard.exportWeekIcs}
            </Button>
          </div>
          {gcalState.kind === 'ok' ? (
            <p className="mt-2 text-xs font-medium text-emerald-700">
              {s.gcal.done
                .replace('{n}', String(gcalState.created))
                .replace('{s}', String(gcalState.skipped))
                .replace('{f}', String(gcalState.failed))}
            </p>
          ) : null}
          {gcalState.kind === 'error' ? (
            <p className="mt-2 text-xs font-medium text-red-600">{gcalState.message}</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-card p-5">
          <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
            <ClockIcon className="text-accent" /> {s.dashboard.upcoming}
          </h2>
          {deadlineInfo && deadlineInfo.overdue > 0 ? (
            <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertIcon /> {deadlineInfo.overdue} {s.dashboard.overdue}
            </p>
          ) : null}
          {deadlineInfo && deadlineInfo.upcoming.length > 0 ? (
            <ul className="mt-4 space-y-2.5">
              {deadlineInfo.upcoming.map((task) => (
                <li key={task.id} className="flex items-center gap-2.5 text-sm">
                  <TaskDot courseId={task.courseId} />
                  <span className="truncate text-ink">{task.title}</span>
                  <span className="ml-auto shrink-0 text-xs text-ink-soft">
                    {formatShortDate(task.dueDate ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              {s.dashboard.upcomingEmpty}
            </p>
          )}
        </section>
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="font-display text-2xl font-semibold text-ink">
          {s.dashboard.courses}
          {courses && courses.length > 0 ? (
            <span className="ml-2 align-middle text-sm font-normal text-ink-soft">
              {courses.length}
            </span>
          ) : null}
        </h2>
        <Button size="sm" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
          <PlusIcon /> {s.dashboard.addCourse}
        </Button>
      </div>

      {courses && courses.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onEdit={(c) => { setEditing(c); setDialogOpen(true); }}
              onDelete={(c) => setDeleting(c)}
            />
          ))}
        </div>
      ) : courses ? (
        <div className="mt-5">
          <EmptyState
            icon={<BookIcon width={20} height={20} />}
            title={s.dashboard.noCourses}
            hint={s.dashboard.noCoursesHint}
          />
        </div>
      ) : null}

      <CourseDialog open={dialogOpen} onClose={() => setDialogOpen(false)} course={editing} />
      {deleting ? (
        <DeleteCourseDialog
          open
          onClose={() => setDeleting(undefined)}
          course={deleting}
        />
      ) : null}
      <ImportScheduleDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function TaskDot({ courseId }: { courseId: string }) {
  const course = useLiveQuery(() => db.courses.get(courseId), [courseId]);
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: course?.color ?? '#a8a29e' }}
    />
  );
}

function SessionCourseDot({ courseName }: { courseName: string }) {
  const course = useLiveQuery(
    () => db.courses.where('name').equals(courseName).first(),
    [courseName],
  );
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: course?.color ?? '#a8a29e' }}
    />
  );
}

interface LmsSessionRow {
  id: string;
  courseName: string;
  title: string;
  start: number;
  end: number;
  rooms?: string;
  weekStart: number;
  capturedAt: number;
}

function DaySessionRow({ session, withGoogleLink = false }: { session: LmsSessionRow; withGoogleLink?: boolean }) {
  const titleNode = withGoogleLink ? (
    <a
      href={googleCalendarLink(session)}
      target="_blank"
      rel="noreferrer"
      title="Thêm vào Google Calendar"
      className="ml-auto shrink-0 text-xs text-ink-soft transition-colors hover:text-accent"
    >
      {session.title}
    </a>
  ) : (
    <span className="ml-auto shrink-0 text-xs text-ink-soft">{session.title}</span>
  );
  return (
    <li className="flex items-center gap-3 py-2.5 text-sm">
      <span className="w-28 shrink-0 font-mono text-xs text-ink-soft">
        {timePair(session.start, session.end)}
      </span>
      <SessionCourseDot courseName={session.courseName} />
      <span className="truncate font-medium text-ink">{session.courseName}</span>
      {session.rooms ? (
        <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent">
          {session.rooms}
        </span>
      ) : null}
      {titleNode}
    </li>
  );
}

function timePair(start: number, end: number): string {
  const label = (epochMs: number) => {
    const d = new Date(epochMs);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  return `${label(start)} – ${label(end)}`;
}
