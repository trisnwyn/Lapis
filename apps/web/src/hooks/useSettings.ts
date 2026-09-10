import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings, saveSettings, type AppSettings } from '@lapis/core';

export function useSettings(): {
  settings: AppSettings | undefined;
  save: (patch: Partial<AppSettings>) => Promise<void>;
} {
  const settings = useLiveQuery(() => getSettings(), []);
  return { settings, save: saveSettings };
}
