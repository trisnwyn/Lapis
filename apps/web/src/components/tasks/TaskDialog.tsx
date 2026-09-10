import { useState, type FormEvent } from 'react';
import { createTask, updateTask, type Course, type Task } from '@lapis/core';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Label } from '../ui/Label';
import { Dialog } from '../ui/Dialog';
import { s } from '../../strings';
import { toISODateLocal } from '../../lib/format';

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  course: Course;
  task?: Task;
}

export function TaskDialog({ open, onClose, course, task }: TaskDialogProps) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [subtasksText, setSubtasksText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resetFor = (t: Task | undefined) => {
    setTitle(t?.title ?? '');
    setDue(t?.dueDate ? toISODateLocal(t.dueDate) : '');
    setSubtasksText('');
    setError(null);
  };

  // reset mỗi lần mở dialog
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setLastOpen(true);
    resetFor(task);
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError(s.courseDialog.errorName);
      return;
    }
    const dueDate = due ? new Date(`${due}T23:59:59`).getTime() : undefined;
    const newSubs = subtasksText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ title: line }));

    if (task) {
      await updateTask(task.id, {
        title: title.trim(),
        dueDate,
        subtasks: [...task.subtasks, ...newSubs.map((x) => ({ id: crypto.randomUUID(), title: x.title, done: false }))],
      });
    } else {
      await createTask({ courseId: course.id, title, dueDate, subtasks: newSubs });
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? s.taskDialog.editTitle : s.taskDialog.newTitle}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="task-title">{s.taskDialog.titleLabel}</Label>
          <Input
            id="task-title"
            autoFocus
            placeholder={s.taskDialog.titlePlaceholder}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError(null);
            }}
          />
          {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
        </div>
        <div>
          <Label htmlFor="task-due">{s.taskDialog.dueLabel}</Label>
          <Input id="task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="task-subs">
            {task ? s.taskDialog.subtasksNew : s.taskDialog.subtasksLabel}
          </Label>
          <textarea
            id="task-subs"
            rows={3}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm placeholder:text-stone-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            value={subtasksText}
            onChange={(e) => setSubtasksText(e.target.value)}
            placeholder={'Đọc slides tuần 4\nLàm bài tập\nÔn lại'}
          />
        </div>
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={onClose}>
            {s.common.cancel}
          </Button>
          <Button type="submit">{s.common.save}</Button>
        </div>
      </form>
    </Dialog>
  );
}
