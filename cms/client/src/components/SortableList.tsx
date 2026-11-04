// Drag-and-drop ordering with dnd-kit, plus up/down buttons as a keyboard and touch fallback.
import type { ReactNode } from 'react';
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RowProps { handle: ReactNode; index: number }

export function SortableList<T>({ items, getId, onReorder, render, className, itemClassName, disabled }: {
  items: T[]; getId: (item: T, index: number) => string | number; onReorder: (next: T[]) => void; render: (item: T, row: RowProps) => ReactNode; className?: string; itemClassName?: string; disabled?: boolean;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = items.map((it, i) => String(getId(it, i)));
  const move = (from: number, to: number) => { if (to < 0 || to >= items.length) return; onReorder(arrayMove(items, from, to)); };
  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    move(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item, i) => (
            <Row key={ids[i]} id={ids[i]} className={itemClassName} disabled={disabled} onUp={() => move(i, i - 1)} onDown={() => move(i, i + 1)} first={i === 0} last={i === items.length - 1}>
              {(handle) => render(item, { handle, index: i })}
            </Row>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function Row({ id, children, className, disabled, onUp, onDown, first, last }: { id: string; children: (handle: ReactNode) => ReactNode; className?: string; disabled?: boolean; onUp: () => void; onDown: () => void; first: boolean; last: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const handle = (
    <span className="flex items-center gap-0.5 text-muted-foreground shrink-0">
      <button type="button" aria-label="Drag to reorder" className={cn('cursor-grab p-1 rounded hover:bg-muted', disabled && 'opacity-30 cursor-default')} {...attributes} {...listeners}><GripVertical className="size-4" /></button>
      <span className="flex flex-col">
        <button type="button" aria-label="Move up" disabled={disabled || first} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" onClick={onUp}><ChevronUp className="size-3" /></button>
        <button type="button" aria-label="Move down" disabled={disabled || last} className="p-0.5 rounded hover:bg-muted disabled:opacity-30" onClick={onDown}><ChevronDown className="size-3" /></button>
      </span>
    </span>
  );
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(className, isDragging && 'opacity-70 relative z-10')}>
      {children(handle)}
    </div>
  );
}
