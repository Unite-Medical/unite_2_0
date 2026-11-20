import { cn } from '../../lib/cn.js';

export function Input({ className, icon: Icon, ...props }) {
  return (
    <div className="relative flex items-center">
      {Icon && <Icon aria-hidden className="pointer-events-none absolute left-3 h-4 w-4 text-ink-3" />}
      <input
        className={cn('h-11 md:h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-ink shadow-xs placeholder:text-ink-3 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15', Icon && 'pl-9', className)}
        {...props}
      />
    </div>
  );
}
