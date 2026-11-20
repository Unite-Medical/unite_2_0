import { cn } from '../../lib/cn.js';

export const Table = ({ className, ...p }) => (
  <div className="w-full overflow-x-auto"><table className={cn('w-full border-collapse text-sm', className)} {...p} /></div>
);
export const THead = ({ className, ...p }) => <thead className={cn('bg-paper text-left text-xs font-medium text-ink-2', className)} {...p} />;
export const TRow = ({ className, ...p }) => <tr className={cn('border-b border-line last:border-0 transition-colors hover:bg-paper/60', className)} {...p} />;
export const TH = ({ className, ...p }) => <th className={cn('px-4 py-3 font-medium whitespace-nowrap', className)} {...p} />;
export const TD = ({ className, ...p }) => <td className={cn('px-4 py-3 align-middle text-ink', className)} {...p} />;
