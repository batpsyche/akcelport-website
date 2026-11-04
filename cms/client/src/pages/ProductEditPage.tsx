import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useItem, useItems, useItemMutations, errorsFrom, reportError } from '@/lib/items';
import { useDocument } from '@/lib/doc';
import type { ProductBody, Image, ItemFull } from '@/lib/types';
import { slugify } from '@/lib/format';
import { EditorFrame, Section, StatusCard, VersionsCard } from '@/components/EditorFrame';
import { TextField, TextAreaField, SelectField, StringListField, FactsField } from '@/components/fields/Primitives';
import { ImageField, ImageListField } from '@/components/fields/ImageFields';
import { SpecTablesField, VariantsField, DownloadsField } from '@/components/fields/ProductEditors';
import { errorAt } from '@/components/fields/Field';
import { Button } from '@/components/ui/button';

const blank = (): ProductBody => ({ name: '', legacyUrl: null, source: 'new', summary: '', facts: [], intro: [''], features: [], hero: undefined as unknown as Image, seo: { title: '', description: '' }, downloads: [] });

/** One editor instance per item: the route id is the key, so switching items always starts from that item's data. */
export function ProductEditPage() {
  const { id } = useParams();
  return <ProductEditor key={id ?? 'new'} id={id ? Number(id) : undefined} />;
}

