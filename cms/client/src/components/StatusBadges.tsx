import { Badge } from '@/components/ui/badge';
import type { ItemSummary } from '@/lib/types';

export function ItemBadges({ item }: { item: ItemSummary }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {item.pendingDeletion && <Badge variant="destructive">Deleting at next publish</Badge>}
      {!item.pendingDeletion && item.neverPublished && <Badge className="bg-copper text-white">New, unpublished</Badge>}
      {!item.pendingDeletion && !item.neverPublished && item.hasDraft && <Badge className="bg-primary text-white">Draft changes</Badge>}
      {item.status === 'hidden' && <Badge variant="secondary">Hidden</Badge>}
      {item.status !== item.publishedStatus && !item.neverPublished && <Badge variant="outline">{item.status === 'live' ? 'Shows at next publish' : 'Hides at next publish'}</Badge>}
    </span>
  );
}
