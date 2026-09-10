import type { Course } from '@lapis/core';
import { navigate } from '../router';
import { useTaskCount } from '../hooks/useCourses';
import { PencilIcon, TrashIcon } from './icons';
import { s } from '../strings';

interface CourseCardProps {
  course: Course;
  onEdit: (course: Course) => void;
  onDelete: (course: Course) => void;
}

export function CourseCard({ course, onEdit, onDelete }: CourseCardProps) {
  const taskCount = useTaskCount(course.id);

  return (
    <div className="group relative rounded-2xl border border-line bg-card p-5 transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => navigate(`/course/${course.id}`)}
        className="flex w-full items-start gap-3 text-left"
        aria-label={course.name}
      >
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: course.color }}
        />
        <span>
          <span className="block font-medium leading-snug text-ink">{course.name}</span>
          {course.lmsName ? (
            <span className="mt-0.5 block text-xs text-ink-soft">{course.lmsName}</span>
          ) : null}
        </span>
      </button>

      <div className="mt-8 flex items-center justify-between">
        <span className="text-xs text-ink-soft">
          {taskCount} {s.dashboard.tasksCount}
        </span>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => onEdit(course)}
            className="rounded-md p-1.5 text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent"
            aria-label={`${s.common.edit}: ${course.name}`}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            onClick={() => onDelete(course)}
            className="rounded-md p-1.5 text-ink-soft transition-colors hover:bg-red-50 hover:text-red-600"
            aria-label={`${s.common.remove}: ${course.name}`}
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
