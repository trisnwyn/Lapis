import { useEffect, useRef, useState } from 'react';
import {
  completeChat,
  createTask,
  getOrExtractText,
  getSettings,
  type Course,
  type Material,
} from '@lapis/core';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Dialog } from '../ui/Dialog';
import { AlertIcon, RefreshIcon } from '../icons';
import { s } from '../../strings';

interface AssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  course: Course;
  material: Material;
}

type Phase = 'analyzing' | 'form' | 'error';

export function AssignmentDialog({ open, onClose, course, material }: AssignmentDialogProps) {
  const [phase, setPhase] = useState<Phase>('analyzing');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [subsText, setSubsText] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    abortRef.current = controller;
    let alive = true;

    void (async () => {
      setPhase('analyzing');
      setErrorText(null);
      const settings = await getSettings();
      if (!settings.openrouterKey) {
        setErrorText(s.assignment.noKey);
        setPhase('error');
        return;
      }
      if (!course.folderHandle) {
        setErrorText(s.assignment.noFolder);
        setPhase('error');
        return;
      }
      const fileText = await getOrExtractText(material, course.folderHandle);
      const text = fileText?.text ?? '';
      if (text.trim().length < 200) {
        setErrorText(s.assignment.noText);
        setPhase('error');
        return;
      }
      try {
        const raw = await completeChat({
          key: settings.openrouterKey,
          model: settings.model ?? 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Bạn là trợ lý phân tích đề bài tập cho sinh viên. Đầu vào là nội dung một tệp tài liệu. Trả về DUY NHẤT một JSON object dạng: {"title": "tên nhiệm vụ ngắn gọn bằng tiếng Việt", "dueDate": "YYYY-MM-DD" hoặc null nếu không thấy hạn chót, "subtasks": ["3-6 bước thực hiện ngắn gọn"]}. Không thêm bất kỳ chữ nào ngoài JSON.',
            },
            {
              role: 'user',
              content: `Tệp: ${material.path}\n\nNội dung:\n${text.slice(0, 15000)}`,
            },
          ],
          json: true,
          signal: controller.signal,
        });
        const match = raw.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match?.[0] ?? raw) as {
          title?: string;
          dueDate?: string | null;
          subtasks?: string[];
        };
        setTitle(
          typeof parsed.title === 'string' && parsed.title.trim()
            ? parsed.title.trim()
            : material.name.replace(/\.[^.]+$/, ''),
        );
        setDue(
          typeof parsed.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.dueDate)
            ? parsed.dueDate
            : '',
        );
        setSubsText(
          Array.isArray(parsed.subtasks)
            ? parsed.subtasks.filter((x) => typeof x === 'string').join('\n')
            : '',
        );
        setPhase('form');
      } catch (e) {
        if (controller.signal.aborted) return;
        setErrorText(`${s.assignment.aiError}: ${e instanceof Error ? e.message : String(e)}`);
        setPhase('error');
      }
    })();

    return () => {
      alive = false;
      controller.abort();
      abortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, material.id]);

  const save = async () => {
    if (!title.trim()) {
      setErrorText(s.courseDialog.errorName);
      return;
    }
    const dueDate = due ? new Date(`${due}T23:59:59`).getTime() : undefined;
    const subtasks = subsText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((t) => ({ title: t }));
    await createTask({ courseId: course.id, title, dueDate, subtasks, source: 'ai' });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={s.assignment.title} width="max-w-lg">
      {phase === 'analyzing' ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <RefreshIcon width={22} height={22} className="animate-spin text-accent" />
          <p className="text-sm font-medium text-ink">{s.assignment.analyzing}</p>
          <p className="max-w-sm truncate text-xs text-ink-soft">{material.path}</p>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertIcon width={20} height={20} className="text-red-500" />
          <p className="max-w-sm text-sm text-ink">{errorText}</p>
          <p className="max-w-sm text-xs text-ink-soft">{s.assignment.fallbackHint}</p>
        </div>
      ) : null}

      {phase === 'form' ? (
        <div className="space-y-4">
          <p className="rounded-lg bg-accent-soft px-3 py-2 text-xs text-accent">
            {s.assignment.parsed}
          </p>
          <div>
            <Label htmlFor="assign-title">{s.taskDialog.titleLabel}</Label>
            <Input
              id="assign-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="assign-due">{s.taskDialog.dueLabel}</Label>
            <Input
              id="assign-due"
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="assign-subs">{s.taskDialog.subtasksLabel}</Label>
            <textarea
              id="assign-subs"
              rows={4}
              value={subsText}
              onChange={(e) => setSubsText(e.target.value)}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" onClick={onClose}>
              {s.common.cancel}
            </Button>
            <Button onClick={save}>{s.assignment.save}</Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
