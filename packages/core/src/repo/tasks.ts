import { db, uid } from '../db';
import type { Task } from '../types';

export interface TaskInput {
  courseId: string;
  title: string;
  dueDate?: number;
  subtasks?: Array<{ title: string }>;
  source?: Task['source'];
}

export async function createTask(input: TaskInput): Promise<Task> {
  const now = Date.now();
  const task: Task = {
    id: uid(),
    courseId: input.courseId,
    title: input.title.trim(),
    dueDate: input.dueDate,
    status: 'todo',
    subtasks: (input.subtasks ?? []).map((s) => ({ id: uid(), title: s.title, done: false })),
    source: input.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
  };
  await db.tasks.add(task);
  return task;
}

export async function updateTask(
  id: string,
  patch: Partial<Omit<Task, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.tasks.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteTask(id: string): Promise<void> {
  await db.tasks.delete(id);
}
