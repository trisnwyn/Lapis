import { useEffect, useRef, useState } from 'react';
import { verifyOpenRouterKey, type AppSettings } from '@lapis/core';
import { exportBackup, importBackup } from '../lib/backup';
import { exportAllIcs } from '../lib/ics';
import { getClientId, requestGcalToken, syncSessionsToGcal } from '../lib/gcal';
import { db } from '@lapis/core';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Dialog } from './ui/Dialog';
import { CheckIcon, AlertIcon } from './icons';
import { s } from '../strings';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings | undefined;
  onSave: (patch: Partial<AppSettings>) => Promise<void>;
}

type TestStatus =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; label?: string }
  | { kind: 'invalid' }
  | { kind: 'network' };

type GcalStatus =
  | { kind: 'idle' }
  | { kind: 'syncing' }
  | { kind: 'ok'; created: number; skipped: number; failed: number }
  | { kind: 'error'; message: string };

type BackupStatus =
  | { kind: 'idle' }
  | { kind: 'exported' }
  | { kind: 'ics'; count: number }
  | { kind: 'imported'; count: number }
  | { kind: 'error'; message: string };

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function SettingsModal({ open, onClose, settings, onSave }: SettingsModalProps) {
  const [key, setKey] = useState('');
  const [model, setModel] = useState('');
  const [semester, setSemester] = useState('');
  const [status, setStatus] = useState<TestStatus>({ kind: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [backupStatus, setBackupStatus] = useState<BackupStatus>({ kind: 'idle' });
  const [gcalClientId, setGcalClientId] = useState('');
  const [gcalStatus, setGcalStatus] = useState<GcalStatus>({ kind: 'idle' });
  const backupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setKey(settings?.openrouterKey ?? '');
      setModel(settings?.model ?? 'openai/gpt-4o-mini');
      setSemester(settings?.semesterStart ?? '');
      setGcalClientId(settings?.googleClientId ?? '');
      setStatus({ kind: 'idle' });
      setBackupStatus({ kind: 'idle' });
      setGcalStatus({ kind: 'idle' });
      setSaved(false);
    }
  }, [open, settings]);

  const testKey = async () => {
    if (!key.trim()) return;
    setStatus({ kind: 'testing' });
    const result = await verifyOpenRouterKey(key);
    if (result.ok) setStatus({ kind: 'ok', label: result.label });
    else if (result.error === 'invalid') setStatus({ kind: 'invalid' });
    else setStatus({ kind: 'network' });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        openrouterKey: key.trim() || undefined,
        model: model.trim() || undefined,
        semesterStart: semester || undefined,
        googleClientId: gcalClientId.trim() || undefined,
      });
      setSaved(true);
      window.setTimeout(onClose, 600);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={s.settings.title} width="max-w-lg">
      <div className="space-y-5">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-ink">{s.settings.aiSection}</h3>
          <div className="space-y-4">
            <div>
              <Label htmlFor="settings-key">{s.settings.apiKeyLabel}</Label>
              <Input
                id="settings-key"
                type="password"
                autoComplete="off"
                placeholder={s.settings.apiKeyPlaceholder}
                value={key}
                onChange={(e) => {
                  setKey(e.target.value);
                  setStatus({ kind: 'idle' });
                }}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{s.settings.apiKeyHint}</p>
              <div className="mt-2 flex items-center gap-3">
                <Button variant="secondary" size="sm" onClick={testKey} disabled={!key.trim() || status.kind === 'testing'}>
                  {status.kind === 'testing' ? s.settings.testing : s.settings.test}
                </Button>
                {status.kind === 'ok' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckIcon /> {s.settings.keyOk}
                  </span>
                ) : null}
                {status.kind === 'invalid' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertIcon /> {s.settings.keyInvalid}
                  </span>
                ) : null}
                {status.kind === 'network' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600">
                    <AlertIcon /> {s.settings.keyNetworkError}
                  </span>
                ) : null}
              </div>
            </div>
            <div>
              <Label htmlFor="settings-model">{s.settings.modelLabel}</Label>
              <Input
                id="settings-model"
                placeholder="openai/gpt-4o-mini"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-ink-soft">{s.settings.modelHint}</p>
            </div>
          </div>
        </section>

        <section>
          <Label htmlFor="settings-semester">{s.settings.semesterLabel}</Label>
          <Input
            id="settings-semester"
            type="date"
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          />
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">{s.gcal.section}</h3>
          <div className="space-y-3">
            <div>
              <Label htmlFor="settings-gcal">{s.gcal.clientIdLabel}</Label>
              <Input
                id="settings-gcal"
                placeholder={s.gcal.clientIdPlaceholder}
                autoComplete="off"
                value={gcalClientId}
                onChange={(e) => setGcalClientId(e.target.value)}
              />
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{s.gcal.clientIdHint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!getClientId(gcalClientId) || gcalStatus.kind === 'syncing'}
                onClick={async () => {
                  try {
                    setGcalStatus({ kind: 'syncing' });
                    const [token, sessions] = await Promise.all([
                      requestGcalToken(gcalClientId.trim() || undefined),
                      db.lmsSessions.toArray(),
                    ]);
                    const result = await syncSessionsToGcal(sessions, token);
                    setGcalStatus({ kind: 'ok', ...result });
                  } catch (e) {
                    setGcalStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
                  }
                }}
              >
                {gcalStatus.kind === 'syncing' ? s.gcal.syncing : s.gcal.syncNow}
              </Button>
              {gcalStatus.kind === 'ok' ? (
                <p className="text-xs font-medium text-emerald-600">
                  {s.gcal.done
                    .replace('{n}', String(gcalStatus.created))
                    .replace('{s}', String(gcalStatus.skipped))
                    .replace('{f}', String(gcalStatus.failed))}
                </p>
              ) : null}
              {gcalStatus.kind === 'error' ? (
                <p className="text-xs font-medium text-red-600">{gcalStatus.message}</p>
              ) : null}
            </div>
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">{s.settings.dataSection}</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  await exportBackup();
                  setBackupStatus({ kind: 'exported' });
                } catch (e) {
                  setBackupStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
                }
              }}
            >
              {s.settings.backupExport}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                try {
                  const count = await exportAllIcs();
                  setBackupStatus({ kind: 'ics', count });
                } catch (err) {
                  setBackupStatus({ kind: 'error', message: errText(err) });
                }
              }}
            >
              {s.settings.exportIcs}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => backupInputRef.current?.click()}
            >
              {s.settings.backupImport}
            </Button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const count = await importBackup(file);
                  setBackupStatus({ kind: 'imported', count });
                } catch (err) {
                  setBackupStatus({ kind: 'error', message: errText(err) });
                }
                e.target.value = '';
              }}
            />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{s.settings.backupHint}</p>
          {backupStatus.kind === 'exported' ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckIcon /> {s.settings.backupSaved}
            </p>
          ) : null}
          {backupStatus.kind === 'ics' ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckIcon /> {s.settings.backupExportedIcs.replace('{n}', String(backupStatus.count))}
            </p>
          ) : null}
          {backupStatus.kind === 'imported' ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckIcon /> {s.settings.backupImported} ({backupStatus.count})
            </p>
          ) : null}
          {backupStatus.kind === 'error' ? (
            <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-600">
              <AlertIcon /> {backupStatus.message || s.settings.backupError}
            </p>
          ) : null}
        </section>

        <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
          {saved ? (
            <span className="mr-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <CheckIcon /> {s.settings.saved}
            </span>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {s.common.cancel}
          </Button>
          <Button onClick={save} disabled={saving}>
            {s.settings.save}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
