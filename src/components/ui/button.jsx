import { Link } from 'react-router-dom';
import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-white shadow-xs hover:bg-ink-deep',
        secondary: 'border border-line bg-card text-ink shadow-xs hover:bg-paper',
        ghost: 'text-ink-2 hover:bg-paper hover:text-ink',
        danger: 'bg-warn text-white hover:opacity-90',
      },
      size: { sm: 'h-9 px-3 md:h-8', md: 'h-11 px-4 md:h-10', icon: 'h-11 w-11 md:h-9 md:w-9' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export function Button({ className, variant, size, ...props }) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function ButtonLink({ className, variant, size, ...props }) {
  return <Link className={cn(buttonVariants({ variant, size }), 'no-underline', className)} {...props} />;
}
