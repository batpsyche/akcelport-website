import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { FileText, Replace } from 'lucide-react';
import { useItem, useItemMutations, errorsFrom, reportError } from '@/lib/items';
import { useDocument } from '@/lib/doc';
import type { DownloadBody, Image, ItemFull } from '@/lib/types';
import { slugify, formatBytes } from '@/lib/format';
import { EditorFrame, Section, StatusCard, VersionsCard } from '@/components/EditorFrame';
import { TextField, TextAreaField, SelectField, NumberField } from '@/components/fields/Primitives';
import { ImageField } from '@/components/fields/ImageFields';
import { FieldWrap, errorAt } from '@/components/fields/Field';
import { MediaPicker } from '@/components/MediaPicker';
import { Button } from '@/components/ui/button';

const blank = (): DownloadBody => ({ title: '', kind: 'catalogue', file: '', description: '', pages: 0, sizeBytes: 0, thumb: '' });

export function DownloadEditPage() {
  const { id } = useParams();
  return <DownloadEditor key={id ?? 'new'} id={id ? Number(id) : undefined} />;
}

function DownloadEditor({ id }: { id: number | undefined }) {
  const isNew = id === undefined;
  const navigate = useNavigate();
  const item = useItem<DownloadBody>('download', id);
  const m = useItemMutations<DownloadBody>('download', id);
  const { doc, set, replace, dirty } = useDocument<DownloadBody>(isNew ? blank() : undefined);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickPdf, setPickPdf] = useState(false);
  const edited = doc !== undefined && (dirty || (!isNew && !!item.data && slug !== item.data.item.slug));
  const sync = (r: ItemFull<DownloadBody>) => { replace(r.body); setSlug(r.item.slug); };
  useEffect(() => { if (item.data && !edited) sync(item.data); }, [item.data, edited]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isNew && !slugTouched && doc?.title) setSlug(slugify(doc.title)); }, [doc?.title, isNew, slugTouched]);
  const save = async () => {
    if (!doc) return;
    setErrors({});
    try {
      if (isNew) { const c = await m.create.mutateAsync({ slug, body: doc }); navigate(`/downloads/${c.item.id}`, { replace: true }); }
      else sync(await m.save.mutateAsync({ slug, body: doc }));
    } catch (e) { setErrors(errorsFrom(e)); reportError(e); }
  };
  if (!isNew && item.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!doc) return null;
  const thumb: Image | undefined = doc.thumb ? { src: doc.thumb, w: 1, h: 1, alt: '' } : undefined;
  return (
    <EditorFrame kicker={isNew ? 'New download' : 'Download'} title={doc.title || 'Untitled download'} backTo="/downloads" backLabel="Downloads" dirty={edited || isNew} saving={m.save.isPending || m.create.isPending} onSave={save} errorSummary={Object.entries(errors).map(([p, e]) => `${p}: ${e}`)}
      sidebar={!isNew && item.data ? <>
        <StatusCard item={item.data.item} onStatus={(s) => m.setStatus.mutate(s)} onDiscard={() => m.discard.mutate(undefined, { onSuccess: sync })} onRestore={() => m.restore.mutate()} onDelete={() => m.remove.mutateAsync().then((r) => { if (r.hard) navigate('/downloads'); })} />
        <VersionsCard versions={item.data.versions} onRevert={(v) => m.revert.mutate(v, { onSuccess: sync })} />
      </> : undefined}>
      <Section title="Document">
        <div className="grid md:grid-cols-2 gap-4">
          <TextField label="Title" value={doc.title} onChange={(v) => set('title', v)} error={errorAt(errors, 'title')} />
          <TextField label="Id" mono value={slug} onChange={(v) => { setSlug(v); setSlugTouched(true); }} error={errorAt(errors, 'slug')} help="Used to link the document from products; it can only be renamed while no product links it." />
          <SelectField label="Kind" value={doc.kind} onChange={(v) => set('kind', v)} options={[{ value: 'catalogue', label: 'Current datasheet (catalogue)' }, { value: 'legacy', label: 'Old-site PDF (legacy)' }]} />
        </div>
        <TextAreaField label="Description" rows={2} value={doc.description} onChange={(v) => set('description', v)} error={errorAt(errors, 'description')} />
      </Section>
      <Section title="PDF file">
        <FieldWrap error={errorAt(errors, 'file')}>
          <div className="flex items-center gap-3 border bg-white p-3 rounded-sm">
            <FileText className="size-8 text-primary shrink-0" />
            <div className="flex-1 min-w-0 text-sm">{doc.file ? <><div className="font-mono text-xs truncate">{doc.file}</div><div className="text-muted-foreground text-xs">{doc.pages} pages · {formatBytes(doc.sizeBytes)}</div></> : <span className="text-muted-foreground">No PDF chosen</span>}</div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPickPdf(true)}><Replace className="size-4" /> {doc.file ? 'Change' : 'Choose PDF'}</Button>
          </div>
        </FieldWrap>
        <div className="grid md:grid-cols-2 gap-4">
          <NumberField label="Pages" value={doc.pages} onChange={(v) => set('pages', v ?? 0)} help="Filled from the file; correct it if needed." />
          <NumberField label="Size in bytes" value={doc.sizeBytes} onChange={(v) => set('sizeBytes', v ?? 0)} />
        </div>
        <MediaPicker open={pickPdf} onOpenChange={setPickPdf} kind="pdf" defaultFolder={`downloads/${doc.kind}`} onSelect={(mrow) => { set('file', `/${mrow.path}`); set('sizeBytes', mrow.bytes); if (mrow.pages) set('pages', mrow.pages); }} />
      </Section>
      <Section title="Thumbnail" description="The cover image shown on the Downloads page (a WebP or PNG of the first page works well).">
        <ImageField compact value={thumb} onChange={(v) => set('thumb', v?.src ?? '')} folder="img/downloads" error={errorAt(errors, 'thumb')} />
      </Section>
    </EditorFrame>
  );
}
