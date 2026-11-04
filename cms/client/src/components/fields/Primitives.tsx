import { useEffect, useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { FieldWrap } from './Field';
import { SortableList } from '@/components/SortableList';
import { cn } from '@/lib/utils';

interface Base { label?: string; help?: string; error?: string; className?: string; disabled?: boolean }

export function TextField({ label, help, error, className, value, onChange, mono, placeholder, disabled }: Base & { value: string | null | undefined; onChange: (v: string) => void; mono?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <FieldWrap label={label} help={help} error={error} className={className} htmlFor={id}>
      <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={cn(mono && 'font-mono text-xs', error && 'border-destructive')} placeholder={placeholder} disabled={disabled} aria-invalid={!!error} />
    </FieldWrap>
  );
}

export function TextAreaField({ label, help, error, className, value, onChange, rows = 3, mono, disabled }: Base & { value: string | null | undefined; onChange: (v: string) => void; rows?: number; mono?: boolean }) {
  const id = useId();
  return (
    <FieldWrap label={label} help={help} error={error} className={className} htmlFor={id}>
      <Textarea id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} rows={rows} className={cn(mono && 'font-mono text-xs', error && 'border-destructive')} disabled={disabled} aria-invalid={!!error} />
    </FieldWrap>
  );
}

export function NumberField({ label, help, error, className, value, onChange, disabled, step }: Base & { value: number | null | undefined; onChange: (v: number | undefined) => void; step?: string }) {
  const id = useId();
  return (
    <FieldWrap label={label} help={help} error={error} className={className} htmlFor={id}>
      <Input id={id} type="number" step={step ?? 'any'} value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} className={cn(error && 'border-destructive')} disabled={disabled} />
    </FieldWrap>
  );
}

export function BooleanField({ label, help, error, className, value, onChange, disabled }: Base & { value: boolean | undefined; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <FieldWrap help={help} error={error} className={className}>
      <div className="flex items-center gap-2"><Switch id={id} checked={!!value} onCheckedChange={onChange} disabled={disabled} /><label htmlFor={id} className="text-sm">{label}</label></div>
    </FieldWrap>
  );
}

export function SelectField({ label, help, error, className, value, onChange, options, disabled, placeholder }: Base & { value: string | undefined; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return (
    <FieldWrap label={label} help={help} error={error} className={className}>
      <Select value={value ?? ''} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className={cn('w-full', error && 'border-destructive')}><SelectValue placeholder={placeholder ?? 'Choose…'} /></SelectTrigger>
        <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </FieldWrap>
  );
}

/** An ordered list of strings (paragraphs, bullet points, slugs). */
export function StringListField({ label, help, error, className, value, onChange, rows, mono, addLabel = 'Add', disabled }: Base & { value: string[] | undefined; onChange: (v: string[]) => void; rows?: number; mono?: boolean; addLabel?: string }) {
  const list = value ?? [];
  const update = (i: number, v: string) => onChange(list.map((x, j) => (j === i ? v : x)));
  return (
    <FieldWrap label={label} help={help} error={error} className={className}>
      <SortableList items={list.map((text, i) => ({ key: `${i}`, text }))} getId={(it) => it.key} onReorder={(next) => onChange(next.map((x) => x.text))} className="grid gap-1.5" disabled={disabled}
        render={(it, row) => (
          <div className="flex items-start gap-1">
            {row.handle}
            {rows && rows > 1
              ? <Textarea value={it.text} rows={rows} onChange={(e) => update(row.index, e.target.value)} className={cn('flex-1', mono && 'font-mono text-xs')} disabled={disabled} />
              : <Input value={it.text} onChange={(e) => update(row.index, e.target.value)} className={cn('flex-1', mono && 'font-mono text-xs')} disabled={disabled} />}
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(list.filter((_, j) => j !== row.index))} disabled={disabled}><X className="size-4" /></Button>
          </div>
        )} />
      <div><Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, ''])} disabled={disabled}><Plus className="size-4" /> {addLabel}</Button></div>
    </FieldWrap>
  );
}

/** Label / value pairs. */
export function FactsField({ label = 'Key facts', help, error, className, value, onChange, disabled }: Base & { value: Array<{ label: string; value: string }> | undefined; onChange: (v: Array<{ label: string; value: string }>) => void }) {
  const list = value ?? [];
  const update = (i: number, patch: Partial<{ label: string; value: string }>) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <FieldWrap label={label} help={help} error={error} className={className}>
      <SortableList items={list.map((f, i) => ({ key: `${i}`, ...f }))} getId={(it) => it.key} onReorder={(next) => onChange(next.map(({ label: l, value: v }) => ({ label: l, value: v })))} className="grid gap-1.5" disabled={disabled}
        render={(it, row) => (
          <div className="flex items-start gap-1">
            {row.handle}
            <Input value={it.label} placeholder="Label" onChange={(e) => update(row.index, { label: e.target.value })} className="w-1/3" disabled={disabled} />
            <Input value={it.value} placeholder="Value" onChange={(e) => update(row.index, { value: e.target.value })} className="flex-1" disabled={disabled} />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => onChange(list.filter((_, j) => j !== row.index))} disabled={disabled}><X className="size-4" /></Button>
          </div>
        )} />
      <div><Button type="button" variant="outline" size="sm" onClick={() => onChange([...list, { label: '', value: '' }])} disabled={disabled}><Plus className="size-4" /> Add fact</Button></div>
    </FieldWrap>
  );
}

const serialize = (v: unknown) => (v === undefined ? '' : JSON.stringify(v, null, 2));

/** A JSON textarea; `value` is re-read only when it changes from outside the editor. */
export function JsonField({ label, help, error, className, value, onChange, rows = 24 }: Base & { value: unknown; onChange: (v: unknown) => void; rows?: number }) {
  const [text, setText] = useState(() => serialize(value));
  const [problem, setProblem] = useState<string | undefined>();
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setText(serialize(value));
    setProblem(undefined);
  }, [value]);
  return (
    <FieldWrap label={label} help={help} error={error ?? problem} className={className}>
      <Textarea value={text} rows={rows} spellCheck={false} className="font-mono text-xs" onChange={(e) => {
        setText(e.target.value);
        try {
          const parsed: unknown = JSON.parse(e.target.value);
          emitted.current = parsed;
          onChange(parsed);
          setProblem(undefined);
        } catch (err) { setProblem((err as Error).message); }
      }} />
    </FieldWrap>
  );
}
