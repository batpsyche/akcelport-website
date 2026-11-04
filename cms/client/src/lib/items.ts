// Queries and mutations for families, products and downloads (one API shape), with validation errors mapped to field paths.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from './api';
import type { ItemFull, ItemSummary, ItemType } from './types';

export const BASE: Record<ItemType, string> = { family: 'families', product: 'products', download: 'downloads' };
export const LABEL: Record<ItemType, string> = { family: 'family', product: 'product', download: 'download' };

export function useItems(type: ItemType) {
  return useQuery({ queryKey: ['items', type], queryFn: () => api.get<{ items: ItemSummary[] }>(`/api/${BASE[type]}`).then((r) => r.items), staleTime: 15_000 });
}

export function useItem<B = Record<string, unknown>>(type: ItemType, id: number | undefined) {
  return useQuery({ queryKey: ['item', type, id], queryFn: () => api.get<ItemFull<B>>(`/api/${BASE[type]}/${id}`), enabled: id !== undefined });
}

export function errorsFrom(e: unknown): Record<string, string> {
  if (e instanceof ApiError && e.issues.length) return Object.fromEntries(e.issues.map((i) => [i.path, i.message]));
  return {};
}

export function reportError(e: unknown): void {
  if (e instanceof ApiError) {
    const issues = e.issues;
    toast.error(e.message, { description: issues.length ? issues.slice(0, 4).map((i) => `${i.path || 'form'}: ${i.message}`).join('\n') : undefined });
  } else toast.error('Something went wrong');
}

export function useItemMutations<B = Record<string, unknown>>(type: ItemType, id?: number) {
  const qc = useQueryClient();
  const base = `/api/${BASE[type]}`;
  const invalidate = async () => { await Promise.all([qc.invalidateQueries({ queryKey: ['items', type] }), qc.invalidateQueries({ queryKey: ['pending'] }), id !== undefined ? qc.invalidateQueries({ queryKey: ['item', type, id] }) : Promise.resolve(), qc.invalidateQueries({ queryKey: ['dashboard'] })]); };
  const run = <T>(fn: () => Promise<T>, success?: string) => useMutation({ mutationFn: fn, onSuccess: async () => { await invalidate(); if (success) toast.success(success); }, onError: (e) => reportError(e) });
  return {
    save: useMutation({ mutationFn: (input: { body: B; slug?: string; familyId?: number }) => api.put<ItemFull<B>>(`${base}/${id}`, input), onSuccess: async () => { await invalidate(); toast.success('Saved as draft'); } }),
    create: useMutation({ mutationFn: (input: { body: B; slug: string; familyId?: number }) => api.post<ItemFull<B>>(base, input), onSuccess: async () => { await invalidate(); toast.success(`${LABEL[type][0].toUpperCase()}${LABEL[type].slice(1)} created`); } }),
    discard: run(() => api.post<ItemFull<B>>(`${base}/${id}/discard`), 'Draft discarded'),
    setStatus: useMutation({ mutationFn: (status: 'hidden' | 'live') => api.post<ItemFull<B>>(`${base}/${id}/status`, { status }), onSuccess: async (_d, status) => { await invalidate(); toast.success(status === 'live' ? 'Will show on the site at the next publish' : 'Will be hidden at the next publish'); }, onError: (e) => reportError(e) }),
    remove: run(() => api.del<{ hard: boolean }>(`${base}/${id}`)),
    restore: run(() => api.post<ItemFull<B>>(`${base}/${id}/restore`), 'Restored'),
    revert: useMutation({ mutationFn: (versionId: number) => api.post<ItemFull<B>>(`${base}/${id}/revert`, { versionId }), onSuccess: async () => { await invalidate(); toast.success('Version restored as the draft'); }, onError: (e) => reportError(e) }),
    reorder: useMutation({ mutationFn: (input: { ids: number[]; familyId?: number }) => api.post<{ items: ItemSummary[] }>(`${base}/reorder`, input), onSuccess: async () => { await invalidate(); }, onError: (e) => reportError(e) }),
  };
}
