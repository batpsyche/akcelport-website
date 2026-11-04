import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useLocation } from 'react-router';
import { api, setCsrfToken, ApiError } from './api';
import type { Me } from './types';

interface AuthContextValue { me: Me | null; loading: boolean; login: (email: string, password: string) => Promise<Me>; logout: () => Promise<void>; refresh: () => Promise<void>; setMe: (me: Me) => void }
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try { const me = await api.get<Me>('/api/auth/me'); setCsrfToken(me.csrfToken); return me; }
      catch (e) { if (e instanceof ApiError && e.status === 401) { setCsrfToken(null); return null; } throw e; }
    },
    staleTime: 60_000, retry: false,
  });
  useEffect(() => {
    const h = () => { setCsrfToken(null); qc.setQueryData(['me'], null); };
    window.addEventListener('cms:unauthenticated', h);
    return () => window.removeEventListener('cms:unauthenticated', h);
  }, [qc]);
  const value: AuthContextValue = {
    me: query.data ?? null,
    loading: query.isLoading,
    login: async (email, password) => { const me = await api.post<Me>('/api/auth/login', { email, password }); setCsrfToken(me.csrfToken); qc.setQueryData(['me'], me); qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }); return me; },
    logout: async () => { try { await api.post('/api/auth/logout'); } finally { setCsrfToken(null); qc.setQueryData(['me'], null); qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' }); } },
    refresh: async () => { await query.refetch(); },
    setMe: (me) => { setCsrfToken(me.csrfToken); qc.setQueryData(['me'], me); },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="p-10 text-muted-foreground">Loading…</div>;
  if (!me) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (admin && me.user.role !== 'admin') return <Navigate to="/" replace />;
  if (me.user.mustChangePassword && location.pathname !== '/account') return <Navigate to="/account" replace />;
  return <>{children}</>;
}
