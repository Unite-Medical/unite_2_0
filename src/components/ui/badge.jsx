import { cva } from 'class-variance-authority';
import { cn } from '../../lib/cn.js';

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'border-line bg-paper text-ink-2',
      good: 'border-brand-soft bg-[#eaf2ee] text-brand',
      warn: 'border-warn-soft bg-[#f8ede4] text-warn',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, dot = false, children, ...props }) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
