// File System Access API — các phần chưa có trong lib.dom chuẩn của TypeScript.

export type FolderPermission = 'granted' | 'prompt' | 'denied';

interface PermissionDescriptorWithMode {
  mode?: 'read' | 'readwrite';
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
  interface FileSystemHandle {
    queryPermission?(
      descriptor?: PermissionDescriptorWithMode,
    ): Promise<{ state: FolderPermission }>;
    requestPermission?(
      descriptor?: PermissionDescriptorWithMode,
    ): Promise<{ state: FolderPermission }>;
  }
}

export async function isFileSystemAccessSupported(): Promise<boolean> {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Mở trình chọn thư mục. Trả về null nếu người dùng hủy hoặc trình duyệt không hỗ trợ. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ id: 'lapis-workspace', mode: 'readwrite' });
  } catch {
    return null;
  }
}

export async function queryPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<FolderPermission> {
  try {
    return (await handle.queryPermission?.({ mode }))?.state ?? 'prompt';
  } catch {
    return 'denied';
  }
}

/** Gọi trong ngữ cảnh user gesture (click). */
export async function requestPermission(
  handle: FileSystemDirectoryHandle,
  mode: 'read' | 'readwrite' = 'readwrite',
): Promise<FolderPermission> {
  try {
    return (await handle.requestPermission?.({ mode }))?.state ?? 'denied';
  } catch {
    return 'denied';
  }
}

export interface ScannedFile {
  path: string;
  name: string;
  ext: string;
  size: number;
  lastModified: number;
}

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.obsidian',
  '.trash',
  '.venv',
  '__pycache__',
]);
const MAX_DEPTH = 8;
const MAX_FILES = 5000;

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

interface WalkState {
  count: number;
}

async function* walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  depth: number,
  state: WalkState,
): AsyncGenerator<ScannedFile> {
  if (depth > MAX_DEPTH || state.count >= MAX_FILES) return;
  const entries = (
    dir as unknown as { entries(): AsyncIterableIterator<[string, FileSystemHandle]> }
  ).entries();
  for await (const [name, handle] of entries) {
    if (state.count >= MAX_FILES) return;
    if (name.startsWith('.')) continue;
    if (handle.kind === 'directory') {
      if (SKIP_DIR_NAMES.has(name)) continue;
      yield* walk(handle as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1, state);
    } else {
      const file = await (handle as FileSystemFileHandle).getFile();
      state.count += 1;
      yield {
        path: `${prefix}${name}`,
        name,
        ext: extOf(name),
        size: file.size,
        lastModified: file.lastModified,
      };
    }
  }
}

/** Quét đệ quy thư mục workspace, bỏ qua thư mục ẩn/rác. */
export async function scanDirectory(root: FileSystemDirectoryHandle): Promise<ScannedFile[]> {
  const out: ScannedFile[] = [];
  const state: WalkState = { count: 0 };
  for await (const file of walk(root, '', 0, state)) {
    out.push(file);
  }
  return out;
}
