import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Rocket, Eye, ExternalLink, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/items';
import type { PublishState, PublishRecord } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const typePath: Record<string, string> = { family: 'families', product: 'products', download: 'downloads' };

export function PublishPage() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const state = useQuery({ queryKey: ['publish'], queryFn: () => api.get<PublishState>('/api/publish'), refetchInterval: (q) => (q.state.data?.busy ? 2000 : false) });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastResult, setLastResult] = useState<{ ok: boolean; log: string; message?: string } | null>(null);
  const pending = state.data?.pending;
  const keys = useMemo(() => [...(pending?.items.map((i) => `${i.type}:${i.id}`) ?? []), ...(pending?.pages.map((p) => `page:${p.key}`) ?? [])], [pending]);
  useEffect(() => { setSelected(new Set(keys)); }, [keys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['publish'] }), qc.invalidateQueries({ queryKey: ['pending'] }), qc.invalidateQueries({ queryKey: ['items'] }), qc.invalidateQueries({ queryKey: ['pages'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]); };

  const publish = useMutation({
    mutationFn: () => {
      const all = keys.every((k) => selected.has(k));
      const pick = (type: string) => (pending?.items ?? []).filter((i) => i.type === type && selected.has(`${i.type}:${i.id}`)).map((i) => i.id);
      const selection = all ? 'all' : { families: pick('family'), products: pick('product'), downloads: pick('download'), pages: (pending?.pages ?? []).filter((p) => selected.has(`page:${p.key}`)).map((p) => p.key) };
      return api.post<{ releaseId: string; log: string; promoted: unknown[] }>('/api/publish', { selection });
    },
    onSuccess: async (r) => { setLastResult({ ok: true, log: r.log }); await refresh(); toast.success(`Published release ${r.releaseId}`); },
    onError: async (e) => { setLastResult({ ok: false, log: e instanceof ApiError ? String(e.details?.log ?? '') : '', message: e instanceof ApiError ? e.message : 'Publish failed' }); await refresh(); reportError(e); },
  });
  const preview = useMutation({
    mutationFn: () => api.post<{ log: string }>('/api/publish/preview'),
    onSuccess: async () => { await refresh(); toast.success('Preview built'); window.open('/preview/', '_blank', 'noopener'); },
    onError: async (e) => { setLastResult({ ok: false, log: e instanceof ApiError ? String(e.details?.log ?? '') : '', message: e instanceof ApiError ? e.message : 'Preview failed' }); reportError(e); },
  });
  const rollback = useMutation({ mutationFn: (releaseId: string) => api.post('/api/publish/rollback', { releaseId }), onSuccess: async () => { await refresh(); toast.success('Release restored'); }, onError: reportError });

  const d = state.data;
  const siteUrl = `${window.location.protocol}//${window.location.hostname}:${d?.sitePort ?? 4174}/`;
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const count = keys.length;
  return (
    <div>
      <PageHeader kicker="Go live" title="Publish" description="Publishing promotes the selected drafts, rebuilds the whole website from the database, checks it and swaps it in atomically. Nothing changes on the site if the build fails." actions={<>
        <Button variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending || d?.busy}><Eye className="size-4" /> {preview.isPending ? 'Building preview…' : 'Preview changes'}</Button>
        {d?.canPublish && <ConfirmDialog trigger={<Button disabled={publish.isPending || d?.busy || !count}><Rocket className="size-4" /> {publish.isPending ? 'Publishing…' : `Publish ${selected.size === count ? 'all' : selected.size} change${selected.size === 1 ? '' : 's'}`}</Button>} title="Publish to the website?" description={`${selected.size} change${selected.size === 1 ? '' : 's'} go live. The site is rebuilt and replaced in one step.`} confirmLabel="Publish" onConfirm={() => publish.mutate()} />}
      </>} />
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="grid gap-6">
          <Card className="chamfer">
            <CardHeader className="pb-2"><CardTitle className="text-base">Unpublished changes {count ? <Badge className="bg-primary text-white ml-1">{count}</Badge> : null}</CardTitle></CardHeader>
            <CardContent>
              {!count && <p className="text-sm text-muted-foreground">Everything is published. Edit something and it will appear here.</p>}
              {count > 0 && (
                <Table>
                  <TableHeader><TableRow><TableHead className="w-8"><Checkbox checked={selected.size === count} onCheckedChange={(c) => setSelected(c === true ? new Set(keys) : new Set())} aria-label="Select all" /></TableHead><TableHead>Item</TableHead><TableHead>Change</TableHead><TableHead>Last edit</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {pending?.items.map((i) => { const k = `${i.type}:${i.id}`; return (
                      <TableRow key={k}>
                        <TableCell><Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(k)} aria-label={i.name} /></TableCell>
                        <TableCell><Link to={`/${typePath[i.type]}/${i.id}`} className="hover:underline font-medium">{i.name}</Link> <span className="text-xs text-muted-foreground capitalize">{i.type}</span></TableCell>
                        <TableCell><Badge variant={i.change === 'delete' ? 'destructive' : 'outline'}>{i.change}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(i.updatedAt)}</TableCell>
                      </TableRow>); })}
                    {pending?.pages.map((p) => { const k = `page:${p.key}`; return (
                      <TableRow key={k}>
                        <TableCell><Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(k)} aria-label={p.key} /></TableCell>
                        <TableCell><Link to={p.key === 'site' ? '/settings' : `/pages/${p.key}`} className="hover:underline font-medium capitalize">{p.key === 'site' ? 'Site settings' : p.key.replace('-', ' ')}</Link> <span className="text-xs text-muted-foreground">document</span></TableCell>
                        <TableCell><Badge variant="outline">edit</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(p.updatedAt)}</TableCell>
                      </TableRow>); })}
                  </TableBody>
                </Table>
              )}
              {!d?.canPublish && <p className="text-xs text-muted-foreground mt-3">Publishing is reserved to administrators. You can still build a preview.</p>}
            </CardContent>
          </Card>
          {lastResult && (
            <Card className={`chamfer ${lastResult.ok ? '' : 'border-destructive'}`}>
              <CardHeader className="pb-2"><CardTitle className="text-base">{lastResult.ok ? 'Last publish succeeded' : lastResult.message}</CardTitle></CardHeader>
              <CardContent><pre className="text-xs font-mono whitespace-pre-wrap bg-muted/50 p-3 rounded-sm max-h-72 overflow-auto">{lastResult.log || '(no output)'}</pre></CardContent>
            </Card>
          )}
          <Card className="chamfer">
            <CardHeader className="pb-2"><CardTitle className="text-base">History</CardTitle></CardHeader>
            <CardContent className="grid gap-1">
              {d?.publishes.map((p) => <HistoryRow key={p.id} p={p} />)}
              {!d?.publishes.length && <p className="text-sm text-muted-foreground">No publishes yet.</p>}
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4">
          <Card className="chamfer">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Live site</CardTitle></CardHeader>
            <CardContent className="text-sm grid gap-2">
              <div>Current release<br /><span className="font-mono text-xs">{d?.current ?? 'none'}</span></div>
              <Button asChild variant="outline" size="sm"><a href={siteUrl} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /> Open the published site</a></Button>
              <Button asChild variant="ghost" size="sm"><a href="/preview/" target="_blank" rel="noreferrer"><Eye className="size-4" /> Open the last preview</a></Button>
              {d?.previewBuiltAt && <div className="text-xs text-muted-foreground">Preview built {formatDate(d.previewBuiltAt)}</div>}
            </CardContent>
          </Card>
          <Card className="chamfer">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Releases kept for rollback</CardTitle></CardHeader>
            <CardContent className="text-xs grid gap-1">
              {d?.releases.map((r) => (
                <div key={r.id} className="flex items-center gap-2 py-1 border-b last:border-0">
                  <span className="font-mono flex-1 truncate">{r.id}</span>
                  {r.current ? <Badge className="bg-primary text-white">current</Badge> : me?.user.role === 'admin' ? <ConfirmDialog trigger={<Button variant="ghost" size="sm" className="h-7 px-2"><RotateCcw className="size-3.5" /> Restore</Button>} title={`Make ${r.id} the live site?`} description="The site switches to this earlier build immediately. The content in the CMS is not changed; the next publish rebuilds from it." confirmLabel="Restore release" onConfirm={() => rollback.mutate(r.id)} /> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ p }: { p: PublishRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b last:border-0 py-1.5 text-sm">
      <button type="button" className="flex items-center gap-2 w-full text-left" onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        <Badge variant={p.status === 'failed' ? 'destructive' : p.status === 'running' ? 'secondary' : 'outline'}>{p.status}</Badge>
        <span className="capitalize">{p.kind}</span>
        <span className="text-muted-foreground text-xs">{formatDate(p.startedAt)}{p.startedBy ? ` · ${p.startedBy}` : ''}</span>
        {p.releaseId && <span className="font-mono text-xs text-muted-foreground ml-auto hidden sm:inline">{p.releaseId}</span>}
      </button>
      {open && (
        <div className="pl-6 pt-2 grid gap-2 text-xs">
          {p.error && <div className="text-destructive">{p.error}</div>}
          {p.items && p.items.length > 0 && <div className="flex flex-wrap gap-1">{p.items.map((i, n) => <Badge key={n} variant="outline">{i.type} {i.slug}: {i.change}</Badge>)}</div>}
          {p.log && <pre className="font-mono whitespace-pre-wrap bg-muted/50 p-2 rounded-sm max-h-48 overflow-auto">{p.log}</pre>}
        </div>
      )}
    </div>
  );
}
