import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { useItems, useItemMutations } from '@/lib/items';
import { PageHeader } from '@/components/layout/PageHeader';
import { SortableList } from '@/components/SortableList';
import { ItemBadges } from '@/components/StatusBadges';
import { Button } from '@/components/ui/button';

export function DownloadsPage() {
  const downloads = useItems('download');
  const m = useItemMutations('download');
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader kicker="Datasheets and brochures" title="Downloads" description="Every PDF offered on the site, in the order of the Downloads page. Link them to products from the product editor." actions={<Button asChild><Link to="/downloads/new"><Plus className="size-4" /> New download</Link></Button>} />
      <div className="bg-white border rounded-sm">
        <SortableList items={downloads.data ?? []} getId={(d) => d.id} onReorder={(next) => m.reorder.mutate({ ids: next.map((d) => d.id) })} className="divide-y"
          render={(d, row) => (
            <div className="flex items-center gap-3 px-2 py-2 hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/downloads/${d.id}`)}>
              <span onClick={(e) => e.stopPropagation()}>{row.handle}</span>
              <span className="font-mono text-xs text-muted-foreground w-6">{row.index + 1}</span>
              <span className="flex-1 min-w-0"><span className="font-medium">{d.name}</span><span className="font-mono text-xs text-muted-foreground ml-2">{d.slug}</span></span>
              <ItemBadges item={d} />
            </div>
          )} />
      </div>
    </div>
  );
}
