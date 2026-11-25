// Serves a site published to Supabase Storage by the CMS (see cms/server/src/storage.ts for the bucket layout).
// Zero dependencies, plain Node (req, res): the public site's Vercel function and the CMS /preview/ route both use it.
// Small files are streamed through; files above the function response limit are redirected to their public Storage URL.
const PROXY_MAX = 4 * 1024 * 1024;

/**
 * @param {{ url: string, bucket: string, manifest: 'current' | 'preview', base?: string, cacheMs?: number, cacheControl?: (type: string) => string }} opts
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createSiteHandler(opts) {
  const base = (opts.base || '/').replace(/\/?$/, '/');
  const cacheMs = opts.cacheMs ?? 5000;
  const publicUrl = (key) => `${opts.url.replace(/\/$/, '')}/storage/v1/object/public/${opts.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const cacheControl = opts.cacheControl || ((type) => (type.startsWith('text/html') ? 'public, max-age=0, must-revalidate' : 'public, max-age=300'));

  let pointer = { at: 0, value: null };
  const manifests = new Map(); // release id -> { files, redirects }

  // Pointers change on every publish: a unique query string skips the Storage CDN cache.
  const fetchJson = async (key) => {
    const r = await fetch(`${publicUrl(key)}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) { await r.body?.cancel(); return null; }
    return r.json();
  };

  async function loadRelease() {
    if (Date.now() - pointer.at < cacheMs) return pointer.value;
    let manifest = null;
    if (opts.manifest === 'preview') manifest = await fetchJson('preview.json');
    else {
      const state = await fetchJson('state.json');
      if (state?.current) manifest = manifests.get(state.current) || (await fetchJson(`releases/${state.current}.json`));
    }
    let release = null;
    if (manifest) {
      release = manifests.get(manifest.id);
      if (!release) {
        const redirects = new Map();
        const r = manifest.files['/_redirects'];
        if (r) for (const line of (await (await fetch(publicUrl(r.key))).text()).split('\n')) { const [from, to] = line.trim().split(/\s+/); if (from && to) redirects.set(from, to); }
        release = { ...manifest, redirects };
        manifests.set(manifest.id, release);
      }
    }
    pointer = { at: Date.now(), value: release };
    return release;
  }

  async function send(req, res, entry, status = 200) {
    if (entry.size > PROXY_MAX) { res.writeHead(302, { location: publicUrl(entry.key), 'cache-control': 'public, max-age=300' }); return void res.end(); }
    const upstream = await fetch(publicUrl(entry.key));
    if (!upstream.ok) { await upstream.body?.cancel(); res.writeHead(502, { 'content-type': 'text/plain' }); return void res.end('Storage error'); }
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(status, { 'content-type': entry.type, 'content-length': body.length, 'cache-control': cacheControl(entry.type) });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  return async function handle(req, res) {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { allow: 'GET, HEAD' }); return void res.end(); }
      const release = await loadRelease();
      if (!release) { res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); return void res.end('Nothing has been published yet.'); }
      let path;
      try { path = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { path = '/'; }
      const rel = path.startsWith(base) ? '/' + path.slice(base.length) : path === base.slice(0, -1) ? '/' : null;
      if (rel !== null && !rel.split('/').some((s) => s.startsWith('.'))) {
        const file = release.files[rel.endsWith('/') ? `${rel}index.html` : rel];
        if (file) return await send(req, res, file);
        if (!rel.endsWith('/') && release.files[`${rel}/index.html`]) { res.writeHead(301, { location: `${base}${rel.slice(1)}/` }); return void res.end(); }
      }
      const to = release.redirects.get(path);
      if (to) { res.writeHead(301, { location: to }); return void res.end(); }
      const notFound = release.files['/404.html'];
      if (notFound) return await send(req, res, notFound, 404);
      res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Server error');
    }
  };
}
