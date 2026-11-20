import { Badge } from './badge.jsx';
import { label } from '../../lib/commerceClient.js';
import { statusTone } from '../../lib/statusTone.js';

export function StatusBadge({ value }) {
  if (!value) return <span className="text-ink-3">—</span>;
  return <Badge tone={statusTone(value) || 'neutral'} dot>{label(value)}</Badge>;
}
