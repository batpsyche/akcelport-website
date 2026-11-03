import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { reportError } from '@/lib/items';
import { PageEditor } from './PageEditPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get<{ editorsCanPublish: boolean }>('/api/settings') });
  const update = useMutation({ mutationFn: (editorsCanPublish: boolean) => api.put('/api/settings', { editorsCanPublish }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['settings'] }); await qc.invalidateQueries({ queryKey: ['me'] }); toast.success('Setting saved'); }, onError: reportError });
  return (
    <PageEditor pageKey="site" kicker="Administration" backTo="/" backLabel="Dashboard" extraSidebar={
      <Card className="chamfer">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Publishing rights</CardTitle></CardHeader>
        <CardContent className="text-sm grid gap-2">
          <label className="flex items-center gap-2"><Switch checked={settings.data?.editorsCanPublish ?? true} onCheckedChange={(v) => update.mutate(v)} disabled={settings.isLoading} /> Editors can publish</label>
          <p className="text-xs text-muted-foreground">Applies immediately. Administrators can always publish and roll back.</p>
        </CardContent>
      </Card>
    } />
  );
}
