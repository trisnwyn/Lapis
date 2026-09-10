import Dexie, { type Table } from 'dexie';
import type {
  Chat,
  ChatMessage,
  Course,
  FileText,
  LmsSession,
  Material,
  Task,
} from './types';

export interface SettingsRow {
  key: string;
  value: unknown;
}

export class LapisDatabase extends Dexie {
  courses!: Table<Course, string>;
  tasks!: Table<Task, string>;
  materials!: Table<Material, string>;
  chats!: Table<Chat, string>;
  messages!: Table<ChatMessage, string>;
  lmsSessions!: Table<LmsSession, string>;
  settings!: Table<SettingsRow, string>;
  fileTexts!: Table<FileText, string>;

  constructor() {
    super('lapis');
    this.version(1).stores({
      courses: 'id, name, createdAt',
      tasks: 'id, courseId, dueDate, status, createdAt',
      materials: 'id, courseId, path',
      chats: 'id, courseId, createdAt',
      messages: 'id, chatId, createdAt',
      lmsSessions: 'id, start, weekStart, courseName',
      settings: 'key',
    });
    this.version(2).stores({
      fileTexts: 'materialId, courseId',
    });
  }
}

export const db = new LapisDatabase();

export function uid(): string {
  return crypto.randomUUID();
}
