import { NavLink, Outlet, Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Package, Layers, FileDown, FileText, Settings, ArrowRightLeft, Images, Users, Rocket, History, LogOut, UserCircle, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import type { Pending } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/families', label: 'Families', icon: Layers },
  { to: '/downloads', label: 'Downloads', icon: FileDown },
  { to: '/pages', label: 'Pages', icon: FileText },
  { to: '/media', label: 'Media', icon: Images },
  { to: '/redirects', label: 'Redirects', icon: ArrowRightLeft, admin: true },
  { to: '/settings', label: 'Site settings', icon: Settings, admin: true },
  { to: '/users', label: 'Users', icon: Users, admin: true },
  { to: '/publish', label: 'Publish', icon: Rocket },
  { to: '/activity', label: 'Activity', icon: History },
];

export function usePending() {
  return useQuery({ queryKey: ['pending'], queryFn: () => api.get<Pending>('/api/pending'), staleTime: 15_000 });
}

export function Shell() {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const pending = usePending();
  const pendingCount = (pending.data?.items.length ?? 0) + (pending.data?.pages.length ?? 0);
  const isAdmin = me?.user.role === 'admin';
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground flex flex-col md:min-h-screen">
        <div className="px-5 pt-5 pb-4 border-b border-sidebar-border">
          <div className="kicker text-[var(--chart-5)]">Backoffice</div>
          <div className="font-display text-xl font-bold tracking-tight text-white mt-1">Akcelport<span className="text-primary">.</span></div>
        </div>
        <nav className="flex-1 py-3">
          {nav.filter((n) => !n.admin || isAdmin).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn('relative flex items-center gap-3 px-5 py-2.5 text-sm text-[var(--chart-5)] hover:text-white hover:bg-sidebar-accent transition-colors', isActive && 'text-white bg-sidebar-accent before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-primary')}>
              <n.icon className="size-4 shrink-0" />
              <span>{n.label}</span>
              {n.to === '/publish' && pendingCount > 0 && <Badge className="ml-auto bg-primary text-white rounded-sm px-1.5">{pendingCount}</Badge>}
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-sidebar-border text-xs text-[var(--chart-4)] font-mono">v0.1 · {me?.user.role}</div>
      </aside>
      <div className="flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-border h-14 flex items-center gap-3 px-4 md:px-6">
          <div className="text-sm text-muted-foreground hidden sm:block">
            {pendingCount > 0 ? <Link to="/publish" className="hover:underline"><span className="font-medium text-foreground">{pendingCount}</span> unpublished change{pendingCount === 1 ? '' : 's'}</Link> : 'Everything is published'}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {me?.canPublish && <Button size="sm" onClick={() => navigate('/publish')}><Rocket className="size-4" /> Publish</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2"><UserCircle className="size-4" /><span className="max-w-[160px] truncate">{me?.user.name || me?.user.email}</span><ChevronDown className="size-3 opacity-60" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal"><div className="text-sm font-medium truncate">{me?.user.email}</div><div className="text-xs text-muted-foreground capitalize">{me?.user.role}</div></DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/account')}><UserCircle className="size-4" /> Account and password</DropdownMenuItem>
                <DropdownMenuItem onClick={() => logout().then(() => navigate('/login'))}><LogOut className="size-4" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 max-w-[1400px] w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
