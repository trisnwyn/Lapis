import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent/90 disabled:opacity-50',
  secondary:
    'border border-line bg-card text-ink hover:bg-paper disabled:opacity-50',
  ghost: 'text-ink-soft hover:bg-accent-soft hover:text-accent disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className = '', variant = 'primary', size = 'md', type = 'button', ...rest },
    ref,
  ) {
    const classes = [
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
      variantClasses[variant],
      sizeClasses[size],
      className,
    ].join(' ');
    return <button ref={ref} type={type} className={classes} {...rest} />;
  },
);
