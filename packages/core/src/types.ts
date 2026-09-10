export type TaskStatus = 'todo' | 'doing' | 'done';
export type TaskSource = 'manual' | 'ai' | 'lms';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Course {
  id: string;
  name: string;
  color: string;
  lmsName?: string;
  folderHandle?: FileSystemDirectoryHandle;
  folderName?: string;
  createdAt: number;
}

export interface Task {
  id: string;
  courseId: string;
  title: string;
  dueDate?: number;
  status: TaskStatus;
  subtasks: Subtask[];
  source: TaskSource;
  createdAt: number;
  updatedAt: number;
}

export interface Material {
  id: string;
  courseId: string;
  path: string;
  name: string;
  ext: string;
  size: number;
  lastModified: number;
  summary?: string;
  textLen?: number;
  indexedAt?: number;
}

export interface Chat {
  id: string;
  courseId: string;
  title: string;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: number;
}

export interface LmsSession {
  id: string;
  courseName: string;
  title: string;
  start: number;
  end: number;
  rooms?: string;
  weekStart: number;
  capturedAt: number;
}

export interface FileText {
  materialId: string;
  courseId: string;
  text: string;
  lastModified: number;
  size: number;
  extractedAt: number;
}

export interface AppSettings {
  openrouterKey?: string;
  model?: string;
  semesterStart?: string;
  googleClientId?: string;
}
