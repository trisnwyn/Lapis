import { db, uid } from '../db';
import { scanDirectory } from '../fs/directory';
import type { Material } from '../types';

/** Quét thư mục và thay toàn bộ chỉ mục materials của khóa học. */
export async function replaceCourseMaterials(
  courseId: string,
  root: FileSystemDirectoryHandle,
): Promise<number> {
  const scanned = await scanDirectory(root);
  const now = Date.now();
  await db.transaction('rw', db.materials, async () => {
    await db.materials.where('courseId').equals(courseId).delete();
    if (scanned.length > 0) {
      const rows: Material[] = scanned.map((f) => ({
        id: uid(),
        courseId,
        path: f.path,
        name: f.name,
        ext: f.ext,
        size: f.size,
        lastModified: f.lastModified,
        indexedAt: now,
      }));
      await db.materials.bulkAdd(rows);
    }
  });
  return scanned.length;
}

export async function clearCourseMaterials(courseId: string): Promise<void> {
  await db.materials.where('courseId').equals(courseId).delete();
}
