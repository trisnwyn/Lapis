import { db } from './db';
import type { AppSettings } from './types';

const SETTINGS_KEY = 'app';

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'openai/gpt-4o-mini',
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.settings.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...((row?.value as AppSettings) ?? {}) };
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await getSettings();
    await db.settings.put({ key: SETTINGS_KEY, value: { ...current, ...patch } });
  });
}
