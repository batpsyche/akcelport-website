import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RotateCcw, Code2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDocument } from '@/lib/doc';
import { errorsFrom, reportError } from '@/lib/items';
import type { PageFull, Image } from '@/lib/types';
import { pageFieldSpecs } from '@shared/page-fields';
import { formatDate } from '@/lib/format';
import { EditorFrame, Section, VersionsCard } from '@/components/EditorFrame';
import { SpecForm } from '@/components/fields/SpecForm';
import { JsonField, TextField } from '@/components/fields/Primitives';
import { ImageField } from '@/components/fields/ImageFields';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SortableList } from '@/components/SortableList';

export function usePageDoc(key: string) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['page', key], queryFn: () => api.get<PageFull>(`/api/pages/${key}`) });
  const invalidate = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['page', key] }), qc.invalidateQueries({ queryKey: ['pages'] }), qc.invalidateQueries({ queryKey: ['pending'] })]); };
  const save = useMutation({ mutationFn: (body: unknown) => api.put<PageFull>(`/api/pages/${key}`, { body }), onSuccess: async () => { await invalidate(); toast.success('Saved as draft'); } });
  const discard = useMutation({ mutationFn: () => api.post<PageFull>(`/api/pages/${key}/discard`), onSuccess: async () => { await invalidate(); toast.success('Draft discarded'); }, onError: reportError });
  const revert = useMutation({ mutationFn: (versionId: number) => api.post<PageFull>(`/api/pages/${key}/revert`, { versionId }), onSuccess: async () => { await invalidate(); toast.success('Version restored as the draft'); }, onError: reportError });
  return { query, save, discard, revert };
}

export function PageEditor({ pageKey, kicker, backTo, backLabel, extraSidebar }: { pageKey: string; kicker: string; backTo: string; backLabel: string; extraSidebar?: React.ReactNode }) {
  const { me } = useAuth();
  const { query, save, discard, revert } = usePageDoc(pageKey);
  const { doc, set, replace, dirty } = useDocument<Record<string, unknown>>(undefined);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => { if (query.data) replace(query.data.body); }, [query.data, replace]);
  const spec = pageFieldSpecs[pageKey];
  const onSave = async () => {
    if (!doc) return;
    setErrors({});
    try { const r = await save.mutateAsync(doc); replace(r.body); } catch (e) { setErrors(errorsFrom(e)); reportError(e); }
  };
  if (query.isLoading || !doc) return <p className="text-muted-foreground">Loading…</p>;
  const data = query.data!;
  return (
    <EditorFrame kicker={kicker} title={spec?.title ?? (pageKey === 'company-images' ? 'Company images' : pageKey)} backTo={backTo} backLabel={backLabel} dirty={dirty} saving={save.isPending} onSave={onSave} errorSummary={Object.entries(errors).map(([p, e]) => `${p}: ${e}`)}
      sidebar={<>
        <Card className="chamfer">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Status</CardTitle></CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {data.hasDraft ? <Badge className="bg-primary text-white w-fit">Draft changes</Badge> : <span className="text-xs text-muted-foreground">Published and up to date.</span>}
            <div className="text-xs text-muted-foreground">Last change {formatDate(data.updatedAt)}</div>
            {data.hasDraft && <ConfirmDialog trigger={<Button variant="outline" size="sm"><RotateCcw className="size-4" /> Discard draft</Button>} title="Discard the draft?" description="The unpublished changes are dropped." confirmLabel="Discard" onConfirm={() => discard.mutate()} />}
            {me?.user.role === 'admin' && <Button variant="ghost" size="sm" onClick={() => setAdvanced((a) => !a)}><Code2 className="size-4" /> {advanced ? 'Back to the form' : 'Edit as JSON'}</Button>}
          </CardContent>
        </Card>
        {extraSidebar}
        <VersionsCard versions={data.versions} onRevert={(v) => revert.mutate(v)} />
      </>}>
      {spec && <p className="text-sm text-muted-foreground -mt-2">{spec.description}</p>}
      {advanced
        ? <Section title="Document JSON" description="The whole document as stored. Every key the templates read must stay present."><JsonField value={doc} onChange={(v) => replace(v as Record<string, unknown>, false)} /></Section>
        : pageKey === 'company-images'
          ? <CompanyImagesEditor doc={doc as Record<string, Image>} onChange={(v) => replace(v as Record<string, unknown>, false)} />
          : spec ? <SpecForm fields={spec.fields} doc={doc} set={set} errors={errors} /> : null}
    </EditorFrame>
  );
}

function CompanyImagesEditor({ doc, onChange }: { doc: Record<string, Image>; onChange: (v: Record<string, Image>) => void }) {
  const entries = Object.entries(doc);
  const rebuild = (list: Array<[string, Image]>) => onChange(Object.fromEntries(list));
  return (
    <Section title="Company images" description="Brochure imagery referenced by key from the About page. Keys must stay unique.">
      <SortableList items={entries.map(([k, im], i) => ({ id: `${i}`, k, im }))} getId={(e) => e.id} onReorder={(next) => rebuild(next.map((e) => [e.k, e.im]))} className="grid gap-3"
        render={(e, row) => (
          <div className="flex items-start gap-2">
            {row.handle}
            <div className="grid gap-2 flex-1">
              <TextField label="Key" mono value={e.k} onChange={(v) => rebuild(entries.map(([k, im], j) => (j === row.index ? [v, im] : [k, im])))} />
              <ImageField compact value={e.im} onChange={(v) => rebuild(entries.map(([k, im], j) => (j === row.index ? [k, v as Image] : [k, im])))} folder="img/company" />
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => rebuild(entries.filter((_, j) => j !== row.index))}>Remove</Button>
          </div>
        )} />
      <div><Button type="button" variant="outline" size="sm" onClick={() => rebuild([...entries, [`image-${entries.length + 1}`, { src: '', w: 1, h: 1 }]])}>Add image</Button></div>
    </Section>
  );
}

export function PageEditPage() {
  const { key } = useParams();
  if (!key || key === 'site') return <p className="text-destructive">Unknown page.</p>;
  return <PageEditor pageKey={key} kicker="Site text" backTo="/pages" backLabel="Pages" />;
}
