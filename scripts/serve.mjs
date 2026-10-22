// Dependency-free static server for dist/ (with Range support so large PDFs behave).
// Usage: node scripts/serve.mjs [--watch]   (PORT env var, default 4173)
import { createServer } from 'node:http';
import { createReadStream, statSync, existsSync, watch } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.env.PORT || 4173);
const build = () => spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
if (!existsSync(dist) || process.argv.includes('--watch')) { if (build().status !== 0 && !existsSync(dist)) process.exit(1); }
if (process.argv.includes('--watch')) {
  let t;
  for (const d of ['content', 'src', 'public']) watch(join(root, d), { recursive: true }, () => { clearTimeout(t); t = setTimeout(build, 250); });
  console.log('Watching content/, src/ and public/ for changes.');
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4' };
createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(dist, p));
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end(); }
  try { if (statSync(file).isDirectory()) file = join(file, 'index.html'); } catch { /* fall through to 404 */ }
  if (!existsSync(file)) { res.writeHead(404, { 'content-type': MIME['.html'] }); return createReadStream(join(dist, '404.html')).pipe(res); }
  const size = statSync(file).size, type = MIME[extname(file)] || 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? Number(m[1]) : 0, end = m[2] ? Number(m[2]) : size - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-cache' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`Akcelport site on http://localhost:${port}/`));
