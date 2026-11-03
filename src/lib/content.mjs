// Loads and validates everything under content/, then resolves {{tokens}}.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

function deepReplace(v, tokens) {
  if (typeof v === 'string') return v.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in tokens ? tokens[k] : m));
  if (Array.isArray(v)) return v.map((x) => deepReplace(x, tokens));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepReplace(x, tokens)]));
  return v;
}

// Options: contentDir (default root/content) lets the CMS build from an exported copy of the content.
export function loadContent(root, { contentDir = join(root, 'content') } = {}) {
  const c = (p) => join(contentDir, p);
  const dir = (p) => readdirSync(c(p)).filter((f) => f.endsWith('.json')).map((f) => readJson(c(join(p, f))));
  const categories = dir('categories').sort((a, b) => a.order - b.order);
  const famOrder = new Map(categories.map((x) => [x.slug, x.order]));
  const products = dir('products').sort((a, b) => (famOrder.get(a.family) - famOrder.get(b.family)) || (a.order - b.order));
  const markets = readJson(c('markets.json'));
  const marketCount = markets.regions.reduce((n, r) => n + r.countries.length, 0);
  const tokens = { markets: String(marketCount), products: String(products.length) };
  const data = {
    site: readJson(c('site.json')), home: readJson(c('home.json')), about: readJson(c('about.json')), contact: readJson(c('contact.json')),
    markets, downloads: readJson(c('downloads.json')).documents, redirects: readJson(c('redirects.json')), countries: readJson(c('countries.json')),
    companyImages: readJson(c('company-images.json')), categories, products,
  };
  const out = deepReplace(data, tokens);
  out.tokens = tokens;
  out.bySlug = new Map(out.products.map((p) => [p.slug, p]));
  out.catBySlug = new Map(out.categories.map((x) => [x.slug, x]));
  out.docById = new Map(out.downloads.map((d) => [d.id, d]));
  return out;
}

// Returns a list of human-readable problems; the build fails if any exist.
// Options: assetDirs (default [root/public]) are the directories a referenced file may live in.
export function validate(data, root, { assetDirs = [join(root, 'public')] } = {}) {
  const problems = [];
  const exists = (p) => assetDirs.some((d) => existsSync(join(d, p)));
  const need = (p, where) => { if (p && !exists(p)) problems.push(`missing file ${p} (${where})`); };
  for (const p of data.products) {
    if (!data.catBySlug.has(p.family)) problems.push(`${p.slug}: unknown family ${p.family}`);
    if (!p.downloads?.length) problems.push(`${p.slug}: no downloads`);
    for (const id of p.downloads || []) if (!data.docById.has(id)) problems.push(`${p.slug}: unknown download ${id}`);
    const walk = (v) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') { if (typeof v.src === 'string') need(v.src, p.slug); Object.values(v).forEach(walk); }
    };
    walk(p);
  }
  for (const d of data.downloads) { need(d.file, d.id); need(d.thumb, d.id); }
  for (const cat of data.categories) for (const s of cat.products) if (!data.bySlug.has(s)) problems.push(`category ${cat.slug}: unknown product ${s}`);
  for (const s of data.home.featured?.slugs || []) if (!data.bySlug.has(s)) problems.push(`home featured: unknown product ${s}`);
  for (const t of data.home.industries?.items || []) for (const s of t.products || []) if (!data.bySlug.has(s)) problems.push(`home industry ${t.id}: unknown product ${s}`);
  if (data.home.downloads?.docId && !data.docById.has(data.home.downloads.docId)) problems.push(`home downloads: unknown download ${data.home.downloads.docId}`);
  for (const r of [...data.redirects.pages, ...data.redirects.downloads]) {
    if (r.to.startsWith('/downloads/')) need(r.to, 'redirect ' + r.from);
    else if (r.to.startsWith('/products/') && !data.bySlug.has(r.to.split('/')[2])) problems.push(`redirect ${r.from} -> ${r.to}`);
  }
  return problems;
}
