import { html, raw, esc } from '../lib/html.mjs';
import { icon } from './icons.mjs';
import { productUrl, categoryUrl } from './components.mjs';

function header(data, path) {
  const { site, categories, bySlug } = data;
  const cur = (href) => (href === '/' ? path === '/' : path.startsWith(href) || (href === '/products/' && path.startsWith('/categories/'))) ? ' aria-current="page"' : '';
  const mega = categories.map((c) => html`<div class="mega-col">
      <a class="mega-head" href="${categoryUrl(c.slug)}">${icon(c.icon)}<span>${c.name}</span></a>
      <ul>${c.products.map((s) => html`<li><a href="${productUrl(s)}">${bySlug.get(s).name}</a></li>`)}</ul>
    </div>`);
  return html`<a class="skip" href="#main">Skip to content</a>
  <div class="utility"><div class="container utility-in">
    <span class="utility-cert">${icon('check')} ISO 9001 &amp; ISO 45001 certified</span>
    <span class="utility-links"><a href="tel:${site.contact.phoneHref}">${icon('phone')}${site.contact.phone}</a><a href="mailto:${site.contact.email}">${icon('mail')}${site.contact.email}</a></span>
  </div></div>
  <header class="site-header" data-header>
    <div class="container hdr">
      <a class="brand" href="/" aria-label="${site.name}, home"><img src="${site.logo.src}" width="${site.logo.w}" height="${site.logo.h}" alt="${site.logo.alt}"></a>
      <nav class="primary" aria-label="Primary">
        <ul>
          ${site.nav.map((n) => (n.mega
    ? html`<li class="has-mega"><a href="${n.href}"${raw(cur(n.href))} data-mega-toggle aria-expanded="false" aria-controls="mega">${n.label}${icon('chevronDown', 'caret')}</a></li>`
    : html`<li><a href="${n.href}"${raw(cur(n.href))}>${n.label}</a></li>`))}
        </ul>
      </nav>
      <div class="hdr-actions">
        <a class="icon-btn" href="/products/?focus=search" aria-label="Search products">${icon('search')}</a>
        <a class="btn btn-red btn-sm hdr-cta" href="${site.cta.href}">${site.cta.label}</a>
        <button class="icon-btn burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer" data-drawer-toggle>${icon('menu')}</button>
      </div>
    </div>
    <div class="mega" id="mega" hidden data-mega><div class="container mega-in">
      <div class="mega-grid">${mega}</div>
      <aside class="mega-side"><p class="kicker">Datasheets</p><p>Every range has a PDF datasheet you can download.</p><a class="btn btn-ghost btn-sm" href="/downloads/">All downloads ${icon('arrow')}</a><a class="mega-all" href="/products/">View all ${data.products.length} ranges ${icon('arrow')}</a></aside>
    </div></div>
  </header>
  <div class="drawer" id="drawer" hidden data-drawer>
    <div class="drawer-in">
      <ul class="drawer-list">
        <li><details><summary>Products ${icon('chevronDown', 'caret')}</summary>
          <ul>${categories.map((c) => html`<li><a href="${categoryUrl(c.slug)}">${c.name}</a></li>`)}<li><a href="/products/">All products</a></li></ul>
        </details></li>
        ${site.nav.filter((n) => !n.mega).map((n) => html`<li><a href="${n.href}">${n.label}</a></li>`)}
      </ul>
      <a class="btn btn-red" href="${site.cta.href}">${site.cta.label}</a>
      <p class="drawer-contact"><a href="tel:${site.contact.phoneHref}">${site.contact.phone}</a><br><a href="mailto:${site.contact.email}">${site.contact.email}</a></p>
    </div>
  </div>`;
}

function footer(data) {
  const { site, categories } = data;
  return html`<footer class="site-footer">
    <div class="container foot-grid">
      <div class="foot-brand">
        <a class="foot-logo" href="/" aria-label="${site.name}, home"><img src="${site.logo.src}" width="${site.logo.w}" height="${site.logo.h}" alt="${site.logo.alt}" loading="lazy"></a>
        <p>${site.description.split('. ')[0]}.</p>
        <p class="marks">${site.qualityMarks.map((m) => html`<span class="mark">${m}</span>`)}</p>
      </div>
      <nav aria-label="Product families"><h2 class="foot-h">Products</h2><ul>${categories.map((c) => html`<li><a href="${categoryUrl(c.slug)}">${c.name}</a></li>`)}</ul></nav>
      <nav aria-label="Company"><h2 class="foot-h">Company</h2><ul><li><a href="/about/">About us</a></li><li><a href="/downloads/">Downloads</a></li><li><a href="/contact/">Contact</a></li><li><a href="/sitemap/">Site map</a></li></ul></nav>
      <div><h2 class="foot-h">Head office</h2>
        <address>${site.contact.address.map((l, i) => html`${i ? raw('<br>') : ''}${l}`)}</address>
        <p><a href="tel:${site.contact.phoneHref}">${site.contact.phone}</a><br><a href="mailto:${site.contact.email}">${site.contact.email}</a></p>
      </div>
    </div>
    <div class="container foot-base"><p>&copy; ${new Date().getFullYear()} ${site.name}. All rights reserved.</p><p>Design preview. Product data is transcribed from company datasheets; check the PDF before ordering.</p></div>
  </footer>`;
}

export function layout(data, page) {
  const { site } = data;
  const title = page.title ? (page.titleRaw ? page.title : `${page.title} | ${site.name}`) : `${site.name} | ${site.tagline}`;
  const desc = page.description || site.description;
  const canon = site.siteUrl.replace(/\/$/, '') + page.path;
  const og = page.ogImage ? site.siteUrl.replace(/\/$/, '') + page.ogImage : '';
  return '<!doctype html>\n' + html`<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="#0c0e11">
<link rel="canonical" href="${canon}">
<link rel="icon" href="/favicon.png" type="image/png">
<meta property="og:type" content="website"><meta property="og:site_name" content="${site.name}"><meta property="og:title" content="${title}"><meta property="og:description" content="${desc}"><meta property="og:url" content="${canon}">
${og ? html`<meta property="og:image" content="${og}">` : ''}
<link rel="preload" href="/fonts/archivo-100-900.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/site.css?v=${data.buildId}">
${page.head || ''}
${page.jsonLd ? raw(`<script type="application/ld+json">${JSON.stringify(page.jsonLd).replace(/</g, '\\u003c')}</script>`) : ''}
</head>
<body class="${page.bodyClass || ''}">
${header(data, page.path)}
<main id="main" tabindex="-1">${page.body}</main>
${footer(data)}
<script src="/assets/site.js?v=${data.buildId}" defer></script>
${(page.scripts || []).map((s) => raw(`<script src="${esc(s)}?v=${data.buildId}" defer></script>`))}
</body>
</html>
`.s;
}
