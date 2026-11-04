import { useState } from 'react';
import { ImageIcon, Plus, X, Replace } from 'lucide-react';
import { mediaUrl } from '@/lib/api';
import type { Image, MediaRow } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FieldWrap } from './Field';
import { MediaPicker } from '@/components/MediaPicker';
import { SortableList } from '@/components/SortableList';

export const imageFromMedia = (m: MediaRow, previous?: Partial<Image>): Image => ({ src: `/${m.path}`, w: m.width ?? 1, h: m.height ?? 1, alt: previous?.alt ?? '', ...(previous?.caption ? { caption: previous.caption } : {}) });

export function ImageField({ label, help, error, value, onChange, optional, folder, withCaption, compact }: { label?: string; help?: string; error?: string; value: Image | undefined; onChange: (v: Image | undefined) => void; optional?: boolean; folder?: string; withCaption?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <FieldWrap label={label} help={help} error={error}>
      <div className="flex gap-3 items-start border bg-white p-2 rounded-sm">
        <button type="button" className="w-28 h-20 bg-muted grid place-items-center overflow-hidden shrink-0 border hover:border-primary" onClick={() => setOpen(true)} aria-label="Choose image">
          {value?.src ? <img src={mediaUrl(value.src)} alt="" className="max-w-full max-h-full object-contain" /> : <ImageIcon className="size-6 text-muted-foreground" />}
        </button>
        <div className="flex-1 min-w-0 grid gap-1.5">
          {value?.src ? <div className="font-mono text-[11px] text-muted-foreground truncate" title={value.src}>{value.src} · {value.w}×{value.h}{value.aiEnhanced && <Badge variant="outline" className="ml-2">AI-enhanced, original kept</Badge>}</div> : <div className="text-xs text-muted-foreground">No image chosen</div>}
          {!compact && <Input value={value?.alt ?? ''} placeholder="Alt text (describe the image)" onChange={(e) => value && onChange({ ...value, alt: e.target.value })} disabled={!value} />}
          {withCaption && <Input value={value?.caption ?? ''} placeholder="Caption (optional)" onChange={(e) => value && onChange({ ...value, caption: e.target.value || undefined })} disabled={!value} />}
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><Replace className="size-3.5" /> {value?.src ? 'Change' : 'Choose'}</Button>
            {optional && value && <Button type="button" size="sm" variant="ghost" onClick={() => onChange(undefined)}><X className="size-3.5" /> Remove</Button>}
          </div>
        </div>
      </div>
      <MediaPicker open={open} onOpenChange={setOpen} kind="image" defaultFolder={folder} onSelect={(m) => onChange(imageFromMedia(m, value))} />
    </FieldWrap>
  );
}

export function ImageListField({ label, help, error, value, onChange, folder, withCaption }: { label?: string; help?: string; error?: string; value: Image[] | undefined; onChange: (v: Image[]) => void; folder?: string; withCaption?: boolean }) {
  const list = value ?? [];
  const [open, setOpen] = useState(false);
  return (
    <FieldWrap label={label} help={help} error={error}>
      <SortableList items={list.map((im, i) => ({ key: `${i}-${im.src}`, im }))} getId={(it) => it.key} onReorder={(next) => onChange(next.map((x) => x.im))} className="grid gap-2"
        render={(it, row) => (
          <div className="flex items-start gap-1">
            {row.handle}
            <div className="flex-1"><ImageField value={it.im} onChange={(v) => onChange(list.map((x, j) => (j === row.index ? (v as Image) : x)))} folder={folder} withCaption={withCaption} /></div>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove image" onClick={() => onChange(list.filter((_, j) => j !== row.index))}><X className="size-4" /></Button>
          </div>
        )} />
      <div><Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><Plus className="size-4" /> Add image</Button></div>
      <MediaPicker open={open} onOpenChange={setOpen} kind="image" defaultFolder={folder} onSelect={(m) => onChange([...list, imageFromMedia(m)])} />
    </FieldWrap>
  );
}
