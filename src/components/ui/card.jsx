import { cn } from '../../lib/cn.js';

export const Card = ({ className, ...p }) => <section className={cn('rounded-xl border border-line bg-card shadow-xs', className)} {...p} />;
export const CardHeader = ({ className, ...p }) => <header className={cn('flex items-center justify-between gap-3 border-b border-line px-5 py-4', className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <h2 className={cn('m-0 font-display text-base font-semibold text-ink', className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn('px-5 py-4', className)} {...p} />;
