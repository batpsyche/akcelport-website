// Static site generator: reads content/*.json, renders src/templates, writes dist/.
// Zero dependencies. Usage: node scripts/build.mjs [--check]
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadContent, validate } from '../src/lib/content.mjs';
import { BASE, rebaseHtml, rebaseCss, rebaseUrl } from '../src/lib/base.mjs';
import { layout } from '../src/templates/layout.mjs';
import { homePage } from '../src/templates/home.mjs';
import { productPage, categoryPage, productsPage, downloadsPage, aboutPage, contactPage, sitemapPage, notFoundPage } from '../src/templates/pages.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const checkOnly = process.argv.includes('--check');

const data = loadContent(root);
// Absolute URLs (canonical, OG, JSON-LD, sitemap) are built from siteUrl; SITE_URL overrides the origin for previews.
data.site.siteUrl = (process.env.SITE_URL || data.site.siteUrl).replace(/\/$/, '') + BASE;
const problems = validate(data, root);
if (problems.length) {
  console.error(`Content problems (${problems.length}):\n - ` + problems.join('\n - '));
  process.exit(1);
}
if (checkOnly) { console.log(`Content OK: ${data.products.length} products, ${data.categories.length} families, ${data.downloads.length} downloads.`); process.exit(0); }

// ---- assets
rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'assets'), { recursive: true });
cpSync(join(root, 'public'), dist, { recursive: true });
const cssOrder = ['fonts.css', 'base.css', 'components.css', 'home.css', 'pages.css'];
const css = cssOrder.map((f) => readFileSync(join(root, 'src/styles', f), 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*\n+/g, '\n');
writeFileSync(join(dist, 'assets/site.css'), rebaseCss(css));
for (const f of ['site.js', 'hero.js']) writeFileSync(join(dist, 'assets', f), readFileSync(join(root, 'src/client', f), 'utf8'));
data.buildId = createHash('sha1').update(css).update(readFileSync(join(root, 'src/client/site.js'))).update(readFileSync(join(root, 'src/client/hero.js'))).digest('hex').slice(0, 8);

// ---- pages
const pages = [homePage(data), productsPage(data), downloadsPage(data), aboutPage(data), contactPage(data), sitemapPage(data), notFoundPage(data),
  ...data.categories.map((c) => categoryPage(data, c)), ...data.products.map((p) => productPage(data, p))];
for (const pg of pages) {
  const file = pg.path.endsWith('.html') ? pg.path : join(pg.path, 'index.html');
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  writeFileSync(join(dist, file), rebaseHtml(layout(data, pg)));
}

// ---- machine files
const base = data.site.siteUrl.replace(/\/$/, '');
const urls = pages.filter((p) => p.path !== '/404.html').map((p) => p.path);
writeFileSync(join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: ${BASE || ''}/\nSitemap: ${base}/sitemap.xml\n`);
const reds = [...data.redirects.pages, ...data.redirects.downloads];
writeFileSync(join(dist, '.htaccess'), `# Old akcelport.com URLs -> new locations\n${reds.map((r) => `Redirect 301 ${rebaseUrl(r.from)} ${rebaseUrl(r.to)}`).join('\n')}\nErrorDocument 404 ${rebaseUrl('/404.html')}\n`);
writeFileSync(join(dist, '_redirects'), reds.map((r) => `${rebaseUrl(r.from)}  ${rebaseUrl(r.to)}  301`).join('\n') + '\n');

console.log(`Built ${pages.length} pages (${data.products.length} products, ${data.categories.length} families, ${data.downloads.length} downloads) -> dist/  [build ${data.buildId}]`);
