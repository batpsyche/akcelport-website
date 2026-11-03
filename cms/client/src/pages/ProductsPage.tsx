import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { useItems, useItemMutations } from '@/lib/items';
import { PageHeader } from '@/components/layout/PageHeader';
import { SortableList } from '@/components/SortableList';
import { ItemBadges } from '@/components/StatusBadges';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

export function ProductsPage() {
  const families = useItems('family');
  const products = useItems('product');
  const m = useItemMutations('product');
  const navigate = useNavigate();
  const byFamily = useMemo(() => { const map = new Map<number, typeof products.data>(); for (const p of products.data ?? []) { const l = map.get(p.familyId!) ?? []; l.push(p); map.set(p.familyId!, l); } return map; }, [products.data]);
  return (
    <div>
      <PageHeader kicker="Catalogue" title="Products" description="Drag to change the order within a family. Click a product to edit it." actions={<Button asChild><Link to="/products/new"><Plus className="size-4" /> New product</Link></Button>} />
      <div className="grid gap-6">
        {(families.data ?? []).map((f) => {
          const list = byFamily.get(f.id) ?? [];
          return (
            <section key={f.id}>
              <div className="flex items-baseline gap-3 mb-2"><h2 className="text-lg">{f.name}</h2><Link to={`/families/${f.id}`} className="text-xs text-muted-foreground hover:underline">edit family</Link><span className="ml-auto text-xs text-muted-foreground">{list.length} product{list.length === 1 ? '' : 's'}</span><Button asChild size="sm" variant="ghost"><Link to={`/products/new?family=${f.id}`}><Plus className="size-4" /> Add</Link></Button></div>
              <div className="bg-white border rounded-sm">
                <SortableList items={list} getId={(p) => p.id} onReorder={(next) => m.reorder.mutate({ familyId: f.id, ids: next.map((p) => p.id) })} className="divide-y"
                  render={(p, row) => (
                    <div className="flex items-center gap-3 px-2 py-2 hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/products/${p.id}`)}>
                      <span onClick={(e) => e.stopPropagation()}>{row.handle}</span>
                      <span className="font-mono text-xs text-muted-foreground w-6">{row.index + 1}</span>
                      <span className="flex-1 min-w-0"><span className="font-medium">{p.name}</span><span className="font-mono text-xs text-muted-foreground ml-2">{p.slug}</span></span>
                      <ItemBadges item={p} />
                      <span className="text-xs text-muted-foreground w-36 text-right hidden md:block">{formatDate(p.updatedAt)}</span>
                    </div>
                  )} />
                {!list.length && <p className="p-3 text-sm text-muted-foreground">No products in this family yet.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
