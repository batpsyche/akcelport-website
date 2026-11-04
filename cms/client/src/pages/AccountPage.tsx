import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/items';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AccountPage() {
  const { me, refresh } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { toast.error('The two new passwords differ'); return; }
    setBusy(true);
    try { await api.post('/api/auth/change-password', { currentPassword: current, newPassword: next }); toast.success('Password changed'); setCurrent(''); setNext(''); setConfirm(''); await refresh(); }
    catch (err) { reportError(err); }
    finally { setBusy(false); }
  };
  return (
    <div>
      <PageHeader kicker="Account" title={me?.user.name || me?.user.email} description={`Signed in as ${me?.user.email} (${me?.user.role}).`} />
      {me?.user.mustChangePassword && <div className="mb-4 border border-primary/40 bg-primary/5 p-3 text-sm rounded-sm">You signed in with a temporary password. Please choose your own password now.</div>}
      <Card className="chamfer max-w-md">
        <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-3">
            <div className="grid gap-1.5"><Label htmlFor="cur">Current password</Label><Input id="cur" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
            <div className="grid gap-1.5"><Label htmlFor="new">New password</Label><Input id="new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={10} /></div>
            <div className="grid gap-1.5"><Label htmlFor="new2">Repeat new password</Label><Input id="new2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></div>
            <div><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</Button></div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
