import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(email, password); navigate((location.state as { from?: string } | null)?.from ?? '/', { replace: true }); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'Could not sign in'); }
    finally { setBusy(false); }
  };
  return (
    <div className="min-h-screen grid lg:grid-cols-[1fr_1fr]">
      <div className="hidden lg:flex bg-ink text-white flex-col justify-between p-10">
        <div><div className="kicker text-[var(--red-d,#ff5f52)]">Akcelport Industries</div><div className="font-display text-3xl font-bold mt-2">Backoffice</div></div>
        <div className="max-w-md text-[var(--chart-5)] text-sm leading-relaxed">Edit products, families, datasheets and page copy, then publish the website in one click. Changes stay as drafts until you publish.</div>
        <div className="font-mono text-xs text-[var(--chart-4)]">Quality, built in.</div>
      </div>
      <div className="grid place-items-center p-6 bg-background">
        <form onSubmit={submit} className="w-full max-w-sm bg-white chamfer border p-8 grid gap-4">
          <div><div className="kicker">Sign in</div><h1 className="text-2xl mt-1">Akcelport backoffice</h1></div>
          <div className="grid gap-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus /></div>
          <div className="grid gap-1.5"><Label htmlFor="password">Password</Label><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
          <Button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          <p className="text-xs text-muted-foreground">Forgotten your password? Ask an administrator for a reset link.</p>
        </form>
      </div>
    </div>
  );
}
