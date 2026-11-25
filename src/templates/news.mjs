import { html, raw } from '../lib/html.mjs';
import { renderRichText } from '../lib/richtext.mjs';
import { icon } from './icons.mjs';
import { picture, thumbOf, breadcrumbs, ctaBand, sectionHead, bytes } from './components.mjs';

export const newsUrl = (slug) => `/news/${slug}/`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "2026-11-25" -> "25 November 2026" (no locale or time zone involved). */
export const newsDate = (d) => { const [y, m, day] = String(d).split('-').map(Number); return `${day} ${MONTHS[m - 1]} ${y}`; };
const catKey = (c) => String(c).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function meta(n) {
  return html`<span class="news-meta"><time datetime="${n.date}">${newsDate(n.date)}</time><span class="news-cat">${n.category}</span></span>`;
}

export function newsCard(n) {
  return html`<a class="card news-card chamfer" href="${newsUrl(n.slug)}" data-family="${catKey(n.category)}" data-search="">
    <span class="card-media news-media">${n.cover ? picture(thumbOf(n.cover), { sizes: '(min-width: 900px) 33vw, 90vw' }) : html`<span class="news-ph" aria-hidden="true">${icon('file')}</span>`}</span>
    <span class="card-body">
      ${meta(n)}
      <span class="card-title">${n.title}</span>
      <span class="card-text">${n.summary}</span>
      <span class="card-link">Read more ${icon('arrow')}</span>
    </span>
  </a>`;
}

const emptyNews = html`<p class="empty news-empty">No news yet. Check back soon, or <a href="/contact/">contact us</a> for the latest from Akcelport.</p>`;

export function newsPage(data) {
  const posts = data.news;
  const cats = [...new Map(posts.map((n) => [catKey(n.category), n.category])).entries()];
  const body = html`
  <section class="page-hero dark"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'News' }])}
    <div class="ph-grid"><div><h1>News</h1><p class="lede">Company news, product updates and events from Akcelport Industries.</p></div></div>
  </div></section>
  <section class="sec sec-paper"><div class="container">
    ${posts.length ? html`
    ${cats.length > 1 ? html`<div class="filter-bar news-filter" data-filter>
      <div class="chips-filter" role="group" aria-label="Filter by category"><button type="button" class="chip is-on" data-family="all" aria-pressed="true">All</button>${cats.map(([k, label]) => html`<button type="button" class="chip" data-family="${k}" aria-pressed="false">${label}</button>`)}</div>
      <p class="filter-count" aria-live="polite" data-filter-count></p>
    </div>` : ''}
    <div class="card-grid news-grid" data-filter-grid>${posts.map((n) => newsCard(n))}</div>
    <p class="empty" data-filter-empty hidden>No news in this category yet.</p>` : emptyNews}
  </div></section>
  ${ctaBand(data.home.cta)}`;
  return { path: '/news/', title: 'News', description: 'News from Akcelport Industries: company updates, new product ranges and events.', body };
}

export function newsPostPage(data, n) {
  const more = data.news.filter((x) => x !== n).slice(0, 3);
  const body = html`
  <section class="page-hero dark news-hero"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'News', href: '/news/' }, { label: n.title }])}
    <div class="news-head">${meta(n)}<h1>${n.title}</h1><p class="lede">${n.summary}</p></div>
  </div></section>
  <section class="sec sec-white"><div class="container"><div class="news-article">
    ${n.cover ? html`<figure class="news-cover chamfer">${picture(n.cover, { eager: true, sizes: '(min-width: 900px) 820px, 100vw' })}${n.cover.caption ? html`<figcaption>${n.cover.caption}</figcaption>` : ''}</figure>` : ''}
    <div class="prose news-body">${raw(renderRichText(n.body))}</div>
    ${n.pdf ? html`<aside class="news-pdf">
      <span class="news-pdf-icon">${icon('file')}</span>
      <span class="news-pdf-text"><strong>${n.pdf.title || 'Attached document'}</strong><span class="eyebrow">PDF${n.pdf.pages ? `, ${n.pdf.pages} page${n.pdf.pages > 1 ? 's' : ''}` : ''}${n.pdf.sizeBytes ? `, ${bytes(n.pdf.sizeBytes)}` : ''}</span></span>
      <a class="btn btn-red btn-sm" href="${n.pdf.file}" download>${icon('download')} Download PDF</a>
    </aside>` : ''}
    <p class="news-back"><a class="btn btn-ghost btn-sm" href="/news/">${icon('arrowLeft')} All news</a></p>
  </div></div></section>
  ${more.length ? html`<section class="sec sec-paper"><div class="container"><header class="sec-head"><h2>More news</h2></header><div class="card-grid news-grid">${more.map((x) => newsCard(x))}</div></div></section>` : ''}
  ${ctaBand(data.home.cta)}`;
  const site = data.site;
  return {
    path: newsUrl(n.slug), title: n.title, description: n.summary, ogImage: n.cover?.src, body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'NewsArticle', headline: n.title, description: n.summary, datePublished: n.date, ...(n.cover ? { image: site.siteUrl.replace(/\/$/, '') + n.cover.src } : {}), publisher: { '@type': 'Organization', name: site.name } },
  };
}

/** Home page strip: the latest three posts, left out entirely when there are none. */
export function homeNews(data) {
  const latest = data.news.slice(0, 3);
  if (!latest.length) return '';
  return html`<section class="sec sec-paper" id="news"><div class="container">
    <div class="split-head news-split">${sectionHead({ kicker: 'News', title: 'Latest from Akcelport' })}<a class="btn btn-ghost btn-sm" href="/news/">All news ${icon('arrow')}</a></div>
    <div class="card-grid news-grid">${latest.map((n) => newsCard(n))}</div>
  </div></section>`;
}
