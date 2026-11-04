import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useItem, useItems, useItemMutations, errorsFrom, reportError } from '@/lib/items';
import { useDocument } from '@/lib/doc';
import type { FamilyBody, Image, ItemFull } from '@/lib/types';
import { slugify } from '@/lib/format';
import { EditorFrame, Section, StatusCard, VersionsCard } from '@/components/EditorFrame';
import { TextField, TextAreaField, SelectField } from '@/components/fields/Primitives';
import { ImageField } from '@/components/fields/ImageFields';
import { errorAt } from '@/components/fields/Field';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const ICONS = ['busbar', 'insulator', 'lug', 'rail', 'duct', 'earth'];
const blank = (): FamilyBody => ({ name: '', shortName: '', icon: 'busbar', summary: '', image: undefined as unknown as Image });

export function FamilyEditPage() {
  const { id: idParam } = useParams();
  const id = idParam ? Number(idParam) : undefined;
  const isNew = id === undefined;
  const navigate = useNavigate();
  const item = useItem<FamilyBody>('family', id);
  const products = useItems('product');
  const m = useItemMutations<FamilyBody>('family', id);
  const { doc, set, replace, dirty } = useDocument<FamilyBody>(isNew ? blank() : undefined);
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const edited = doc !== undefined && (dirty || (!isNew && !!item.data && slug !== item.data.item.slug));
  const sync = (r: ItemFull<FamilyBody>) => { replace(r.body); setSlug(r.item.slug); };
  useEffect(() => { if (item.data && !edited) sync(item.data); }, [item.data, edited]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (isNew && !slugTouched && doc?.name) setSlug(slugify(doc.name)); }, [doc?.name, isNew, slugTouched]);
  const save = async () => {
    if (!doc) return;
    setErrors({});
    try {
      if (isNew) { const c = await m.create.mutateAsync({ slug, body: doc }); sync(c); navigate(`/families/${c.item.id}`, { replace: true }); }
      else sync(await m.save.mutateAsync({ slug, body: doc }));
    } catch (e) { setErrors(errorsFrom(e)); reportError(e); }
  };
  if (!isNew && item.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!doc) return null;
  const members = (products.data ?? []).filter((p) => p.familyId === id);
  return (
    <EditorFrame kicker={isNew ? 'New family' : 'Family'} title={doc.name || 'Untitled family'} backTo="/families" backLabel="Families" dirty={edited || isNew} saving={m.save.isPending || m.create.isPending} onSave={save} errorSummary={Object.entries(errors).map(([p, e]) => `${p}: ${e}`)}
      sidebar={!isNew && item.data ? <>
        <StatusCard item={item.data.item} onStatus={(s) => m.setStatus.mutate(s)} onDiscard={() => m.discard.mutate(undefined, { onSuccess: sync })} onRestore={() => m.restore.mutate()} onDelete={() => m.remove.mutateAsync().then((r) => { if (r.hard) navigate('/families'); })} />
        <Card className="chamfer"><CardHeader className="pb-2"><CardTitle className="text-sm">Products in this family</CardTitle></CardHeader><CardContent className="text-sm grid gap-1">{members.map((p) => <Link key={p.id} to={`/products/${p.id}`} className="hover:underline truncate">{p.name}</Link>)}{!members.length && <span className="text-muted-foreground text-xs">None yet.</span>}</CardContent></Card>
        <VersionsCard versions={item.data.versions} onRevert={(v) => m.revert.mutate(v, { onSuccess: sync })} />
      </> : undefined}>
      <Section title="Basics">
        <div className="grid md:grid-cols-2 gap-4">
          <TextField label="Name" value={doc.name} onChange={(v) => set('name', v)} error={errorAt(errors, 'name')} />
          <TextField label="Short name (menu)" value={doc.shortName} onChange={(v) => set('shortName', v)} error={errorAt(errors, 'shortName')} />
          <TextField label="Slug" mono value={slug} onChange={(v) => { setSlug(v); setSlugTouched(true); }} error={errorAt(errors, 'slug')} help="Becomes /products/<slug>/" />
          <SelectField label="Icon" value={doc.icon} onChange={(v) => set('icon', v)} options={ICONS.map((i) => ({ value: i, label: i }))} error={errorAt(errors, 'icon')} />
        </div>
        <TextAreaField label="Summary" rows={2} value={doc.summary} onChange={(v) => set('summary', v)} error={errorAt(errors, 'summary')} />
      </Section>
      <Section title="Image" description="Shown on the family page and the products overview."><ImageField value={doc.image} onChange={(v) => set('image', v)} error={errorAt(errors, 'image') ?? errorAt(errors, 'image.src')} /></Section>
    </EditorFrame>
  );
}
