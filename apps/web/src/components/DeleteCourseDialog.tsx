import { deleteCourse, type Course } from '@lapis/core';
import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';
import { s } from '../strings';

interface DeleteCourseDialogProps {
  open: boolean;
  onClose: () => void;
  course: Course;
  onDeleted?: () => void;
}

export function DeleteCourseDialog({ open, onClose, course, onDeleted }: DeleteCourseDialogProps) {
  const confirm = async () => {
    await deleteCourse(course.id);
    onClose();
    onDeleted?.();
  };

  return (
    <Dialog open={open} onClose={onClose} title={s.course.deleteDialog.title}>
      <p className="text-sm leading-relaxed text-ink-soft">
        {s.course.deleteDialog.bodyPrefix}{' '}
        <span className="font-semibold text-ink">“{course.name}”</span>
        {s.course.deleteDialog.bodySuffix}
      </p>
      <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" onClick={onClose}>
          {s.common.cancel}
        </Button>
        <Button variant="danger" onClick={confirm}>
          {s.course.deleteDialog.confirm}
        </Button>
      </div>
    </Dialog>
  );
}
