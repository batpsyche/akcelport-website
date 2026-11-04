import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft, Save, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ItemBadges } from '@/components/StatusBadges';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import type { ItemSummary, Version } from '@/lib/types';
import { formatDate } from '@/lib/format';

export function EditorFrame({ kicker, title, backTo, backLabel, dirty, saving, onSave, children, sidebar, errorSummary }: { kicker: string; title: ReactNode; backTo: string; backLabel: string; dirty: boolean; saving: boolean; onSave: () => void; children: ReactNode; sidebar?: ReactNode; errorSummary?: string[] }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button asChild variant="ghost" size="sm"><Link to={backTo}><ArrowLeft className="size-4" /> {backLabel}</Link></Button>
        <div className="min-w-0"><div className="kicker">{kicker}</div><h1 className="text-xl md:text-2xl truncate">{title}</h1></div>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button onClick={onSave} disabled={saving || !dirty}><Save className="size-4" /> {saving ? 'Saving…' : 'Save draft'}</Button>
        </div>
      </div>
      {errorSummary && errorSummary.length > 0 && (
        <div className="mb-4 border border-destructive/40 bg-destructive/5 text-sm p-3 rounded-sm">
          <div className="font-medium text-destructive mb-1">Please fix these fields</div>
          <ul className="list-disc pl-5 text-destructive/90">{errorSummary.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="grid gap-4 min-w-0">{children}</div>
        {sidebar && <div className="lg:sticky lg:top-20 grid gap-4">{sidebar}</div>}
      </div>
    </div>
  );
}

export function Section({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return (
    <Card id={id} className="chamfer">
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle>{description && <p className="text-xs text-muted-foreground">{description}</p>}</CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

export function StatusCard({ item, onStatus, onDiscard, onDelete, onRestore, deleteLabel = 'Delete', extra }: { item: ItemSummary; onStatus: (s: 'hidden' | 'live') => void; onDiscard: () => void; onDelete: () => void; onRestore: () => void; deleteLabel?: string; extra?: ReactNode }) {
  return (
    <Card className="chamfer">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Status</CardTitle></CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <ItemBadges item={item} />
        {!item.pending && <p className="text-muted-foreground text-xs">Published and up to date.</p>}
        <div className="text-xs text-muted-foreground">Last change {formatDate(item.updatedAt)}</div>
        {extra}
        <div className="grid gap-2">
          {item.status === 'live'
            ? <Button variant="outline" size="sm" onClick={() => onStatus('hidden')}>Hide from the site</Button>
            : <Button variant="outline" size="sm" onClick={() => onStatus('live')}>Show on the site</Button>}
          {item.hasDraft && !item.neverPublished && <ConfirmDialog trigger={<Button variant="outline" size="sm"><RotateCcw className="size-4" /> Discard draft</Button>} title="Discard the draft?" description="The unpublished changes are dropped and the live version is shown again. Versions are kept." confirmLabel="Discard" onConfirm={onDiscard} />}
          {item.pendingDeletion
            ? <Button variant="outline" size="sm" onClick={onRestore}>Cancel deletion</Button>
            : <ConfirmDialog trigger={<Button variant="destructive" size="sm">{deleteLabel}</Button>} title={item.neverPublished ? 'Delete permanently?' : 'Delete at the next publish?'} description={item.neverPublished ? 'This item was never published and will be removed now.' : 'The item stays on the site until the next publish and can be restored until then.'} confirmLabel="Delete" destructive onConfirm={onDelete} />}
        </div>
      </CardContent>
    </Card>
  );
}

export function VersionsCard({ versions, onRevert }: { versions: Version[]; onRevert: (versionId: number) => void }) {
  return (
    <Card className="chamfer">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Versions</CardTitle></CardHeader>
      <CardContent className="grid gap-1 text-xs max-h-80 overflow-auto">
        {!versions.length && <p className="text-muted-foreground">No saved versions yet.</p>}
        {versions.map((v, i) => (
          <div key={v.id} className="flex items-center gap-2 py-1 border-b last:border-0">
            <span className="font-mono text-muted-foreground w-7">v{v.versionNo}</span>
            <span className="flex-1 min-w-0"><span className="block truncate">{v.createdBy ?? 'system'}{v.note ? ` · ${v.note}` : ''}</span><span className="text-muted-foreground">{formatDate(v.createdAt)}</span></span>
            {i > 0 && <ConfirmDialog trigger={<Button variant="ghost" size="sm" className="h-7 px-2">Restore</Button>} title={`Restore version ${v.versionNo}?`} description="It becomes the current draft. Nothing is published until you publish." confirmLabel="Restore" onConfirm={() => onRevert(v.id)} />}
            {i === 0 && <span className="text-muted-foreground px-2">latest</span>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
