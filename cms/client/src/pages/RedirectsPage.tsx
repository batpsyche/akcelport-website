import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { reportError } from '@/lib/items';
import type { Redirect } from '@/lib/types';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';

type Draft = { id?: number; kind: 'page' | 'download'; from_path: string; to_path: string };

export function RedirectsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['redirects'], queryFn: () => api.get<{ redirects: Redirect[] }>('/api/redirects').then((r) => r.redirects) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const done = async (msg: string) => { await qc.invalidateQueries({ queryKey: ['redirects'] }); toast.success(msg); setDraft(null); };
  const save = useMutation({ mutationFn: (d: Draft) => (d.id ? api.put(`/api/redirects/${d.id}`, { kind: d.kind, from_path: d.from_path, to_path: d.to_path }) : api.post('/api/redirects', { kind: d.kind, from_path: d.from_path, to_path: d.to_path })), onSuccess: () => done('Redirect saved. It takes effect at the next publish.'), onError: reportError });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/api/redirects/${id}`), onSuccess: () => done('Redirect removed'), onError: reportError });
  return (
    <div>
      <PageHeader kicker="Administration" title="URL redirects" description="Old akcelport.com addresses mapped to the new pages and PDFs. The build writes them as .htaccess and _redirects files; a redirect to a product that does not exist fails the publish." actions={<Button onClick={() => setDraft({ kind: 'page', from_path: '/', to_path: '/' })}><Plus className="size-4" /> New redirect</Button>} />
      <div className="bg-white border rounded-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Kind</TableHead><TableHead>From (old address)</TableHead><TableHead>To</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
          <TableBody>
            {(list.data ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell><Badge variant="outline">{r.kind}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{r.fromPath}</TableCell>
                <TableCell className="font-mono text-xs">{r.toPath}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setDraft({ id: r.id, kind: r.kind, from_path: r.fromPath, to_path: r.toPath })}><Pencil className="size-4" /></Button>
                  <ConfirmDialog trigger={<Button variant="ghost" size="icon" aria-label="Delete"><Trash2 className="size-4" /></Button>} title="Remove this redirect?" description={`${r.fromPath} will stop redirecting after the next publish.`} confirmLabel="Remove" destructive onConfirm={() => remove.mutate(r.id)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{draft?.id ? 'Edit redirect' : 'New redirect'}</DialogTitle><DialogDescription>Both paths start with a slash. Page redirects point at pages, download redirects at PDF files.</DialogDescription></DialogHeader>
          {draft && <div className="grid gap-3">
            <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as Draft['kind'] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="page">Page</SelectItem><SelectItem value="download">Download (PDF)</SelectItem></SelectContent></Select>
            <Input value={draft.from_path} onChange={(e) => setDraft({ ...draft, from_path: e.target.value })} placeholder="/old-page.php" className="font-mono text-xs" />
            <Input value={draft.to_path} onChange={(e) => setDraft({ ...draft, to_path: e.target.value })} placeholder="/products/cable-lugs/" className="font-mono text-xs" />
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button onClick={() => draft && save.mutate(draft)} disabled={save.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
