import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, FileText, Trash2, Replace, Copy, Search } from 'lucide-react';
import { api, mediaUrl, ApiError } from '@/lib/api';
import { reportError } from '@/lib/items';
import type { MediaRow } from '@/lib/types';
import { formatBytes, formatDate } from '@/lib/format';
import { useMedia, uploadMedia, folderOf, FIXED_FOLDERS } from '@/components/MediaPicker';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function MediaPage() {
  const qc = useQueryClient();
  const media = useMedia();
  const [kind, setKind] = useState<'image' | 'pdf'>('image');
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFolder, setUploadFolder] = useState('img/company');
  const [customFolder, setCustomFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [replacing, setReplacing] = useState<MediaRow | null>(null);
  const folders = useMemo(() => [...new Set((media.data ?? []).filter((m) => m.kind === kind).map((m) => folderOf(m.path)))].sort(), [media.data, kind]);
  const uploadFolders = useMemo(() => [...new Set([...FIXED_FOLDERS, ...(media.data ?? []).map((m) => folderOf(m.path))])].filter((f) => (uploadFolder.startsWith('downloads') ? true : true)).sort(), [media.data, uploadFolder]);
  const list = (media.data ?? []).filter((m) => m.kind === kind && (folder === 'all' || folderOf(m.path) === folder) && (!q || m.path.toLowerCase().includes(q.toLowerCase())));
  const refresh = () => qc.invalidateQueries({ queryKey: ['media'] });
  const remove = useMutation({ mutationFn: (id: number) => api.del(`/api/media/${id}`), onSuccess: async () => { await refresh(); toast.success('File deleted'); }, onError: reportError });

  const doUpload = async (file: File) => {
    const target = uploadFolder === '__custom' ? `img/products/${customFolder.trim().toLowerCase()}` : uploadFolder;
    setBusy(true);
    try { const row = await uploadMedia(file, target); await refresh(); toast.success(`Uploaded ${row.path}`); setUploadOpen(false); }
    catch (e) { toast.error(e instanceof ApiError ? e.message : 'Upload failed'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const doReplace = async (file: File) => {
    if (!replacing) return;
    const fd = new FormData(); fd.append('file', file);
    setBusy(true);
    try {
      const r = await api.post<{ warning: string | null }>(`/api/media/${replacing.id}/replace`, fd);
      await refresh();
      if (r.warning) toast.warning(`Replaced ${replacing.path}. ${r.warning}`, { duration: 15_000 });
      else toast.success(`Replaced ${replacing.path}. Publish to update the site.`);
    }
    catch (e) { reportError(e); }
    finally { setBusy(false); setReplacing(null); if (replaceRef.current) replaceRef.current.value = ''; }
  };

  return (
    <div>
      <PageHeader kicker="Library" title="Media" description="Photos (WebP, PNG, JPEG) and PDF files on disk. Replacing a file keeps its address, so every page that uses it updates at the next publish." actions={<Button onClick={() => setUploadOpen(true)}><Upload className="size-4" /> Upload</Button>} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Tabs value={kind} onValueChange={(v) => { setKind(v as 'image' | 'pdf'); setFolder('all'); }}><TabsList><TabsTrigger value="image">Images</TabsTrigger><TabsTrigger value="pdf">PDFs</TabsTrigger></TabsList></Tabs>
        <div className="relative"><Search className="size-4 absolute left-2 top-2.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search file names" className="pl-8 w-60" /></div>
        <Select value={folder} onValueChange={setFolder}><SelectTrigger className="w-72"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All folders</SelectItem>{folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select>
        <span className="text-xs text-muted-foreground ml-auto">{list.length} file{list.length === 1 ? '' : 's'}</span>
      </div>
      <input ref={replaceRef} type="file" className="hidden" accept={replacing?.kind === 'pdf' ? 'application/pdf' : 'image/webp,image/png,image/jpeg'} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doReplace(f); }} />
      <div className={kind === 'image' ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3' : 'bg-white border rounded-sm divide-y'}>
        {list.map((m) => kind === 'image' ? (
          <div key={m.id} className="bg-white border rounded-sm overflow-hidden group">
            <div className="aspect-[4/3] bg-muted grid place-items-center overflow-hidden"><img src={mediaUrl(m.path)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /></div>
            <div className="p-2 text-[11px] leading-tight">
              <div className="truncate font-mono" title={m.path}>{m.path.split('/').pop()}</div>
              <div className="text-muted-foreground truncate">{folderOf(m.path)}</div>
              <div className="text-muted-foreground">{m.width}×{m.height} · {formatBytes(m.bytes)}</div>
              <RowActions m={m} onReplace={() => { setReplacing(m); setTimeout(() => replaceRef.current?.click(), 0); }} onDelete={() => remove.mutate(m.id)} />
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex items-center gap-3 p-2">
            <FileText className="size-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0"><div className="font-mono text-xs truncate">{m.path}</div><div className="text-xs text-muted-foreground">{m.pages ? `${m.pages} pages · ` : ''}{formatBytes(m.bytes)} · updated {formatDate(m.updatedAt)}</div></div>
            <RowActions m={m} onReplace={() => { setReplacing(m); setTimeout(() => replaceRef.current?.click(), 0); }} onDelete={() => remove.mutate(m.id)} />
          </div>
        ))}
        {!list.length && <p className="text-sm text-muted-foreground p-3 col-span-full">No files match.</p>}
      </div>
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upload a file</DialogTitle><DialogDescription>Images go under img/, PDFs under downloads/. Files are checked by content, not by name; images up to 10 MB, PDFs up to 25 MB.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <Select value={uploadFolder} onValueChange={setUploadFolder}><SelectTrigger><SelectValue placeholder="Folder" /></SelectTrigger><SelectContent>{uploadFolders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}<SelectItem value="__custom">New product folder…</SelectItem></SelectContent></Select>
            {uploadFolder === '__custom' && <Input value={customFolder} onChange={(e) => setCustomFolder(e.target.value)} placeholder="product-slug (creates img/products/<slug>)" className="font-mono text-xs" />}
            <input ref={fileRef} type="file" accept="image/webp,image/png,image/jpeg,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f); }} className="text-sm" disabled={busy || (uploadFolder === '__custom' && !customFolder.trim())} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setUploadOpen(false)}>{busy ? 'Uploading…' : 'Close'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowActions({ m, onReplace, onDelete }: { m: MediaRow; onReplace: () => void; onDelete: () => void }) {
  const [usage, setUsage] = useState<string[] | null>(null);
  const check = async () => { try { setUsage((await api.get<{ usedBy: string[] }>(`/api/media/${m.id}/usage`)).usedBy); } catch (e) { reportError(e); } };
  return (
    <div className="flex items-center gap-0.5 mt-1">
      <Button variant="ghost" size="icon" className="size-7" aria-label="Copy path" onClick={() => { void navigator.clipboard?.writeText(`/${m.path}`); toast.success('Path copied'); }}><Copy className="size-3.5" /></Button>
      <Button variant="ghost" size="icon" className="size-7" aria-label="Replace file" onClick={onReplace}><Replace className="size-3.5" /></Button>
      <ConfirmDialog trigger={<Button variant="ghost" size="icon" className="size-7" aria-label="Delete file" onClick={() => void check()}><Trash2 className="size-3.5" /></Button>} title="Delete this file?" description={usage === null ? 'Checking where it is used…' : usage.length ? `It is still used by ${usage.join(', ')}; the server will refuse.` : 'It is not referenced by any content.'} confirmLabel="Delete" destructive onConfirm={onDelete} />
    </div>
  );
}
