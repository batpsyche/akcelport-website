// Renders a document form from a FieldSpec list (site-wide documents and settings).
import { Plus, Trash2 } from 'lucide-react';
import type { FieldSpec } from '@shared/page-fields';
import { getPath, joinPath } from '@/lib/doc';
import type { Image } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { type Errors, errorAt } from './Field';
import { TextField, TextAreaField, NumberField, BooleanField, SelectField, StringListField, JsonField } from './Primitives';
import { ImageField, ImageListField } from './ImageFields';
import { SortableList } from '@/components/SortableList';

interface Props { fields: FieldSpec[]; doc: unknown; set: (path: string, value: unknown) => void; errors?: Errors; base?: string; folder?: string }

export function SpecForm({ fields, doc, set, errors, base = '', folder }: Props) {
  return (
    <div className="grid gap-4">
      {fields.map((f) => <SpecField key={f.path} spec={f} doc={doc} set={set} errors={errors} base={base} folder={folder} />)}
    </div>
  );
}

function SpecField({ spec, doc, set, errors, base, folder }: { spec: FieldSpec } & Omit<Props, 'fields'> & { base: string }) {
  const path = joinPath(base, spec.path);
  const value = getPath(doc, path);
  const error = errorAt(errors, path);
  const help = 'help' in spec ? spec.help : undefined;
  switch (spec.type) {
    case 'text': return <TextField label={spec.label} help={help} error={error} value={value as string} onChange={(v) => set(path, v)} mono={spec.mono} />;
    case 'textarea': return <TextAreaField label={spec.label} help={help} error={error} value={value as string} onChange={(v) => set(path, v)} rows={spec.rows} mono={spec.mono} />;
    case 'number': return <NumberField label={spec.label} help={help} error={error} value={value as number} onChange={(v) => set(path, v)} />;
    case 'boolean': return <BooleanField label={spec.label} help={help} error={error} value={value as boolean} onChange={(v) => set(path, v)} />;
    case 'select': return <SelectField label={spec.label} help={help} error={error} value={value as string} onChange={(v) => set(path, v)} options={spec.options} />;
    case 'string-list': return <StringListField label={spec.label} help={help} error={error} value={value as string[]} onChange={(v) => set(path, v)} rows={spec.rows} mono={spec.mono} />;
    case 'image': return <ImageField label={spec.label} help={help} error={error} value={value as Image} onChange={(v) => set(path, v)} folder={folder} />;
    case 'image-list': return <ImageListField label={spec.label} help={help} error={error} value={value as Image[]} onChange={(v) => set(path, v)} folder={folder} />;
    case 'json': return <JsonField label={spec.label} help={help} error={error} value={value} onChange={(v) => set(path, v)} />;
    case 'group':
      return (
        <Card className="chamfer">
          <CardHeader className="pb-2"><CardTitle className="text-base">{spec.label}</CardTitle>{help && <CardDescription>{help}</CardDescription>}</CardHeader>
          <CardContent><SpecForm fields={spec.fields} doc={doc} set={set} errors={errors} base={path} folder={folder} /></CardContent>
        </Card>
      );
    case 'object-list': {
      const list = (value as Array<Record<string, unknown>> | undefined) ?? [];
      const blank = () => Object.fromEntries(spec.fields.map((f) => [f.path, f.type === 'string-list' || f.type === 'image-list' || f.type === 'object-list' ? [] : f.type === 'boolean' ? false : f.type === 'number' ? undefined : f.type === 'image' ? undefined : '']));
      return (
        <Card className="chamfer">
          <CardHeader className="pb-2"><CardTitle className="text-base">{spec.label}</CardTitle>{help && <CardDescription>{help}</CardDescription>}{error && <p className="text-xs text-destructive">{error}</p>}</CardHeader>
          <CardContent className="grid gap-3">
            <SortableList items={list.map((item, i) => ({ key: `${i}`, item }))} getId={(it) => it.key} onReorder={(next) => set(path, next.map((x) => x.item))} className="grid gap-3"
              render={(it, row) => (
                <div className="border rounded-sm p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-2">
                    {row.handle}
                    <span className="text-sm font-medium flex-1">{spec.itemLabel} {row.index + 1}{spec.titleField && it.item[spec.titleField] ? <span className="text-muted-foreground font-normal"> · {String(it.item[spec.titleField])}</span> : null}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => set(path, list.filter((_, j) => j !== row.index))}><Trash2 className="size-4" /></Button>
                  </div>
                  <SpecForm fields={spec.fields} doc={doc} set={set} errors={errors} base={joinPath(path, row.index)} folder={folder} />
                </div>
              )} />
            <div><Button type="button" variant="outline" size="sm" onClick={() => set(path, [...list, blank()])}><Plus className="size-4" /> Add {spec.itemLabel.toLowerCase()}</Button></div>
          </CardContent>
        </Card>
      );
    }
  }
}
