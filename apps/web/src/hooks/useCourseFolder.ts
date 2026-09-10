import { useCallback, useEffect, useState } from 'react';
import {
  clearCourseMaterials,
  isFileSystemAccessSupported,
  pickDirectory,
  queryPermission,
  replaceCourseMaterials,
  requestPermission,
  setCourseFolder,
  type Course,
  type FolderPermission,
} from '@lapis/core';

export interface CourseFolder {
  hasFolder: boolean;
  perm: FolderPermission | null;
  scanning: boolean;
  unsupported: boolean;
  connect: () => Promise<void>;
  grant: () => Promise<void>;
  rescan: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useCourseFolder(course: Course): CourseFolder {
  const [perm, setPerm] = useState<FolderPermission | null>(null);
  const [scanning, setScanning] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const handle = course.folderHandle;

  const refreshPerm = useCallback(async () => {
    if (!handle) {
      setPerm(null);
      return;
    }
    setPerm(await queryPermission(handle));
  }, [handle]);

  useEffect(() => {
    void refreshPerm();
  }, [refreshPerm]);

  const scan = useCallback(
    async (h: FileSystemDirectoryHandle) => {
      setScanning(true);
      try {
        await replaceCourseMaterials(course.id, h);
        setPerm('granted');
      } catch {
        setPerm('denied');
      } finally {
        setScanning(false);
      }
    },
    [course.id],
  );

  const connect = useCallback(async () => {
    if (!(await isFileSystemAccessSupported())) {
      setUnsupported(true);
      return;
    }
    const picked = await pickDirectory();
    if (!picked) return;
    await setCourseFolder(course.id, { handle: picked, name: picked.name });
    await scan(picked);
  }, [course.id, scan]);

  const grant = useCallback(async () => {
    if (!handle) return;
    const state = await requestPermission(handle);
    setPerm(state);
    if (state === 'granted') await scan(handle);
  }, [handle, scan]);

  const rescan = useCallback(async () => {
    if (handle) await scan(handle);
  }, [handle, scan]);

  const disconnect = useCallback(async () => {
    await setCourseFolder(course.id, null);
    await clearCourseMaterials(course.id);
    setPerm(null);
  }, [course.id]);

  return {
    hasFolder: Boolean(handle),
    perm,
    scanning,
    unsupported,
    connect,
    grant,
    rescan,
    disconnect,
  };
}
