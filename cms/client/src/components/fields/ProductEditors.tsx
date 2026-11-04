// Product-specific nested editors: spec tables, variants and linked datasheets.
import { useState } from 'react';
import { Plus, X, Copy, Trash2 } from 'lucide-react';
import type { SpecTable, Variant, ItemSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldWrap, type Errors, errorAt } from './Field';
import { TextField, TextAreaField, StringListField, FactsField } from './Primitives';
import { ImageField, ImageListField } from './ImageFields';
import { TableEditor } from './TableEditor';
import { SortableList } from '@/components/SortableList';

export function SpecTablesField({ value, onChange, errors, prefix = 'tables' }: { value: SpecTable[] | undefined; onChange: (v: SpecTable[] | undefined) => void; errors?: Errors; prefix?: string }) {
  const list = value ?? [];
  const update = (i: number, patch: Partial<SpecTable>) => onChange(list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <FieldWrap help="Structured specification tables shown under “Specifications”. Give each a short id (used for anchors) and a title.">
      <SortableList items={list.map((t, i) => ({ key: `${i}`, t }))} getId={(it) => it.key} onReorder={(next) => onChange(next.map((x) => x.t))} className="grid gap-3"
        render={(it, row) => (
          <div className="border rounded-sm bg-white p-3 grid gap-3">
            <div className="flex items-start gap-2">
              {row.handle}
              <div className="grid sm:grid-cols-[1fr_2fr] gap-2 flex-1">
                <TextField label="Id" mono value={it.t.id} onChange={(v) => update(row.index, { id: v })} error={errorAt(errors, `${prefix}.${row.index}.id`)} />
                <TextField label="Title" value={it.t.title} onChange={(v) => update(row.index, { title: v })} error={errorAt(errors, `${prefix}.${row.index}.title`)} />
                <TextField label="Caption (optional)" value={it.t.caption ?? ''} onChange={(v) => update(row.index, { caption: v || undefined })} />
                <TextField label="Note under the table (optional)" value={it.t.note ?? ''} onChange={(v) => update(row.index, { note: v || undefined })} />
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove table" onClick={() => onChange(list.filter((_, j) => j !== row.index).length ? list.filter((_, j) => j !== row.index) : undefined)}><Trash2 className="size-4" /></Button>
            </div>
            <TableEditor value={{ columns: it.t.columns, rows: it.t.rows }} onChange={(tv) => update(row.index, tv)} error={errorAt(errors, `${prefix}.${row.index}.columns`) ?? errorAt(errors, `${prefix}.${row.index}.rows`)} />
          </div>
        )} />
      <div><Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, { id: `table-${list.length + 1}`, title: '', columns: ['Code', 'Size'], rows: [] }])}><Plus className="size-4" /> Add table</Button></div>
    </FieldWrap>
  );
}

