import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { api } from '@/lib/api';
import type { AuditEntry } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export function ActivityPage() {
  const [q, setQ] = useState('');
  const query = useInfiniteQuery({
    queryKey: ['audit', q],
    queryFn: ({ pageParam }) => api.get<{ entries: AuditEntry[]; nextBefore: number | null }>(`/api/audit?limit=50${pageParam ? `&before=${pageParam}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
    initialPageParam: 0 as number,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const entries = query.data?.pages.flatMap((p) => p.entries) ?? [];
  return (
    <div>
      <PageHeader kicker="Audit log" title="Activity" description="Who changed what, and when. Field-level changes are recorded for every save." />
      <div className="relative mb-4 max-w-sm"><Search className="size-4 absolute left-2 top-2.5 text-muted-foreground" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by item, user or action" className="pl-8" /></div>
      <div className="bg-white border rounded-sm">
        <Table>
          <TableHeader><TableRow><TableHead className="w-40">When</TableHead><TableHead>Who</TableHead><TableHead>Action</TableHead><TableHead>Item</TableHead><TableHead>Changes</TableHead></TableRow></TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground">{formatDate(e.createdAt)}</TableCell>
                <TableCell className="text-xs">{e.userEmail ?? 'system'}</TableCell>
                <TableCell className="font-mono text-xs">{e.action}</TableCell>
                <TableCell className="text-sm">{e.label ?? e.entityId ?? ''}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-md">
                  {e.changes && Object.keys(e.changes).length > 0 ? <details><summary className="cursor-pointer">{Object.keys(e.changes).slice(0, 6).join(', ')}{Object.keys(e.changes).length > 6 ? '…' : ''}</summary><pre className="whitespace-pre-wrap font-mono mt-1 max-h-48 overflow-auto">{JSON.stringify(e.changes, null, 1)}</pre></details> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!entries.length && !query.isLoading && <p className="p-3 text-sm text-muted-foreground">No activity recorded.</p>}
      </div>
      {query.hasNextPage && <div className="mt-3"><Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>Load more</Button></div>}
    </div>
  );
}
