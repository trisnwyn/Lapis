import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, TEXT_EXTRACTABLE, type Course, type Material } from '@lapis/core';
import type { CourseFolder } from '../../hooks/useCourseFolder';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Input } from '../ui/Input';
import { AssignmentDialog } from '../tasks/AssignmentDialog';
import {
  AlertIcon,
  FileIcon,
  FolderIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from '../icons';
import { formatBytes } from '../../lib/format';
import { formatShortDate } from '../../lib/dates';
import { s } from '../../strings';

const EXT_STYLES: Record<string, string> = {
  pdf: 'bg-red-100 text-red-700',
  doc: 'bg-blue-100 text-blue-700',
  docx: 'bg-blue-100 text-blue-700',
  txt: 'bg-blue-100 text-blue-700',
  md: 'bg-blue-100 text-blue-700',
  ppt: 'bg-orange-100 text-orange-700',
  pptx: 'bg-orange-100 text-orange-700',
  xls: 'bg-emerald-100 text-emerald-700',
  xlsx: 'bg-emerald-100 text-emerald-700',
  csv: 'bg-emerald-100 text-emerald-700',
  png: 'bg-purple-100 text-purple-700',
  jpg: 'bg-purple-100 text-purple-700',
  jpeg: 'bg-purple-100 text-purple-700',
  webp: 'bg-purple-100 text-purple-700',
  zip: 'bg-amber-100 text-amber-700',
  rar: 'bg-amber-100 text-amber-700',
};

function ExtBadge({ ext }: { ext: string }) {
  if (!ext) {
    return (
      <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-500">
        <FileIcon width={14} height={14} />
      </span>
    );
  }
  return (
    <span
      className={`flex h-8 w-10 shrink-0 items-center justify-center rounded-md text-[10px] font-bold uppercase ${
        EXT_STYLES[ext] ?? 'bg-stone-100 text-stone-600'
      }`}
    >
      {ext.slice(0, 4)}
    </span>
  );
}

interface MaterialsTabProps {
  course: Course;
  folder: CourseFolder;
}

export function MaterialsTab({ course, folder }: MaterialsTabProps) {
  const [filter, setFilter] = useState('');
  const [assignmentFor, setAssignmentFor] = useState<Material | null>(null);
  const lastScanRef = useRef(0);

  const materials =
    useLiveQuery(() => db.materials.where('courseId').equals(course.id).toArray(), [course.id]) ??
    [];

  // Tự quét lại khi cửa sổ lấy focus (nhặt file mới thả vào), tối đa 1 lần / 10s
  useEffect(() => {
    const onFocus = () => {
      if (!folder.hasFolder || folder.perm !== 'granted' || folder.scanning) return;
      if (Date.now() - lastScanRef.current < 10_000) return;
      lastScanRef.current = Date.now();
      void folder.rescan();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [folder]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = [...materials].sort((a, b) => a.path.localeCompare(b.path));
    if (!q) return base;
    return base.filter((m) => m.path.toLowerCase().includes(q));
  }, [materials, filter]);

  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const m of filtered) {
      const dir = m.path.includes('/')
        ? m.path.slice(0, m.path.lastIndexOf('/'))
        : s.course.materialsTab.rootLabel;
      const list = map.get(dir) ?? [];
      list.push(m);
      map.set(dir, list);
    }
    return [...map.entries()];
  }, [filtered]);

  const totalSize = materials.reduce((acc, m) => acc + m.size, 0);

  if (!folder.hasFolder) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<FolderIcon width={20} height={20} />}
          title={s.course.materials}
          hint={s.course.materialsTab.connectHint}
        />
        <div className="flex flex-col items-center gap-2">
          <Button onClick={folder.connect}>
            <FolderIcon /> {s.course.materialsTab.connect}
          </Button>
          {folder.unsupported ? (
            <p className="inline-flex items-center gap-1 text-xs text-amber-700">
              <AlertIcon /> {s.course.materialsTab.unsupported}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
            <FolderIcon width={16} height={16} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{course.folderName}</p>
            <p className="text-xs text-ink-soft">
              {folder.scanning
                ? s.course.materialsTab.scanning
                : `${materials.length} ${s.course.materialsTab.files} · ${formatBytes(totalSize)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={folder.rescan}
            disabled={folder.scanning}
            aria-label={s.course.materialsTab.rescan}
            title={s.course.materialsTab.rescan}
          >
            <RefreshIcon className={folder.scanning ? 'animate-spin' : ''} />
          </Button>
          <Button variant="ghost" size="sm" onClick={folder.connect}>
            {s.course.materialsTab.changeFolder}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={folder.disconnect}
            className="hover:bg-red-50 hover:text-red-600"
          >
            <TrashIcon /> {s.course.materialsTab.disconnect}
          </Button>
        </div>
      </div>

      {folder.perm === 'prompt' ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="inline-flex items-center gap-1.5 text-sm text-amber-900">
            <AlertIcon /> {s.course.materialsTab.needPermission}
          </p>
          <Button variant="secondary" size="sm" onClick={folder.grant}>
            {s.course.materialsTab.grantAndScan}
          </Button>
        </div>
      ) : null}

      {materials.length > 0 ? (
        <div className="mt-4">
          <Input
            placeholder={s.course.materialsTab.filterPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      ) : null}

      <div className="mt-4 space-y-5">
        {assignmentFor ? (
          <AssignmentDialog
            open
            onClose={() => setAssignmentFor(null)}
            course={course}
            material={assignmentFor}
          />
        ) : null}
        {materials.length === 0 ? (
          <EmptyState
            icon={<FolderIcon width={20} height={20} />}
            title={s.course.materialsTab.emptyFolder}
          />
        ) : (
          groups.map(([dir, files]) => (
            <section key={dir}>
              <h3 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                <FolderIcon width={12} height={12} /> {dir}
              </h3>
              <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
                {files.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ExtBadge ext={m.ext} />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink" title={m.path}>
                      {m.name}
                    </span>
                    {TEXT_EXTRACTABLE.has(m.ext) ? (
                      <button
                        type="button"
                        onClick={() => setAssignmentFor(m)}
                        className="shrink-0 rounded-md p-1.5 text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent"
                        title={s.assignment.trigger}
                        aria-label={`${s.assignment.trigger}: ${m.name}`}
                      >
                        <PlusIcon />
                      </button>
                    ) : null}
                    <span className="w-24 shrink-0 text-right text-xs text-ink-soft">
                      {formatShortDate(m.lastModified)}
                    </span>
                    <span className="w-16 shrink-0 text-right text-xs text-ink-soft">
                      {formatBytes(m.size)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
