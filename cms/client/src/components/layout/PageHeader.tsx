import type { ReactNode } from 'react';

export function PageHeader({ kicker, title, description, actions }: { kicker?: string; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-4 mb-6">
      <div className="min-w-0">
        {kicker && <div className="kicker mb-1">{kicker}</div>}
        <h1 className="text-2xl md:text-3xl">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 max-w-3xl text-sm">{description}</p>}
      </div>
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
