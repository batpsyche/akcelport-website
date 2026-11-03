import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Package, Layers, FileDown, Images, Rocket, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Dashboard { counts: { products: number; families: number; downloads: number; media: number; users: number }; pendingCount: number; lastPublish: { status: string; releaseId: string | null; startedBy: string | null; finishedAt: string | null; error: string | null; kind: string } | null; recent: Array<{ id: number; userEmail: string | null; action: string; label: string | null; createdAt: string }> }

export function DashboardPage() {
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['dashboard'], queryFn: () => api.get<Dashboard>('/api/dashboard') });
  const d = q.data;
  const tiles = [
    { to: '/products', label: 'Products', value: d?.counts.products, icon: Package },
    { to: '/families', label: 'Families', value: d?.counts.families, icon: Layers },
    { to: '/downloads', label: 'Downloads', value: d?.counts.downloads, icon: FileDown },
    { to: '/media', label: 'Media files', value: d?.counts.media, icon: Images },
  ];
  return (
    <div>
      <PageHeader kicker="Dashboard" title={`Hello${me?.user.name ? `, ${me.user.name.split(' ')[0]}` : ''}`} description="The website is a static site rebuilt from this content every time you publish." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {tiles.map((t) => (
          <Link key={t.to} to={t.to} className="bg-white chamfer border p-4 hover:border-primary transition-colors">
            <div className="flex items-center justify-between text-muted-foreground"><span className="kicker">{t.label}</span><t.icon className="size-4" /></div>
            <div className="font-display text-3xl font-bold mt-2">{t.value ?? '–'}</div>
          </Link>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="chamfer">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Rocket className="size-4 text-primary" /> Publishing</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>{d?.pendingCount ? <><Badge className="bg-primary text-white mr-2">{d.pendingCount}</Badge>unpublished change{d.pendingCount === 1 ? '' : 's'} waiting</> : 'Everything is published.'}</div>
            {d?.lastPublish ? (
              <div className="text-muted-foreground">Last {d.lastPublish.kind}: <span className={d.lastPublish.status === 'failed' ? 'text-destructive' : 'text-foreground'}>{d.lastPublish.status}</span>{d.lastPublish.startedBy ? ` by ${d.lastPublish.startedBy}` : ''} · {formatDate(d.lastPublish.finishedAt)}{d.lastPublish.releaseId ? <span className="font-mono text-xs"> · {d.lastPublish.releaseId}</span> : null}{d.lastPublish.error && <div className="text-destructive mt-1">{d.lastPublish.error}</div>}</div>
            ) : <div className="text-muted-foreground">Nothing has been published from the CMS yet.</div>}
            <div><Button asChild size="sm" variant={d?.pendingCount ? 'default' : 'outline'}><Link to="/publish">Open the Publish page <ArrowRight className="size-4" /></Link></Button></div>
          </CardContent>
        </Card>
        <Card className="chamfer">
          <CardHeader className="pb-2"><CardTitle className="text-base">Recent activity</CardTitle></CardHeader>
          <CardContent className="text-sm grid gap-1">
            {d?.recent.map((r) => <div key={r.id} className="flex gap-2 py-1 border-b last:border-0"><span className="text-muted-foreground w-36 shrink-0 text-xs">{formatDate(r.createdAt)}</span><span className="font-mono text-xs w-32 shrink-0 truncate">{r.action}</span><span className="truncate">{r.label ?? ''}</span><span className="ml-auto text-xs text-muted-foreground truncate">{r.userEmail ?? ''}</span></div>)}
            {!d?.recent.length && <p className="text-muted-foreground">No activity yet.</p>}
            <div className="mt-2"><Button asChild size="sm" variant="ghost"><Link to="/activity">All activity <ArrowRight className="size-4" /></Link></Button></div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
