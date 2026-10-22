import { html, raw, esc } from '../lib/html.mjs';
import { icon } from './icons.mjs';

export const productUrl = (slug) => `/products/${slug}/`;
export const categoryUrl = (slug) => `/categories/${slug}/`;

export function picture(im, { cls = '', sizes = '', eager = false, alt } = {}) {
  if (!im) return '';
  const dims = im.w && im.h ? ` width="${im.w}" height="${im.h}"` : '';
  return raw(`<img class="${esc(cls)}" src="${esc(im.src)}"${dims} alt="${esc(alt ?? im.alt ?? '')}"${sizes ? ` sizes="${esc(sizes)}"` : ''} ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`);
}

// Smaller rendition of a hero image for cards and thumbnails (falls back to the full image).
export const thumbOf = (im) => (im?.thumb ? { ...im.thumb, alt: im.alt } : im);

// An image that opens the lightbox on click. `full` defaults to the image itself.
export function zoomable(im, { cls = '', full } = {}) {
  const f = full || im;
  return html`<button type="button" class="zoom ${cls}" data-zoom="${f.src}" data-zoom-alt="${f.alt || im.alt || ''}" aria-label="Enlarge image: ${f.alt || im.alt || 'product image'}">${picture(im)}<span class="zoom-tag">${icon('zoom')}</span></button>`;
}

export function bytes(n) {
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export function productCard(p, data, { compact = false } = {}) {
  const cat = data.catBySlug.get(p.family);
  const text = [p.name, p.summary, cat?.name, ...(p.facts || []).map((f) => f.value)].join(' ').toLowerCase();
  return html`<a class="card product-card chamfer" href="${productUrl(p.slug)}" data-family="${p.family}" data-search="${text}">
    <span class="card-media">${picture(thumbOf(p.hero), { sizes: '(min-width: 900px) 25vw, 50vw' })}</span>
    <span class="card-body">
      <span class="eyebrow">${cat?.shortName}${p.source === 'new' ? raw(' <span class="pill pill-new">New datasheet</span>') : ''}</span>
      <span class="card-title">${p.name}</span>
      ${compact ? '' : html`<span class="card-text">${p.summary}</span>`}
      <span class="card-link">View range ${icon('arrow')}</span>
    </span>
  </a>`;
}

export function docCard(d, data, { showProducts = true } = {}) {
  const prods = d.products.map((s) => data.bySlug.get(s)).filter(Boolean);
  const fam = [...new Set(prods.map((p) => p.family))].join(' ');
  return html`<article class="doc-card" data-family="${fam}" data-search="${[d.title, d.description, ...prods.map((p) => p.name)].join(' ').toLowerCase()}">
    <a class="doc-thumb" href="${d.file}" tabindex="-1" aria-hidden="true"><img src="${d.thumb}" alt="" width="210" height="297" loading="lazy" decoding="async"></a>
    <div class="doc-body">
      <span class="eyebrow">PDF, ${d.pages} page${d.pages > 1 ? 's' : ''}, ${bytes(d.sizeBytes)}</span>
      <h3 class="doc-title">${d.title}</h3>
      <p class="doc-text">${d.description}</p>
      ${showProducts && prods.length ? html`<p class="doc-for">For: ${prods.map((p, i) => html`${i ? ', ' : ''}<a href="${productUrl(p.slug)}">${p.name}</a>`)}</p>` : ''}
      <a class="btn btn-ghost btn-sm" href="${d.file}" download>${icon('download')} Download PDF</a>
    </div>
  </article>`;
}

export function specTable(t) {
  const id = t.id ? ` id="table-${esc(t.id)}"` : '';
  return html`<figure class="spec"${raw(id)}>
    ${t.title ? html`<figcaption class="spec-title">${t.title}${t.caption ? html`<span class="spec-cap">${t.caption}</span>` : ''}</figcaption>` : ''}
    <div class="table-wrap" tabindex="0" role="region" aria-label="${t.title || 'Specification table'}">
      <table>
        <thead><tr>${t.columns.map((c) => html`<th scope="col">${c}</th>`)}</tr></thead>
        <tbody>${t.rows.map((r) => html`<tr>${r.map((c, i) => (i === 0 ? html`<th scope="row">${c}</th>` : html`<td>${c}</td>`))}</tr>`)}</tbody>
      </table>
    </div>
    ${t.note ? html`<p class="spec-note">${t.note}</p>` : ''}
  </figure>`;
}

export function breadcrumbs(items) {
  return html`<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) => html`<li>${it.href && i < items.length - 1 ? html`<a href="${it.href}">${it.label}</a>` : html`<span aria-current="page">${it.label}</span>`}</li>`)}</ol></nav>`;
}

export function ctaBand({ title, text, label, href }, extra = '') {
  return html`<section class="cta-band"><div class="container cta-inner">
    <div><h2>${title}</h2><p>${text}</p></div>
    <div class="cta-actions"><a class="btn btn-white" href="${href}">${label} ${icon('arrow')}</a>${extra}</div>
  </div></section>`;
}

export function sectionHead({ kicker, title, lede }, cls = '') {
  return html`<header class="sec-head ${cls}">${kicker ? html`<p class="kicker">${kicker}</p>` : ''}<h2>${title}</h2>${lede ? html`<p class="lede">${lede}</p>` : ''}</header>`;
}
