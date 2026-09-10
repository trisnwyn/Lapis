import { db, uid } from '../db';
import type { Course } from '../types';

export interface CourseInput {
  name: string;
  color: string;
  lmsName?: string;
}

export async function createCourse(input: CourseInput): Promise<Course> {
  const course: Course = {
    id: uid(),
    name: input.name.trim(),
    color: input.color,
    lmsName: input.lmsName?.trim() || undefined,
    createdAt: Date.now(),
  };
  await db.courses.add(course);
  return course;
}

export async function updateCourse(
  id: string,
  patch: Partial<Pick<Course, 'name' | 'color' | 'lmsName'>>,
): Promise<void> {
  await db.courses.update(id, patch);
}

export async function setCourseFolder(
  id: string,
  folder: { handle: FileSystemDirectoryHandle; name: string } | null,
): Promise<void> {
  const course = await db.courses.get(id);
  if (!course) return;
  if (folder) {
    course.folderHandle = folder.handle;
    course.folderName = folder.name;
  } else {
    delete course.folderHandle;
    delete course.folderName;
  }
  await db.courses.put(course);
}

export async function deleteCourse(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.courses, db.tasks, db.materials, db.chats, db.messages],
    async () => {
      const chatIds = (await db.chats.where('courseId').equals(id).primaryKeys()) as string[];
      if (chatIds.length > 0) {
        await db.messages.where('chatId').anyOf(chatIds).delete();
      }
      await db.chats.where('courseId').equals(id).delete();
      await db.tasks.where('courseId').equals(id).delete();
      await db.materials.where('courseId').equals(id).delete();
      await db.courses.delete(id);
    },
  );
}
