import type { LabelHTMLAttributes } from 'react';

export function Label({ className = '', ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  const classes = [
    'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-soft',
    className,
  ].join(' ');
  return <label className={classes} {...rest} />;
}
