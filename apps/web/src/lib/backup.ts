import { db } from '@lapis/core';

const TABLES = [
  'courses',
  'tasks',
  'materials',
  'chats',
  'messages',
  'lmsSessions',
  'fileTexts',
  'settings',
] as const;

type TableResult = {
  table: (name: string) => { toArray: () => Promise<unknown[]>; bulkPut: (rows: unknown[]) => Promise<unknown>; clear: () => Promise<void> };
};

export interface BackupFile {
  app: 'lapis';
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function exportBackup(): Promise<void> {
  const data: Record<string, unknown[]> = {};
  for (const name of TABLES) {
    data[name] = await db.table(name).toArray();
  }
  const payload: BackupFile = {
    app: 'lapis',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lapis-backup-${payload.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Xóa hết + nạp từ file backup. Trả về tổng số bản ghi đã nạp. */
export async function importBackup(file: File): Promise<number> {
  const parsed = JSON.parse(await file.text()) as BackupFile | null;
  if (!parsed || parsed.app !== 'lapis' || typeof parsed.data !== 'object' || parsed.data === null) {
    throw new Error('File backup không hợp lệ');
  }
  const data = parsed.data as Record<string, unknown[]>;
  let total = 0;
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLES) {
      const rows = Array.isArray(data[name]) ? (data[name] as unknown[]) : [];
      await db.table(name).clear();
      if (rows.length > 0) {
        await db.table(name).bulkPut(rows);
      }
      total += rows.length;
    }
  });
  return total;
}
