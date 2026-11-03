import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, MoreHorizontal, Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/items';
import type { UserRow } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

function LinkBox({ path, label }: { path: string; label: string }) {
  const url = `${window.location.origin}${path}`;
  return (
    <div className="grid gap-1 text-sm border bg-muted/40 p-3 rounded-sm">
      <div className="font-medium">{label}</div>
      <div className="flex gap-2"><Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.target.select()} /><Button variant="outline" size="icon" aria-label="Copy" onClick={() => { void navigator.clipboard?.writeText(url); toast.success('Link copied'); }}><Copy className="size-4" /></Button></div>
      <p className="text-xs text-muted-foreground">Valid for 48 hours and for one use. The CMS does not send email: hand this link over yourself.</p>
    </div>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const users = useQuery({ queryKey: ['users'], queryFn: () => api.get<{ users: UserRow[] }>('/api/users').then((r) => r.users) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['users'] });
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', role: 'editor' as 'admin' | 'editor', password: '' });
  const [setupPath, setSetupPath] = useState<string | null>(null);
  const [edit, setEdit] = useState<UserRow | null>(null);
  const [reset, setReset] = useState<{ user: UserRow; password: string; resultPath?: string | null; done?: boolean } | null>(null);

  const create = useMutation({ mutationFn: () => api.post<{ user: UserRow; setupPath: string | null }>('/api/users', { ...form, password: form.password || undefined }), onSuccess: async (r) => { await refresh(); setSetupPath(r.setupPath); toast.success(`${r.user.email} added`); if (!r.setupPath) setCreateOpen(false); }, onError: reportError });
  const update = useMutation({ mutationFn: (input: { id: number; name?: string; role?: 'admin' | 'editor'; is_active?: boolean }) => api.patch(`/api/users/${input.id}`, input), onSuccess: async () => { await refresh(); setEdit(null); toast.success('User updated'); }, onError: reportError });
  const doReset = useMutation({ mutationFn: (input: { id: number; password?: string }) => api.post<{ resetPath: string | null }>(`/api/users/${input.id}/reset-password`, { password: input.password || undefined }), onSuccess: (r) => { setReset((s) => (s ? { ...s, resultPath: r.resetPath, done: true } : s)); toast.success('Password reset; the user has been signed out everywhere'); }, onError: reportError });

  return (
    <div>
      <PageHeader kicker="Administration" title="Users" description="Administrators manage users, site settings, redirects and rollbacks. Editors manage content and can publish unless you switch that off in Site settings." actions={<Button onClick={() => { setForm({ email: '', name: '', role: 'editor', password: '' }); setSetupPath(null); setCreateOpen(true); }}><Plus className="size-4" /> Add user</Button>} />
      <div className="bg-white border rounded-sm">
        <Table>
          <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead>Last sign-in</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
          <TableBody>
            {(users.data ?? []).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.email}{u.id === me?.user.id && <span className="text-xs text-muted-foreground"> (you)</span>}</TableCell>
                <TableCell>{u.name}</TableCell>
                <TableCell><Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge></TableCell>
                <TableCell>{u.is_active ? (u.must_change_password ? <Badge variant="outline">Must set password</Badge> : <span className="text-sm">Active</span>) : <Badge variant="destructive">Deactivated</Badge>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatDate(u.last_login_at) || 'never'}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEdit(u)}>Edit name and role</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setReset({ user: u, password: '' })}>Reset password</DropdownMenuItem>
                      {u.id !== me?.user.id && <DropdownMenuItem onClick={() => update.mutate({ id: u.id, is_active: !u.is_active })}>{u.is_active ? 'Deactivate' : 'Reactivate'}</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a user</DialogTitle><DialogDescription>Leave the password empty to get a one-time setup link to hand over; or set a temporary password they must change at first sign-in.</DialogDescription></DialogHeader>
          {setupPath ? <LinkBox path={setupPath} label={`Setup link for ${form.email}`} /> : (
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid gap-1.5"><Label>Role</Label><Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as 'admin' | 'editor' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="editor">Editor</SelectItem><SelectItem value="admin">Administrator</SelectItem></SelectContent></Select></div>
              <div className="grid gap-1.5"><Label>Temporary password (optional)</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave empty for a setup link" /></div>
            </div>
          )}
          <DialogFooter>{setupPath ? <Button onClick={() => setCreateOpen(false)}>Done</Button> : <><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button onClick={() => create.mutate()} disabled={create.isPending || !form.email}>Add user</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit {edit?.email}</DialogTitle></DialogHeader>
          {edit && <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>Name</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label>Role</Label><Select value={edit.role} onValueChange={(v) => setEdit({ ...edit, role: v as 'admin' | 'editor' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="editor">Editor</SelectItem><SelectItem value="admin">Administrator</SelectItem></SelectContent></Select></div>
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => edit && update.mutate({ id: edit.id, name: edit.name, role: edit.role })} disabled={update.isPending}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reset} onOpenChange={(o) => !o && setReset(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reset password for {reset?.user.email}</DialogTitle><DialogDescription>Either generate a one-time link, or set a temporary password they must change at first sign-in. Their current sessions are ended.</DialogDescription></DialogHeader>
          {reset?.done ? (reset.resultPath ? <LinkBox path={reset.resultPath} label="Password reset link" /> : <p className="text-sm">Temporary password set. Share it with the user; they will be asked to choose a new one.</p>) : (
            reset && <div className="grid gap-1.5"><Label>Temporary password (optional)</Label><Input value={reset.password} onChange={(e) => setReset({ ...reset, password: e.target.value })} placeholder="Leave empty for a reset link" /></div>
          )}
          <DialogFooter>{reset?.done ? <Button onClick={() => setReset(null)}>Done</Button> : <><Button variant="outline" onClick={() => setReset(null)}>Cancel</Button><Button onClick={() => reset && doReset.mutate({ id: reset.user.id, password: reset.password })} disabled={doReset.isPending}>Reset</Button></>}</DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
