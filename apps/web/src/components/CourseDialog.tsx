import { useEffect, useState, type FormEvent } from 'react';
import { createCourse, updateCourse, type Course } from '@lapis/core';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Label } from './ui/Label';
import { Dialog } from './ui/Dialog';
import { ColorPicker } from './ColorPicker';
import { s } from '../strings';

interface CourseDialogProps {
  open: boolean;
  onClose: () => void;
  course?: Course;
}

export function CourseDialog({ open, onClose, course }: CourseDialogProps) {
  const [name, setName] = useState('');
  const [lmsName, setLmsName] = useState('');
  const [color, setColor] = useState<string>('#7c3aed');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(course?.name ?? '');
      setLmsName(course?.lmsName ?? '');
      setColor(course?.color ?? '#7c3aed');
      setError(null);
    }
  }, [open, course]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(s.courseDialog.errorName);
      return;
    }
    if (course) {
      await updateCourse(course.id, {
        name: name.trim(),
        color,
        lmsName: lmsName.trim() || undefined,
      });
    } else {
      await createCourse({ name, color, lmsName: lmsName.trim() || undefined });
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={course ? s.courseDialog.editTitle : s.courseDialog.newTitle}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label htmlFor="course-name">{s.courseDialog.nameLabel}</Label>
          <Input
            id="course-name"
            autoFocus
            placeholder={s.courseDialog.namePlaceholder}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
          {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
        </div>
        <div>
          <Label htmlFor="course-lms">{s.courseDialog.lmsLabel}</Label>
          <Input
            id="course-lms"
            placeholder={s.courseDialog.lmsPlaceholder}
            value={lmsName}
            onChange={(e) => setLmsName(e.target.value)}
          />
        </div>
        <div>
          <Label>{s.courseDialog.colorLabel}</Label>
          <ColorPicker value={color} onChange={setColor} />
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