export function VariantsField({ value, onChange, errors, folder, prefix = 'variants' }: { value: Variant[] | undefined; onChange: (v: Variant[] | undefined) => void; errors?: Errors; folder?: string; prefix?: string }) {
  const list = value ?? [];
  const [openItems, setOpenItems] = useState<string[]>([]);
  const update = (i: number, patch: Partial<Variant>) => onChange(list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const remove = (i: number) => { const next = list.filter((_, j) => j !== i); onChange(next.length ? next : undefined); };
  const add = (from?: Variant) => {
    const v: Variant = from ? { ...structuredClone(from), id: `${from.id}-copy`, name: `${from.name} (copy)` } : { id: `variant-${list.length + 1}`, name: 'New variant', summary: '', images: [] };
    onChange([...list, v]);
    setOpenItems((o) => [...o, `${list.length}`]);
  };
  return (
    <FieldWrap help="Types and series within this product (for example lug series or insulator shapes). Each can have its own drawings, a dimensions-table image and a structured table.">
      <SortableList items={list.map((v, i) => ({ key: `${i}`, v }))} getId={(it) => it.key} onReorder={(next) => onChange(next.map((x) => x.v))} className="grid gap-2"
        render={(it, row) => {
          const p = `${prefix}.${row.index}`;
          const hasError = errors && Object.keys(errors).some((k) => k.startsWith(p + '.'));
          return (
            <Accordion type="multiple" value={openItems} onValueChange={setOpenItems} className="border rounded-sm bg-white">
              <AccordionItem value={`${row.index}`} className="border-0">
                <div className="flex items-center gap-2 px-2">
                  {row.handle}
                  <AccordionTrigger className="flex-1 py-2.5 hover:no-underline">
                    <span className="flex items-center gap-2 text-left"><span className="font-medium">{it.v.name || 'Untitled variant'}</span><span className="font-mono text-xs text-muted-foreground">{it.v.id}</span>{hasError && <Badge variant="destructive">Check fields</Badge>}{it.v.table && <Badge variant="outline">table</Badge>}{it.v.specImage && <Badge variant="outline">dimensions image</Badge>}</span>
                  </AccordionTrigger>
                  <Button type="button" variant="ghost" size="icon" aria-label="Duplicate" onClick={() => add(it.v)}><Copy className="size-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove variant" onClick={() => remove(row.index)}><Trash2 className="size-4" /></Button>
                </div>
                <AccordionContent className="px-3 pb-4 grid gap-4 border-t pt-3">
                  <div className="grid sm:grid-cols-[1fr_2fr] gap-3">
                    <TextField label="Id" mono value={it.v.id} onChange={(v) => update(row.index, { id: v.toLowerCase().replace(/[^a-z0-9-]+/g, '-') })} error={errorAt(errors, `${p}.id`)} help="Short, unique within the product" />
                    <TextField label="Name" value={it.v.name} onChange={(v) => update(row.index, { name: v })} error={errorAt(errors, `${p}.name`)} />
                  </div>
                  <TextAreaField label="Summary" rows={2} value={it.v.summary ?? ''} onChange={(v) => update(row.index, { summary: v || undefined })} />
                  <StringListField label="Bullet points (optional)" value={it.v.bullets} onChange={(v) => update(row.index, { bullets: v.length ? v : undefined })} addLabel="Add bullet" />
                  <FactsField label="Facts (optional)" value={it.v.facts} onChange={(v) => update(row.index, { facts: v.length ? v : undefined })} />
                  <ImageListField label="Drawings and photos" value={it.v.images} onChange={(v) => update(row.index, { images: v })} folder={folder} withCaption />
                  <div className="grid md:grid-cols-2 gap-3">
                    <ImageField label="Dimensions table image (optional)" optional value={it.v.specImage} onChange={(v) => update(row.index, { specImage: v })} folder={folder} />
                    <ImageField label="Second drawing image (optional)" optional value={it.v.specImage2} onChange={(v) => update(row.index, { specImage2: v })} folder={folder} />
                  </div>
                  {it.v.specImage && <TextField label="Button label for the dimensions image" value={it.v.specLabel ?? ''} onChange={(v) => update(row.index, { specLabel: v || undefined })} placeholder="View dimensions table" />}
                  {it.v.table
                    ? <div className="grid gap-2"><TableEditor label="Structured table" value={it.v.table} onChange={(tv) => update(row.index, { table: tv })} /><div><Button type="button" variant="ghost" size="sm" onClick={() => update(row.index, { table: undefined })}><X className="size-4" /> Remove table</Button></div></div>
                    : <div><Button type="button" variant="outline" size="sm" onClick={() => update(row.index, { table: { columns: ['Code', 'Size'], rows: [] } })}><Plus className="size-4" /> Add a structured table</Button></div>}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          );
        }} />
      <div><Button type="button" variant="outline" size="sm" onClick={() => add()}><Plus className="size-4" /> Add variant</Button></div>
    </FieldWrap>
  );
}

export function DownloadsField({ value, onChange, downloads, error }: { value: string[]; onChange: (v: string[]) => void; downloads: ItemSummary[]; error?: string }) {
  const [adding, setAdding] = useState('');
  const available = downloads.filter((d) => !d.pendingDeletion && !value.includes(d.slug));
  const nameOf = (slug: string) => downloads.find((d) => d.slug === slug)?.name ?? slug;
  return (
    <FieldWrap label="Datasheets and brochures linked from this product" error={error} help="At least one. The first is the main datasheet.">
      <SortableList items={value.map((slug, i) => ({ key: `${i}-${slug}`, slug }))} getId={(it) => it.key} onReorder={(next) => onChange(next.map((x) => x.slug))} className="grid gap-1.5"
        render={(it, row) => (
          <div className="flex items-center gap-2 border bg-white rounded-sm px-2 py-1">
            {row.handle}
            <span className="flex-1 text-sm">{nameOf(it.slug)} <span className="font-mono text-xs text-muted-foreground">{it.slug}</span></span>
            <Button type="button" variant="ghost" size="icon" aria-label="Unlink" onClick={() => onChange(value.filter((_, j) => j !== row.index))}><X className="size-4" /></Button>
          </div>
        )} />
      <div className="flex gap-2">
        <Select value={adding} onValueChange={setAdding}>
          <SelectTrigger className="w-80"><SelectValue placeholder="Link a datasheet…" /></SelectTrigger>
          <SelectContent>{available.map((d) => <SelectItem key={d.slug} value={d.slug}>{d.name} ({d.slug})</SelectItem>)}</SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" disabled={!adding} onClick={() => { onChange([...value, adding]); setAdding(''); }}><Plus className="size-4" /> Link</Button>
      </div>
    </FieldWrap>
  );
}
