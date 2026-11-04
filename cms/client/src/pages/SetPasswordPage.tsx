import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Me } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { setMe } = useAuth();
  const info = useQuery({ queryKey: ['token-info', token], queryFn: () => api.get<{ email: string; purpose: string }>(`/api/auth/token-info?token=${encodeURIComponent(token)}`), enabled: !!token, retry: false });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('The two passwords differ'); return; }
    setBusy(true); setError(null);
    try { const me = await api.post<Me>('/api/auth/set-password', { token, password }); setMe(me); navigate('/', { replace: true }); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not set the password'); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white chamfer border p-8 grid gap-4">
        <div><div className="kicker">{info.data?.purpose === 'reset' ? 'Password reset' : 'Welcome'}</div><h1 className="text-2xl mt-1">Choose a password</h1></div>
        {info.isError && <p className="text-sm text-destructive">This link is invalid or has expired. Ask an administrator for a new one.</p>}
        {info.data && <p className="text-sm text-muted-foreground">For <span className="font-medium text-foreground">{info.data.email}</span>. Use at least 10 characters.</p>}
        <div className="grid gap-1.5"><Label htmlFor="pw">New password</Label><Input id="pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={10} disabled={!info.data} /></div>
        <div className="grid gap-1.5"><Label htmlFor="pw2">Repeat password</Label><Input id="pw2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={!info.data} /></div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" disabled={busy || !info.data}>{busy ? 'Saving…' : 'Set password and sign in'}</Button>
      </form>
    </div>
  );
}
