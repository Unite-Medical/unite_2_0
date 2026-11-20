import { cn } from '../../lib/cn.js';

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 px-6 py-12 text-center', className)}>
      {Icon && <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border-8 border-paper bg-paper-alt text-ink-2"><Icon className="h-5 w-5" aria-hidden /></span>}
      <p className="m-0 font-semibold text-ink">{title}</p>
      {description && <p className="m-0 max-w-sm text-sm text-ink-2">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
