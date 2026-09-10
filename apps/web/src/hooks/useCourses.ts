import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@lapis/core';
import type { Course } from '@lapis/core';

export function useCourses(): Course[] | undefined {
  return useLiveQuery(() => db.courses.orderBy('createdAt').toArray(), []);
}

export function useCourse(id: string | undefined): Course | undefined {
  return useLiveQuery(async () => (id ? db.courses.get(id) : undefined), [id]);
}

export function useTaskCount(courseId: string): number {
  return useLiveQuery(
    () => db.tasks.where('courseId').equals(courseId).count(),
    [courseId],
    0,
  ) ?? 0;
}
