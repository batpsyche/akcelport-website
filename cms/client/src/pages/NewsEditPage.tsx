import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { FileText, Replace, X } from 'lucide-react';
import { useItem, useItemMutations, errorsFrom, reportError } from '@/lib/items';
import { useDocument } from '@/lib/doc';
import type { NewsBody, ItemFull } from '@/lib/types';
import { slugify, formatBytes } from '@/lib/format';
import { EditorFrame, Section, StatusCard, VersionsCard } from '@/components/EditorFrame';
import { TextField, TextAreaField } from '@/components/fields/Primitives';
import { ImageField } from '@/components/fields/ImageFields';
import { RichTextField } from '@/components/fields/RichTextField';
import { FieldWrap, errorAt } from '@/components/fields/Field';
import { MediaPicker } from '@/components/MediaPicker';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const CATEGORIES = ['Company', 'Product', 'Events'];
const today = () => new Date().toISOString().slice(0, 10);
const blank = (): NewsBody => ({ title: '', date: today(), category: 'Company', summary: '', body: { type: 'doc', content: [{ type: 'paragraph' }] } });

export function NewsEditPage() {
  const { id } = useParams();
  return <NewsEditor key={id ?? 'new'} id={id ? Number(id) : undefined} />;
}

function NewsEditor({ id }: { id: number | undefined }) {
  const isNew = id === undefined;
  const navigate = useNavigate();
  const item = useItem<NewsBody>('news', id);
  const m = useItemMutations<NewsBody>('news', id);
  const { doc, set, replace, dirty } = useDocument<NewsBody>(isNew ? blank() : undefined);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pickPdf, setPickPdf] = useState(false);
  const dateId = useId();
  const catId = useId();
  const edited = doc !== undefined && (dirty || (!isNew && !!item.data && slug !== item.data.item.slug));
  const sync = (r: ItemFull<NewsBody>) => { replace(r.body); setSlug(r.item.slug); };
  useEffect(() => { if (item.data && !edited) sync(item.data); }, [item.data, edited]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isNew && !slugTouched && doc?.title) setSlug(slugify(doc.title)); }, [doc?.title, isNew, slugTouched]);
  const save = async () => {
    if (!doc) return;
    setErrors({});
    try {
      if (isNew) { const c = await m.create.mutateAsync({ slug, body: doc }); navigate(`/news/${c.item.id}`, { replace: true }); }
      else sync(await m.save.mutateAsync({ slug, body: doc }));
    } catch (e) { setErrors(errorsFrom(e)); reportError(e); }
  };
  if (!isNew && item.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!doc) return null;
  const bodyError = Object.entries(errors).find(([p]) => p === 'body' || p.startsWith('body.'))?.[1];
  return (
    <EditorFrame kicker={isNew ? 'New news post' : 'News post'} title={doc.title || 'Untitled post'} backTo="/news" backLabel="News" dirty={edited || isNew} saving={m.save.isPending || m.create.isPending} onSave={save} errorSummary={Object.entries(errors).map(([p, e]) => `${p}: ${e}`)}
      sidebar={!isNew && item.data ? <>
        <StatusCard item={item.data.item} onStatus={(s) => m.setStatus.mutate(s)} onDiscard={() => m.discard.mutate(undefined, { onSuccess: sync })} onRestore={() => m.restore.mutate()} onDelete={() => m.remove.mutateAsync().then((r) => { if (r.hard) navigate('/news'); })} />
        <VersionsCard versions={item.data.versions} onRevert={(v) => m.revert.mutate(v, { onSuccess: sync })} />
      </> : undefined}>
      <Section title="Post">
        <TextField label="Title" value={doc.title} onChange={(v) => set('title', v)} error={errorAt(errors, 'title')} />
        <div className="grid md:grid-cols-3 gap-4">
          <TextField label="Slug" mono value={slug} onChange={(v) => { setSlug(v); setSlugTouched(true); }} error={errorAt(errors, 'slug')} help={`The address: /news/${slug || '…'}/`} />
          <FieldWrap label="Date" htmlFor={dateId} error={errorAt(errors, 'date')}>
            <Input id={dateId} type="date" value={doc.date} onChange={(e) => set('date', e.target.value)} aria-invalid={!!errorAt(errors, 'date')} />
          </FieldWrap>
          <FieldWrap label="Category" htmlFor={catId} error={errorAt(errors, 'category')} help="Company, Product, Events or your own.">
            <Input id={catId} list={`${catId}-list`} value={doc.category} onChange={(e) => set('category', e.target.value)} aria-invalid={!!errorAt(errors, 'category')} />
            <datalist id={`${catId}-list`}>{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </FieldWrap>
        </div>
        <TextAreaField label="Summary" rows={2} value={doc.summary} onChange={(v) => set('summary', v)} error={errorAt(errors, 'summary')} help="One or two sentences, shown on the news cards and under the title." />
      </Section>
      <Section title="Text">
        <RichTextField value={doc.body} onChange={(v) => set('body', v)} error={bodyError} />
      </Section>
      <Section title="Cover image" description="Optional. Shown on the news cards and at the top of the post; a wide photo works best.">
        <ImageField optional withCaption value={doc.cover} onChange={(v) => set('cover', v)} folder="img/news" error={errorAt(errors, 'cover.src')} />
      </Section>
      <Section title="PDF download" description="Optional. Adds a download button to the post.">
        <FieldWrap error={errorAt(errors, 'pdf.file')}>
          <div className="flex items-center gap-3 border bg-white p-3 rounded-sm">
            <FileText className="size-8 text-primary shrink-0" />
            <div className="flex-1 min-w-0 text-sm">{doc.pdf ? <><div className="font-mono text-xs truncate">{doc.pdf.file}</div><div className="text-muted-foreground text-xs">{doc.pdf.pages ? `${doc.pdf.pages} pages · ` : ''}{formatBytes(doc.pdf.sizeBytes)}</div></> : <span className="text-muted-foreground">No PDF attached</span>}</div>
            <Button type="button" variant="outline" size="sm" onClick={() => setPickPdf(true)}><Replace className="size-4" /> {doc.pdf ? 'Change' : 'Attach PDF'}</Button>
            {doc.pdf && <Button type="button" variant="ghost" size="sm" onClick={() => set('pdf', undefined)}><X className="size-4" /> Remove</Button>}
          </div>
        </FieldWrap>
        {doc.pdf && <TextField label="Button label" value={doc.pdf.title} onChange={(v) => set('pdf.title', v || undefined)} placeholder="Attached document" help="The document name shown next to the download button." />}
        <MediaPicker open={pickPdf} onOpenChange={setPickPdf} kind="pdf" defaultFolder="downloads/news" onSelect={(row) => set('pdf', { ...(doc.pdf?.title ? { title: doc.pdf.title } : {}), file: `/${row.path}`, sizeBytes: row.bytes, ...(row.pages ? { pages: row.pages } : {}) })} />
      </Section>
    </EditorFrame>
  );
}
