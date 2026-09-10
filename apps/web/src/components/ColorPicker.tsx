import { s } from '../strings';

export const COURSE_COLORS = [
  '#7c3aed',
  '#db2777',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0d9488',
  '#57534e',
] as const;

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={s.courseDialog.colorLabel}>
      {COURSE_COLORS.map((color) => {
        const selected = value === color;
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color}
            onClick={() => onChange(color)}
            style={{ backgroundColor: color }}
            className={`h-7 w-7 rounded-full transition-all ${
              selected ? 'ring-2 ring-ink/50 ring-offset-2 ring-offset-card' : 'hover:scale-110'
            }`}
          />
        );
      })}
    </div>
  );
}
