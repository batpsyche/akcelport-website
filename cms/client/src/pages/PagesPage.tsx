import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { pageFieldSpecs } from '@shared/page-fields';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge } from '@/components/ui/badge';

export function PagesPage() {
  const pages = useQuery({ queryKey: ['pages'], queryFn: () => api.get<{ pages: Array<{ key: string; hasDraft: boolean; updatedAt: string }> }>('/api/pages').then((r) => r.pages) });
  const keys = ['home', 'about', 'contact', 'markets', 'countries', 'company-images'];
  const titles: Record<string, string> = { ...Object.fromEntries(Object.entries(pageFieldSpecs).map(([k, v]) => [k, v.title])), 'company-images': 'Company images' };
  const descriptions: Record<string, string> = { ...Object.fromEntries(Object.entries(pageFieldSpecs).map(([k, v]) => [k, v.description])), 'company-images': 'Extra product imagery from the brochure, keyed by name.' };
  return (
    <div>
      <PageHeader kicker="Site text" title="Pages" description="Copy for the home, about and contact pages, the export markets and the country list. Company identity and contact details are in Site settings." />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {keys.map((k) => {
          const p = pages.data?.find((x) => x.key === k);
          return (
            <Link key={k} to={`/pages/${k}`} className="bg-white chamfer border p-4 hover:border-primary transition-colors grid gap-2">
              <div className="flex items-center gap-2"><FileText className="size-4 text-primary" /><span className="font-medium">{titles[k]}</span>{p?.hasDraft && <Badge className="bg-primary text-white ml-auto">Draft</Badge>}</div>
              <p className="text-xs text-muted-foreground">{descriptions[k]}</p>
              <p className="text-xs text-muted-foreground">Last change {formatDate(p?.updatedAt)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
