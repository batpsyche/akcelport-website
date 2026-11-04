import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { useItems, useItemMutations } from '@/lib/items';
import { PageHeader } from '@/components/layout/PageHeader';
import { SortableList } from '@/components/SortableList';
import { ItemBadges } from '@/components/StatusBadges';
import { Button } from '@/components/ui/button';

export function FamiliesPage() {
  const families = useItems('family');
  const products = useItems('product');
  const m = useItemMutations('family');
  const navigate = useNavigate();
  const count = (id: number) => (products.data ?? []).filter((p) => p.familyId === id).length;
  return (
    <div>
      <PageHeader kicker="Catalogue" title="Product families" description="The six groups in the products menu. Drag to reorder." actions={<Button asChild><Link to="/families/new"><Plus className="size-4" /> New family</Link></Button>} />
      <div className="bg-white border rounded-sm">
        <SortableList items={families.data ?? []} getId={(f) => f.id} onReorder={(next) => m.reorder.mutate({ ids: next.map((f) => f.id) })} className="divide-y"
          render={(f, row) => (
            <div className="flex items-center gap-3 px-2 py-2 hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/families/${f.id}`)}>
              <span onClick={(e) => e.stopPropagation()}>{row.handle}</span>
              <span className="font-mono text-xs text-muted-foreground w-6">{row.index + 1}</span>
              <span className="flex-1 min-w-0"><span className="font-medium">{f.name}</span><span className="font-mono text-xs text-muted-foreground ml-2">{f.slug}</span></span>
              <span className="text-xs text-muted-foreground">{count(f.id)} products</span>
              <ItemBadges item={f} />
            </div>
          )} />
      </div>
    </div>
  );
}
