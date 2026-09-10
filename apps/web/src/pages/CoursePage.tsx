import { useState } from 'react';
import type { Course } from '@lapis/core';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { CourseDialog } from '../components/CourseDialog';
import { TasksTab } from '../components/tasks/TasksTab';
import { MaterialsTab } from '../components/materials/MaterialsTab';
import { ChatTab } from '../components/chat/ChatTab';
import { useCourse } from '../hooks/useCourses';
import { useCourseFolder } from '../hooks/useCourseFolder';
import {
  ChevronLeftIcon,
  FolderIcon,
  PencilIcon,
} from '../components/icons';
import { navigate } from '../router';
import { s } from '../strings';

const TABS = ['tasks', 'materials', 'chat'] as const;
type Tab = (typeof TABS)[number];

export function CoursePage({ id, onOpenSettings }: { id: string; onOpenSettings: () => void }) {
  const course: Course | undefined = useCourse(id);
  const [tab, setTab] = useState<Tab>('tasks');
  const [editOpen, setEditOpen] = useState(false);
  const folder = useCourseFolder(course ?? { id: '', name: '', color: '', createdAt: 0 });

  if (!course) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm text-ink-soft">…</p>
      </div>
    );
  }

  const tabLabels: Record<Tab, string> = {
    tasks: s.course.tasks,
    materials: s.course.materials,
    chat: s.course.chat,
  };

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-10">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1 text-sm text-ink-soft transition-colors hover:text-accent"
      >
        <ChevronLeftIcon /> {s.course.back}
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="h-4 w-4 rounded-full" style={{ backgroundColor: course.color }} />
          <h1 className="font-display text-3xl font-semibold text-ink">{course.name}</h1>
          {folder.hasFolder && folder.perm === 'granted' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
              <FolderIcon width={12} height={12} /> {course.folderName}
            </span>
          ) : null}
        </div>
        <div className="flex gap-2">
          {!folder.hasFolder ? (
            <Button variant="secondary" size="sm" onClick={folder.connect}>
              <FolderIcon /> {s.course.materialsTab.connect}
            </Button>
          ) : folder.perm === 'prompt' ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={folder.grant}
              className="border-amber-300 text-amber-700"
            >
              <FolderIcon /> {s.course.reconnectFolder}
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <PencilIcon /> {s.course.edit}
          </Button>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-line" role="tablist">
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-ink-soft hover:text-ink'
              }`}
            >
              {tabLabels[t]}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {tab === 'tasks' ? (
          <TasksTab course={course} />
        ) : tab === 'materials' ? (
          <MaterialsTab course={course} folder={folder} />
        ) : (
          <ChatTab course={course} hasFolder={folder.hasFolder} onOpenSettings={onOpenSettings} />
        )}
      </div>

      <CourseDialog open={editOpen} onClose={() => setEditOpen(false)} course={course} />
    </div>
  );
}
