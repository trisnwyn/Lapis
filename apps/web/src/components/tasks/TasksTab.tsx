import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteTask, updateTask, type Course, type Task } from '@lapis/core';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { TaskDialog } from './TaskDialog';
import {
  BookIcon,
  CheckIcon,
  ChevronDownIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '../icons';
import { formatShortDate, startOfToday } from '../../lib/dates';
import { s } from '../../strings';

export function TasksTab({ course }: { course: Course }) {
  const [view, setView] = useState<'open' | 'done'>('open');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Task | undefined>(undefined);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const tasks =
    useLiveQuery(() => db.tasks.where('courseId').equals(course.id).toArray(), [course.id]) ?? [];

  const sorted = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const ad = a.dueDate ?? Number.MAX_SAFE_INTEGER;
      const bd = b.dueDate ?? Number.MAX_SAFE_INTEGER;
      return ad - bd || b.createdAt - a.createdAt;
    });
  }, [tasks]);

  const openCount = tasks.filter((t) => t.status !== 'done').length;
  const doneCount = tasks.length - openCount;
  const shown = sorted.filter((t) => (view === 'done' ? t.status === 'done' : t.status !== 'done'));

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border border-line bg-card p-1">
          <SegmentButton
            active={view === 'open'}
            onClick={() => setView('open')}
            label={s.course.tasksTab.open}
            count={openCount}
          />
          <SegmentButton
            active={view === 'done'}
            onClick={() => setView('done')}
            label={s.course.tasksTab.done}
            count={doneCount}
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(undefined);
            setDialogOpen(true);
          }}
        >
          <PlusIcon /> {s.course.tasksTab.add}
        </Button>
      </div>

      <div className="mt-4 space-y-2">
        {shown.length === 0 ? (
          <EmptyState
            icon={<BookIcon width={20} height={20} />}
            title={s.course.tasksTab.empty}
            hint={s.course.tasksTab.emptyHint}
          />
        ) : (
          shown.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={() => updateTask(task.id, { status: task.status === 'done' ? 'todo' : 'done' })}
              onToggleSub={(subId) =>
                updateTask(task.id, {
                  subtasks: task.subtasks.map((sub) =>
                    sub.id === subId ? { ...sub, done: !sub.done } : sub,
                  ),
                })
              }
              onEdit={() => {
                setEditing(task);
                setDialogOpen(true);
              }}
              confirming={confirmingId === task.id}
              onAskDelete={() => setConfirmingId(task.id)}
              onCancelDelete={() => setConfirmingId(null)}
              onDelete={async () => {
                await deleteTask(task.id);
                setConfirmingId(null);
              }}
            />
          ))
        )}
      </div>

      <TaskDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        course={course}
        task={editing}
      />
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {label} ({count})
    </button>
  );
}

interface TaskItemProps {
  task: Task;
  onToggle: () => void;
  onToggleSub: (subId: string) => void;
  onEdit: () => void;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

function TaskItem({
  task,
  onToggle,
  onToggleSub,
  onEdit,
  confirming,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: TaskItemProps) {
  const [expanded, setExpanded] = useState(false);
  const done = task.status === 'done';
  const overdue = task.dueDate != null && task.dueDate < startOfToday() && !done;
  const doneSubs = task.subtasks.filter((x) => x.done).length;

  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={done ? 'Mở lại' : 'Hoàn thành'}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            done ? 'border-accent bg-accent text-white' : 'border-stone-300 hover:border-accent'
          }`}
        >
          {done ? <CheckIcon width={12} height={12} /> : null}
        </button>

        <button
          type="button"
          onClick={onEdit}
          title={s.course.tasksTab.editHint}
          className={`min-w-0 flex-1 truncate text-left text-sm transition-colors hover:text-accent ${
            done ? 'text-ink-soft line-through' : 'text-ink'
          }`}
        >
          {task.title}
        </button>

        {task.source !== 'manual' ? (
          <span className="shrink-0 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase text-accent">
            {task.source}
          </span>
        ) : null}

        {task.subtasks.length > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-soft transition-colors hover:bg-paper hover:text-ink"
            aria-expanded={expanded}
          >
            {doneSubs}/{task.subtasks.length}
            <ChevronDownIcon
              width={12}
              height={12}
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        ) : null}

        {task.dueDate != null ? (
          <span
            className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${
              overdue ? 'bg-red-50 text-red-600' : 'bg-paper text-ink-soft'
            }`}
          >
            {overdue ? `${s.taskDialog.overdue} · ` : ''}
            {formatShortDate(task.dueDate)}
          </span>
        ) : null}

        {confirming ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="danger" size="sm" onClick={onDelete}>
              {s.taskDelete.confirm}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancelDelete} aria-label={s.common.cancel}>
              <XIcon />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onAskDelete}
            className="shrink-0 rounded-md p-1.5 text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label={`${s.common.remove}: ${task.title}`}
          >
            <TrashIcon />
          </button>
        )}
      </div>

      {expanded && task.subtasks.length > 0 ? (
        <ul className="ml-2.5 mt-3 space-y-1.5 border-l-2 border-line pl-4">
          {task.subtasks.map((sub) => (
            <li key={sub.id} className="flex items-center gap-2 text-sm">
              <button
                type="button"
                onClick={() => onToggleSub(sub.id)}
                aria-label={sub.done ? 'Bỏ hoàn thành' : 'Hoàn thành việc con'}
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  sub.done ? 'border-accent bg-accent text-white' : 'border-stone-300 hover:border-accent'
                }`}
              >
                {sub.done ? <CheckIcon width={10} height={10} /> : null}
              </button>
              <span className={sub.done ? 'text-ink-soft line-through' : 'text-ink'}>
                {sub.title}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
