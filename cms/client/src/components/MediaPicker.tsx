// Browse and upload photos and PDFs. Returns the chosen media row.
import { useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Search, FileText } from 'lucide-react';
import { api, mediaUrl, ApiError } from '@/lib/api';
import type { MediaRow } from '@/lib/types';
import { formatBytes } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const FIXED_FOLDERS = ['img/company', 'img/downloads', 'downloads/catalogue', 'downloads/legacy'];

export function useMedia(kind?: 'image' | 'pdf') {
  return useQuery({ queryKey: ['media', kind ?? 'all'], queryFn: () => api.get<{ media: MediaRow[] }>(`/api/media${kind ? `?kind=${kind}` : ''}`).then((r) => r.media), staleTime: 30_000 });
}

export async function uploadMedia(file: File, folder: string, name?: string): Promise<MediaRow> {
  const fd = new FormData();
  fd.append('folder', folder);
  if (name) fd.append('name', name);
  fd.append('file', file);
  return (await api.post<{ media: MediaRow }>('/api/media', fd)).media;
}

export function folderOf(path: string) { return path.split('/').slice(0, -1).join('/'); }

export function MediaPicker({ open, onOpenChange, kind, onSelect, defaultFolder }: { open: boolean; onOpenChange: (o: boolean) => void; kind: 'image' | 'pdf'; onSelect: (m: MediaRow) => void; defaultFolder?: string }) {
  const qc = useQueryClient();
  const media = useMedia(kind);
  const [q, setQ] = useState('');
  const [folder, setFolder] = useState<string>(defaultFolder ?? 'all');
  const [uploadFolder, setUploadFolder] = useState<string>(defaultFolder ?? (kind === 'pdf' ? 'downloads/catalogue' : 'img/company'));
  const [customFolder, setCustomFolder] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folders = useMemo(() => {
    const s = new Set<string>(media.data?.map((m) => folderOf(m.path)) ?? []);
    if (defaultFolder) s.add(defaultFolder);
    return [...s].sort();
  }, [media.data, defaultFolder]);
  const uploadFolders = useMemo(() => {
    const s = new Set<string>([...FIXED_FOLDERS.filter((f) => (kind === 'pdf') === f.startsWith('downloads/')), ...folders.filter((f) => (kind === 'pdf') === f.startsWith('downloads/'))]);
    return [...s].sort();
  }, [folders, kind]);
  const list = (media.data ?? []).filter((m) => (folder === 'all' || folderOf(m.path) === folder) && (!q || m.path.toLowerCase().includes(q.toLowerCase())));

  const doUpload = async (file: File) => {
    const target = uploadFolder === '__custom' ? `img/products/${customFolder.trim().toLowerCase()}` : uploadFolder;
    setBusy(true);
    try {
      const row = await uploadMedia(file, target);
      await qc.invalidateQueries({ queryKey: ['media'] });
      toast.success(`Uploaded ${row.path}`);
      onSelect(row);
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Upload failed'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{kind === 'pdf' ? 'Choose a PDF' : 'Choose an image'}</DialogTitle>
          <DialogDescription>Pick a file from the media library or upload a new one{kind === 'pdf' ? ' (PDF)' : ' (WebP, PNG or JPEG)'}.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          <div className="relative"><Search className="size-4 absolute left-2 top-2.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name" className="pl-8 w-56" /></div>
          <Select value={folder} onValueChange={setFolder}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All folders</SelectItem>{folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Select value={uploadFolder} onValueChange={setUploadFolder}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Upload to…" /></SelectTrigger>
              <SelectContent>{uploadFolders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}{kind === 'image' && <SelectItem value="__custom">New product folder…</SelectItem>}</SelectContent>
            </Select>
            {uploadFolder === '__custom' && <Input value={customFolder} onChange={(e) => setCustomFolder(e.target.value)} placeholder="product-slug" className="w-40 font-mono text-xs" />}
            <input ref={fileRef} type="file" className="hidden" accept={kind === 'pdf' ? 'application/pdf' : 'image/webp,image/png,image/jpeg'} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f); }} />
            <Button type="button" size="sm" variant="outline" disabled={busy || (uploadFolder === '__custom' && !customFolder.trim())} onClick={() => fileRef.current?.click()}><Upload className="size-4" /> {busy ? 'Uploading…' : 'Upload'}</Button>
          </div>
        </div>
        <div className="overflow-auto flex-1 -mx-1 px-1">
          {media.isLoading && <p className="text-sm text-muted-foreground p-4">Loading…</p>}
          {!media.isLoading && !list.length && <p className="text-sm text-muted-foreground p-4">No files match.</p>}
          {kind === 'image' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 py-2">
              {list.map((m) => (
                <button key={m.id} type="button" className="group text-left border bg-white hover:border-primary focus-visible:border-primary rounded-sm overflow-hidden" onClick={() => { onSelect(m); onOpenChange(false); }}>
                  <div className="aspect-[4/3] bg-muted grid place-items-center overflow-hidden"><img src={mediaUrl(m.path)} alt="" loading="lazy" className="max-h-full max-w-full object-contain" /></div>
                  <div className="p-1.5 text-[11px] leading-tight"><div className="truncate font-mono" title={m.path}>{m.path.split('/').pop()}</div><div className="text-muted-foreground">{m.width}×{m.height} · {formatBytes(m.bytes)}</div></div>
                </button>
              ))}
            </div>
          ) : (
            <div className="divide-y">
              {list.map((m) => (
                <button key={m.id} type="button" className={cn('w-full flex items-center gap-3 p-2 text-left hover:bg-muted')} onClick={() => { onSelect(m); onOpenChange(false); }}>
                  <FileText className="size-5 text-primary shrink-0" />
                  <span className="font-mono text-xs truncate flex-1">{m.path}</span>
                  <span className="text-xs text-muted-foreground">{m.pages ? `${m.pages} pages · ` : ''}{formatBytes(m.bytes)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
