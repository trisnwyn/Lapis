import { forwardRef, type InputHTMLAttributes } from 'react';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    const classes = [
      'w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink',
      'placeholder:text-stone-400',
      'focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20',
      className,
    ].join(' ');
    return <input ref={ref} className={classes} {...rest} />;
  },
);
