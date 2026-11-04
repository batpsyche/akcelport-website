import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export type Errors = Record<string, string>;
export const errorAt = (errors: Errors | undefined, path: string) => errors?.[path];

export function FieldWrap({ label, help, error, children, className, htmlFor, inline }: { label?: ReactNode; help?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string; inline?: boolean }) {
  return (
    <div className={cn('grid gap-1.5', inline && 'grid-cols-[auto_1fr] items-center gap-3', className)}>
      {label && <Label htmlFor={htmlFor} className={cn('text-xs font-medium text-muted-foreground', error && 'text-destructive')}>{label}</Label>}
      {children}
      {help && !error && <p className="text-xs text-muted-foreground">{help}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
