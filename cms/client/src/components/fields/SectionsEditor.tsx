// Show/hide switches (and, on the home page, ordering) for a page's sections. The document stores them as
// "sections": [{ id, enabled }]; the site build renders the visible ones in that order.
import { resolveSections, type SectionState } from '../../../../../src/lib/sections.mjs';
import { sectionLabels, sortableSectionPages, type SectionPage } from '@shared/page-fields';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SortableList } from '@/components/SortableList';

interface Props { page: SectionPage; doc: unknown; set: (path: string, value: unknown) => void }

const setEnabled = (list: SectionState[], id: string, enabled: boolean) => list.map((s) => (s.id === id ? { ...s, enabled } : s));

/** One section's switch, labelled for screen readers; used in the Sections card and on each section's own card. */
export function SectionSwitch({ page, doc, set, id, showLabel = false }: Props & { id: string; showLabel?: boolean }) {
  const list = resolveSections(page, doc);
  const on = list.find((s) => s.id === id)?.enabled ?? true;
  const label = sectionLabels[page][id] ?? id;
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
      <Switch checked={on} onCheckedChange={(v) => set('sections', setEnabled(list, id, v))} aria-label={`Show the section: ${label}`} />
      {showLabel ? (on ? 'Shown' : 'Hidden') : <span className="sr-only">{on ? 'Shown' : 'Hidden'}</span>}
    </label>
  );
}

export function SectionsCard({ page, doc, set }: Props) {
  const list = resolveSections(page, doc);
  const sortable = sortableSectionPages.includes(page);
  const row = (s: SectionState, handle?: React.ReactNode) => (
    <div className="flex items-center gap-3 border rounded-sm px-3 py-2 bg-muted/30">
      {handle}
      <span className={`text-sm flex-1 ${s.enabled ? '' : 'text-muted-foreground line-through'}`}>{sectionLabels[page][s.id] ?? s.id}</span>
      {!s.enabled && <Badge variant="outline">Hidden</Badge>}
      <SectionSwitch page={page} doc={doc} set={set} id={s.id} />
    </div>
  );
  return (
    <Card className="chamfer">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Sections</CardTitle>
        <CardDescription>{sortable ? 'Switch a section off to hide it, drag to change the order.' : 'Switch a section off to hide it.'} Hidden sections keep their text. Changes go live on the next Publish.</CardDescription>
      </CardHeader>
      <CardContent>
        {sortable
          ? <SortableList items={list} getId={(s) => s.id} onReorder={(next) => set('sections', next)} className="grid gap-2" render={(s, r) => row(s, r.handle)} />
          : <div className="grid gap-2">{list.map((s) => <div key={s.id}>{row(s)}</div>)}</div>}
      </CardContent>
    </Card>
  );
}
