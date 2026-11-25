import { Link, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { useItems } from '@/lib/items';
import { PageHeader } from '@/components/layout/PageHeader';
import { ItemBadges } from '@/components/StatusBadges';
import { Button } from '@/components/ui/button';

export function NewsPage() {
  const news = useItems('news');
  const navigate = useNavigate();
  return (
    <div>
      <PageHeader kicker="Company news" title="News" description="Posts on the News page of the site, newest first. The latest three also show on the home page. A post appears on the site after the next publish." actions={<Button asChild><Link to="/news/new"><Plus className="size-4" /> New post</Link></Button>} />
      <div className="bg-white border rounded-sm divide-y">
        {news.isLoading && <p className="text-sm text-muted-foreground p-4">Loading…</p>}
        {!news.isLoading && !news.data?.length && <p className="text-sm text-muted-foreground p-4">No posts yet. Use “New post” to write the first one.</p>}
        {news.data?.map((n) => (
          <div key={n.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer" onClick={() => navigate(`/news/${n.id}`)}>
            <span className="flex-1 min-w-0"><Link to={`/news/${n.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{n.name}</Link><span className="font-mono text-xs text-muted-foreground ml-2">{n.slug}</span></span>
            <ItemBadges item={n} />
          </div>
        ))}
      </div>
    </div>
  );
}