function ProductEditor({ id }: { id: number | undefined }) {
  const isNew = id === undefined;
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const families = useItems('family');
  const downloads = useItems('download');
  const item = useItem<ProductBody>('product', id);
  const m = useItemMutations<ProductBody>('product', id);
  const { doc, set, replace, dirty } = useDocument<ProductBody>(isNew ? blank() : undefined);
  const [slug, setSlug] = useState('');
  const [familyId, setFamilyId] = useState<number | undefined>(params.get('family') ? Number(params.get('family')) : undefined);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const edited = doc !== undefined && (dirty || (!isNew && !!item.data && (slug !== item.data.item.slug || familyId !== item.data.item.familyId)));
  const sync = (r: ItemFull<ProductBody>) => { replace(r.body); setSlug(r.item.slug); setFamilyId(r.item.familyId); };
  useEffect(() => { if (item.data && !edited) sync(item.data); }, [item.data, edited]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isNew && !slugTouched && doc?.name) setSlug(slugify(doc.name)); }, [doc?.name, isNew, slugTouched]);
  const folder = useMemo(() => (slug ? `img/products/${slug}` : undefined), [slug]);
  const familyOptions = (families.data ?? []).filter((f) => !f.pendingDeletion).map((f) => ({ value: String(f.id), label: f.name }));
  const errorSummary = Object.entries(errors).map(([p, msg]) => `${p}: ${msg}`);

  const save = async () => {
    if (!doc) return;
    setErrors({});
    try {
      if (isNew) {
        const created = await m.create.mutateAsync({ slug, familyId, body: doc });
        navigate(`/products/${created.item.id}`, { replace: true });
      } else {
        sync(await m.save.mutateAsync({ slug, familyId, body: doc }));
      }
    } catch (e) { setErrors(errorsFrom(e)); reportError(e); }
  };

  if (!isNew && item.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!isNew && item.isError) return <p className="text-destructive">Product not found.</p>;
  if (!doc) return null;
  const d = doc;
  return (
    <EditorFrame kicker={isNew ? 'New product' : 'Product'} title={d.name || 'Untitled product'} backTo="/products" backLabel="Products" dirty={edited || isNew} saving={m.save.isPending || m.create.isPending} onSave={save} errorSummary={errorSummary}
      sidebar={!isNew && item.data ? <>
        <StatusCard item={item.data.item} onStatus={(s) => m.setStatus.mutate(s)} onDiscard={() => m.discard.mutate(undefined, { onSuccess: sync })} onRestore={() => m.restore.mutate()}
          onDelete={() => m.remove.mutateAsync().then((r) => { if (r.hard) navigate('/products'); })}
          extra={<a className="text-xs underline text-muted-foreground" href={`/preview/products/${item.data.item.slug}/`} target="_blank" rel="noreferrer">Open in the last preview build</a>} />
        <VersionsCard versions={item.data.versions} onRevert={(v) => m.revert.mutate(v, { onSuccess: sync })} />
      </> : undefined}>
      <Section title="Basics">
        <div className="grid md:grid-cols-2 gap-4">
          <TextField label="Name" value={d.name} onChange={(v) => set('name', v)} error={errorAt(errors, 'name')} />
          <TextField label="Slug (page address)" mono value={slug} onChange={(v) => { setSlug(v); setSlugTouched(true); }} error={errorAt(errors, 'slug')} help={isNew ? 'Lowercase letters, digits and hyphens. Becomes /products/<slug>/.' : 'Changing it changes the page address at the next publish; add a redirect from the old one.'} />
          <SelectField label="Family" value={familyId ? String(familyId) : undefined} onChange={(v) => setFamilyId(Number(v))} options={familyOptions} error={errorAt(errors, 'familyId')} />
          <SelectField label="Source" value={d.source} onChange={(v) => set('source', v)} options={[{ value: 'existing', label: 'Existing (was on the old site)' }, { value: 'new', label: 'New range' }]} />
          <TextField label="Old site page (optional)" mono value={d.legacyUrl ?? ''} onChange={(v) => set('legacyUrl', v || null)} placeholder="cable-lugs.php" />
          <TextField label="Label for the variants section (optional)" value={d.variantsLabel ?? ''} onChange={(v) => set('variantsLabel', v || undefined)} placeholder="Types and variants" />
        </div>
        <TextAreaField label="Summary" rows={2} value={d.summary} onChange={(v) => set('summary', v)} error={errorAt(errors, 'summary')} help="One or two sentences shown on cards and at the top of the page." />
      </Section>
      <Section title="Key facts" description="Short label and value pairs shown beside the main photo."><FactsField label={undefined} value={d.facts} onChange={(v) => set('facts', v)} error={errorAt(errors, 'facts')} /></Section>
      <Section title="Text">
        <StringListField label="Introduction paragraphs" rows={3} value={d.intro} onChange={(v) => set('intro', v)} addLabel="Add paragraph" error={errorAt(errors, 'intro')} />
        <StringListField label="Features" value={d.features} onChange={(v) => set('features', v)} addLabel="Add feature" error={errorAt(errors, 'features')} />
        <StringListField label="Applications (optional)" value={d.applications} onChange={(v) => set('applications', v.length ? v : undefined)} addLabel="Add application" />
        <StringListField label="Notes shown in a callout (optional)" rows={2} value={d.notes} onChange={(v) => set('notes', v.length ? v : undefined)} addLabel="Add note" />
      </Section>
      <Section title="Photos" description="The main photo is used on the product page, the family page and cards.">
        <ImageField label="Main photo" value={d.hero} onChange={(v) => set('hero', v)} folder={folder} error={errorAt(errors, 'hero') ?? errorAt(errors, 'hero.src')} />
        <ImageListField label="Gallery" value={d.gallery} onChange={(v) => set('gallery', v.length ? v : undefined)} folder={folder} withCaption />
        {d.busbarSupports
          ? <ImageListField label="Catalogue pages gallery (tall images)" value={d.busbarSupports} onChange={(v) => set('busbarSupports', v.length ? v : undefined)} folder={folder} />
          : <div><Button type="button" variant="ghost" size="sm" onClick={() => set('busbarSupports', [])}>Add a catalogue-pages gallery</Button></div>}
      </Section>
      <Section title="Types and variants" id="variants"><VariantsField value={d.variants} onChange={(v) => set('variants', v)} errors={errors} folder={folder} /></Section>
      <Section title="Specification tables" id="tables"><SpecTablesField value={d.tables} onChange={(v) => set('tables', v)} errors={errors} /></Section>
      <Section title="Datasheets"><DownloadsField value={d.downloads} onChange={(v) => set('downloads', v)} downloads={downloads.data ?? []} error={errorAt(errors, 'downloads')} /></Section>
      <Section title="Search engines">
        <TextField label="Page title" value={d.seo?.title ?? ''} onChange={(v) => set('seo.title', v)} error={errorAt(errors, 'seo.title')} placeholder={`${d.name} | Akcelport Industries`} />
        <TextAreaField label="Meta description" rows={2} value={d.seo?.description ?? ''} onChange={(v) => set('seo.description', v)} error={errorAt(errors, 'seo.description')} />
      </Section>
    </EditorFrame>
  );
}
