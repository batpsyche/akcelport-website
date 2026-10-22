// Base-path support: SITE_BASE (default "/") is the folder the site is served from, e.g. "/akcelport-website/".
// Generated pages are authored with root-absolute URLs; these helpers prefix them at build time.
const raw = process.env.SITE_BASE ?? '/';
export const BASE = raw.replace(/^\/+|\/+$/g, '') ? '/' + raw.replace(/^\/+|\/+$/g, '') : '';

const prefix = (u) => (BASE && /^\/(?!\/)/.test(u) ? BASE + u : u);
export const rebaseUrl = prefix;

// Root-absolute values of URL-carrying attributes (and data-zoom, used by the lightbox) and CSS url(...).
export const rebaseHtml = (s) => !BASE ? s : s
  .replace(/(\s(?:href|src|action|poster|data-zoom)=")(\/(?!\/)[^"]*)"/g, (_, a, u) => `${a}${BASE}${u}"`)
  .replace(/url\((['"]?)\/(?!\/)/g, (_, q) => `url(${q}${BASE}/`);
export const rebaseCss = (s) => !BASE ? s : s.replace(/url\((['"]?)\/(?!\/)/g, (_, q) => `url(${q}${BASE}/`);
