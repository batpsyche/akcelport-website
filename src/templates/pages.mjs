import { html, raw, esc } from '../lib/html.mjs';
import { icon } from './icons.mjs';
import { picture, zoomable, productCard, docCard, specTable, breadcrumbs, ctaBand, sectionHead, productUrl, categoryUrl, bytes } from './components.mjs';

// ------------------------------------------------------------------ product
function variantCard(v, p) {
  const [first, ...rest] = v.images || [];
  return html`<article class="vcard chamfer" id="v-${v.id}">
    ${first ? html`<div class="v-media">${zoomable(first, { cls: 'v-main' })}${rest.length ? html`<div class="v-thumbs">${rest.slice(0, 6).map((im) => zoomable(im, { cls: 'v-thumb' }))}</div>` : ''}</div>` : ''}
    <div class="v-body">
      <h3>${v.name}</h3>
      ${v.summary ? html`<p class="v-sum">${v.summary}</p>` : ''}
      ${v.facts ? html`<dl class="v-facts">${v.facts.map((f) => html`<div><dt>${f.label}</dt><dd>${f.value}</dd></div>`)}</dl>` : ''}
      ${v.bullets ? html`<ul class="ticks">${v.bullets.map((b) => html`<li>${icon('check')}${b}</li>`)}</ul>` : ''}
      ${v.table ? specTable(v.table) : ''}
      ${v.specImage ? html`<p class="v-actions"><button type="button" class="btn btn-ghost btn-sm" data-zoom="${v.specImage.src}" data-zoom-alt="${v.specImage.alt}">${icon('zoom')} ${v.specLabel || 'View dimensions table'}</button>${v.specImage2 ? html`<button type="button" class="btn btn-ghost btn-sm" data-zoom="${v.specImage2.src}" data-zoom-alt="${v.specImage2.alt}">${icon('zoom')} View BT series drawing</button>` : ''}</p>` : ''}
    </div>
  </article>`;
}

export function productPage(data, p) {
  const cat = data.catBySlug.get(p.family);
  const docs = p.downloads.map((id) => data.docById.get(id));
  const primary = docs.find((d) => d.kind === 'catalogue') || docs[0];
  const related = [...cat.products.filter((s) => s !== p.slug), ...data.products.filter((q) => q.family !== p.family).map((q) => q.slug)].slice(0, 3).map((s) => data.bySlug.get(s));
  const hasVariants = !!p.variants?.length, hasTables = !!p.tables?.length;
  const galleryImgs = [...(p.gallery || [])];
  const nav = [['overview', 'Overview'], hasVariants && ['variants', p.variantsLabel || 'Types and variants'], hasTables && ['specs', 'Specifications'], (galleryImgs.length || p.busbarSupports) && ['gallery', 'Gallery'], ['downloads', 'Downloads']].filter(Boolean);
  const body = html`
  <section class="pdp-head"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Products', href: '/products/' }, { label: cat.name, href: categoryUrl(cat.slug) }, { label: p.name }])}
    <div class="pdp-grid">
      <div class="pdp-text">
        <p class="eyebrow">${cat.name}${p.source === 'new' ? raw(' <span class="pill pill-new">New datasheet</span>') : ''}</p>
        <h1>${p.name}</h1>
        <p class="pdp-sum">${p.summary}</p>
        <dl class="facts">${p.facts.map((f) => html`<div><dt>${f.label}</dt><dd>${f.value}</dd></div>`)}</dl>
        <div class="pdp-cta"><a class="btn btn-red" href="${primary.file}" download>${icon('download')} Download datasheet (PDF, ${bytes(primary.sizeBytes)})</a><a class="btn btn-ghost" href="/contact/?product=${encodeURIComponent(p.name)}">Request a quote</a></div>
      </div>
      <figure class="pdp-media chamfer">${zoomable(p.hero, { cls: 'pdp-hero' })}${p.hero.aiEnhanced ? html`<figcaption class="ai-note"><span class="ai-tag">AI-enhanced photo</span> Upscaled and cleaned from the company's original image. <a href="${p.hero.original.src}" target="_blank" rel="noopener">View original</a></figcaption>` : ''}</figure>
    </div>
  </div></section>
  <nav class="subnav" aria-label="On this page" data-subnav><div class="container subnav-in">${nav.map(([id, l]) => html`<a href="#${id}">${l}</a>`)}<a class="subnav-quote" href="/contact/?product=${encodeURIComponent(p.name)}">Request a quote</a></div></nav>
  <section class="sec sec-white" id="overview"><div class="container ov-grid">
    <div class="ov-text"><h2>Overview</h2>${p.intro.map((t) => html`<p>${t}</p>`)}
      ${p.notes?.length ? html`<div class="callout">${p.notes.map((t) => html`<p>${t}</p>`)}</div>` : ''}</div>
    <div class="ov-side">
      <h3>Features</h3><ul class="ticks">${p.features.map((f) => html`<li>${icon('check')}${f}</li>`)}</ul>
      ${p.applications ? html`<h3>Applications</h3><ul class="chips">${p.applications.map((a) => html`<li>${a}</li>`)}</ul>` : ''}
    </div>
  </div></section>
  ${hasVariants ? html`<section class="sec sec-paper" id="variants"><div class="container">
    <header class="sec-head"><h2>${p.variantsLabel || 'Types and variants'}</h2><p class="lede">${p.variants.length} ${p.variants.length === 1 ? 'type' : 'types'} listed. Select an image to enlarge it.</p></header>
    <div class="vgrid">${p.variants.map((v) => variantCard(v, p))}</div>
  </div></section>` : ''}
  ${hasTables ? html`<section class="sec sec-white" id="specs"><div class="container">
    <header class="sec-head"><h2>Specifications</h2><p class="lede">Values are transcribed from the datasheet. The PDF is the reference; check it before ordering.</p></header>
    ${p.tables.length > 2 ? html`<ul class="toc chips">${p.tables.filter((t) => t.title && t.id).map((t) => html`<li><a href="#table-${t.id}">${t.title}</a></li>`)}</ul>` : ''}
    <div class="spec-stack">${p.tables.map(specTable)}</div>
  </div></section>` : ''}
  ${(galleryImgs.length || p.busbarSupports) ? html`<section class="sec sec-paper" id="gallery"><div class="container">
    ${galleryImgs.length ? html`<header class="sec-head"><h2>Gallery</h2></header><div class="gallery">${galleryImgs.map((im) => zoomable(im, { cls: 'g-item' }))}</div>` : ''}
    ${p.busbarSupports ? html`<header class="sec-head sec-gap"><h2>Busbar support designs</h2><p class="lede">Catalogue pages for single, three and four pole busbar supports, grip, vertical bar and L supports, adjustable support and neutral base.</p></header><div class="gallery gallery-tall">${p.busbarSupports.map((im) => zoomable(im, { cls: 'g-item' }))}</div>` : ''}
  </div></section>` : ''}
  <section class="sec sec-white" id="downloads"><div class="container">
    <header class="sec-head"><h2>Downloads</h2><p class="lede">${docs.length > 1 ? 'The current datasheet and the earlier edition from the previous website are both available.' : 'Datasheet for this range.'}</p></header>
    <div class="doc-grid">${docs.map((d) => docCard(d, data, { showProducts: false }))}</div>
  </div></section>
  <section class="sec sec-paper"><div class="container"><header class="sec-head"><h2>Related ranges</h2></header><div class="card-grid">${related.map((q) => productCard(q, data, { compact: true }))}</div></div></section>
  ${ctaBand({ title: `Need ${p.name.toLowerCase()} for your panel?`, text: 'Send us the item code or your drawing and we will reply by email with a quote.', label: 'Request a quote', href: `/contact/?product=${encodeURIComponent(p.name)}` })}`;
  return {
    path: productUrl(p.slug), title: p.seo?.title || `${p.name} | Akcelport Industries`, titleRaw: true, description: p.seo?.description || p.summary,
    ogImage: p.hero.src, body,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Product', name: p.name, description: p.summary, image: data.site.siteUrl + p.hero.src, brand: { '@type': 'Brand', name: 'Akcelport' }, category: cat.name },
  };
}

// ------------------------------------------------------------------ category
export function categoryPage(data, c) {
  const prods = c.products.map((s) => data.bySlug.get(s));
  const docIds = [...new Set(prods.flatMap((p) => p.downloads))];
  const body = html`
  <section class="page-hero dark"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Products', href: '/products/' }, { label: c.name }])}
    <div class="ph-grid"><div><span class="fam-icon big">${icon(c.icon)}</span><h1>${c.name}</h1><p class="lede">${c.summary}</p></div><p class="ph-count"><strong>${prods.length}</strong><span>${prods.length === 1 ? 'range' : 'ranges'}</span></p></div>
  </div></section>
  <section class="sec sec-paper"><div class="container"><div class="card-grid">${prods.map((p) => productCard(p, data))}</div></div></section>
  <section class="sec sec-white"><div class="container"><header class="sec-head"><h2>Datasheets for this family</h2></header><div class="doc-grid">${docIds.map((id) => docCard(data.docById.get(id), data))}</div></div></section>
  ${ctaBand(data.home.cta)}`;
  return { path: categoryUrl(c.slug), title: c.name, description: c.summary, body };
}

// ------------------------------------------------------------------ products index
export function productsPage(data) {
  const body = html`
  <section class="page-hero dark"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Products' }])}
    <div class="ph-grid"><div><h1>Products</h1><p class="lede">${data.products.length} product ranges in six families. Every range has a downloadable datasheet.</p></div></div>
  </div></section>
  <section class="sec sec-paper"><div class="container">
    <div class="filter-bar" data-filter>
      <label class="search"><span class="sr">Search products</span>${icon('search')}<input type="search" placeholder="Search by name, material or code" autocomplete="off" data-filter-input></label>
      <div class="chips-filter" role="group" aria-label="Filter by family"><button type="button" class="chip is-on" data-family="all" aria-pressed="true">All</button>${data.categories.map((c) => html`<button type="button" class="chip" data-family="${c.slug}" aria-pressed="false">${c.shortName}</button>`)}</div>
      <p class="filter-count" aria-live="polite" data-filter-count></p>
    </div>
    <div class="card-grid" data-filter-grid>${data.products.map((p) => productCard(p, data))}</div>
    <p class="empty" data-filter-empty hidden>No product matches that search. Try a shorter word, or <a href="/contact/">ask us</a>.</p>
  </div></section>
  <section class="sec sec-white"><div class="container">${sectionHead({ title: data.about.alsoAvailable.title, lede: data.about.alsoAvailable.lede })}<ul class="chips big">${data.about.alsoAvailable.items.map((i) => html`<li>${i}</li>`)}</ul></div></section>
  ${ctaBand(data.home.cta)}`;
  return { path: '/products/', title: 'Products', description: `Browse ${data.products.length} product ranges for control panels and switchgear: busbars, insulators, lugs, DIN rails, ducts, earthing and more.`, body, scripts: [] };
}

// ------------------------------------------------------------------ downloads
export function downloadsPage(data) {
  const cat = data.downloads.filter((d) => d.kind === 'catalogue' && d.id !== 'company-introduction');
  const intro = data.docById.get('company-introduction');
  const legacy = data.downloads.filter((d) => d.kind === 'legacy');
  const body = html`
  <section class="page-hero dark"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Downloads' }])}
    <div class="ph-grid"><div><h1>Downloads</h1><p class="lede">${data.downloads.length} PDF documents: the company brochure, current datasheets and the earlier datasheets from our previous website.</p></div></div>
  </div></section>
  <section class="sec sec-paper"><div class="container">
    <div class="filter-bar" data-filter>
      <label class="search"><span class="sr">Search downloads</span>${icon('search')}<input type="search" placeholder="Search documents" autocomplete="off" data-filter-input></label>
      <div class="chips-filter" role="group" aria-label="Filter by family"><button type="button" class="chip is-on" data-family="all" aria-pressed="true">All</button>${data.categories.map((c) => html`<button type="button" class="chip" data-family="${c.slug}" aria-pressed="false">${c.shortName}</button>`)}</div>
      <p class="filter-count" aria-live="polite" data-filter-count></p>
    </div>
    <div data-filter-grid>
      <h2 class="group-h">Company brochure</h2><div class="doc-grid">${docCard(intro, data)}</div>
      <h2 class="group-h">Current datasheets</h2><div class="doc-grid">${cat.map((d) => docCard(d, data))}</div>
      <h2 class="group-h">Earlier edition, from the previous website</h2><div class="doc-grid">${legacy.map((d) => docCard(d, data))}</div>
    </div>
    <p class="empty" data-filter-empty hidden>No document matches that search.</p>
  </div></section>
  ${ctaBand(data.home.cta)}`;
  return { path: '/downloads/', title: 'Downloads', description: 'Download the Akcelport company brochure and PDF datasheets for every product range.', body };
}

// ------------------------------------------------------------------ about
export function aboutPage(data) {
  const a = data.about;
  const body = html`
  <section class="page-hero dark about-hero"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'About' }])}
    <div class="ph-grid"><div><h1>${a.title}</h1><p class="lede">${a.lede}</p></div></div>
  </div></section>
  <section class="sec sec-white"><div class="container two-col">
    <div><p class="kicker">Who we are</p><h2>Components made to your requirement</h2></div>
    <div class="prose">${a.story.map((t) => html`<p>${t}</p>`)}</div>
  </div></section>
  <section class="sec sec-ink quality"><div class="container q-grid">
    <div><p class="kicker">${a.quality.kicker}</p><blockquote class="q-quote">${a.quality.quote}</blockquote>
      <p>${a.quality.body[0]}</p><ul class="ticks on-dark">${a.quality.commitments.map((c) => html`<li>${icon('check')}${c}</li>`)}</ul><p>${a.quality.body[1]}</p><p>${a.quality.process}</p></div>
    <div class="q-diagram">${picture(a.quality.diagram, { cls: 'invert-none' })}</div>
  </div></section>
  <section class="sec sec-paper"><div class="container"><div class="usp-grid">${a.usp.map((u, i) => html`<div class="usp"><span class="usp-n">0${i + 1}</span><h3>${u.title}</h3><p>${u.text}</p></div>`)}</div></div></section>
  <section class="sec sec-white"><div class="container">
    ${sectionHead({ kicker: a.manufacturing.kicker, title: a.manufacturing.title, lede: a.manufacturing.lede })}
    <ul class="cap-grid">${a.manufacturing.capabilities.map((c) => html`<li>${c}</li>`)}</ul>
    <div class="mat-grid"><div><h3>Metals</h3><ul class="chips">${a.manufacturing.metals.map((m) => html`<li>${m}</li>`)}</ul></div><div><h3>Industrial plastics</h3><ul class="chips">${a.manufacturing.plastics.map((m) => html`<li>${m}</li>`)}</ul></div></div>
  </div></section>
  <section class="sec sec-paper"><div class="container two-col">
    <div><p class="kicker">${a.global.kicker}</p><h2>${a.global.title}</h2><div class="prose">${a.global.body.map((t) => html`<p>${t}</p>`)}</div></div>
    <div class="map-wrap chamfer">${picture(a.global.map)}</div>
  </div>
  <div class="container"><div class="region-grid">${data.markets.regions.map((r) => html`<div class="region"><h3>${r.name}</h3><p class="region-n">${r.countries.length} ${r.countries.length > 1 ? 'countries' : 'country'}</p><ul>${r.countries.map((c) => html`<li>${c}</li>`)}</ul></div>`)}</div></div></section>
  <section class="sec sec-white"><div class="container">
    ${sectionHead({ kicker: a.certificates.kicker, title: a.certificates.title })}
    <ul class="cert-grid">${a.certificates.company.map((c) => html`<li>${zoomable(c)}</li>`)}</ul>
    <ul class="cert-marks">${a.certificates.products.map((c) => html`<li>${picture(c)}</li>`)}</ul>
    <ul class="marks-row">${data.site.qualityMarks.map((m) => html`<li class="mark">${m}</li>`)}</ul>
  </div></section>
  ${ctaBand(data.home.cta)}`;
  return { path: '/about/', title: 'About us', description: 'Akcelport Industries: manufacturer of electrical components for control panels and switchgear, ISO 9001 and ISO 45001 certified, exporting for more than 35 years.', body };
}

// ------------------------------------------------------------------ contact
function field(f, data) {
  const req = f.required ? raw(' required aria-required="true"') : '';
  const label = html`<label for="f-${f.name}">${f.label}${f.required ? raw(' <span class="req" aria-hidden="true">*</span>') : ''}</label>`;
  let control;
  if (f.type === 'textarea') control = html`<textarea id="f-${f.name}" name="${f.name}" rows="${f.rows || 4}" autocomplete="${f.autocomplete || 'off'}"${req}></textarea>`;
  else if (f.type === 'country') control = html`<select id="f-${f.name}" name="${f.name}" autocomplete="${f.autocomplete}"><option value="">Select a country</option>${data.countries.map((c) => html`<option${c === 'India' ? raw(' selected') : ''}>${c}</option>`)}</select>`;
  else control = html`<input id="f-${f.name}" name="${f.name}" type="${f.type}" autocomplete="${f.autocomplete || 'off'}"${req}>`;
  return html`<div class="field field-${f.type}">${label}${control}</div>`;
}

export function contactPage(data) {
  const { site, contact } = data;
  const c = site.contact;
  const configured = !!site.form.endpoint;
  const body = html`
  <section class="page-hero dark"><div class="container">
    ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Contact' }])}
    <div class="ph-grid"><div><h1>${contact.title}</h1><p class="lede">${contact.lede}</p></div></div>
  </div></section>
  <section class="sec sec-paper"><div class="container contact-grid">
    <aside class="office chamfer">
      <h2>${contact.office.heading}</h2>
      <p class="office-name">${site.name}</p>
      <address>${c.address.map((l, i) => html`${i ? raw('<br>') : ''}${l}`)}</address>
      <ul class="office-list">
        <li>${icon('phone')}<a href="tel:${c.phoneHref}">${c.phone}</a></li>
        <li>${icon('mail')}<a href="mailto:${c.email}">${c.email}</a></li>
        <li>${icon('pin')}<a href="https://www.openstreetmap.org/?mlat=${c.mapLat}&amp;mlon=${c.mapLng}#map=16/${c.mapLat}/${c.mapLng}" rel="noopener">View on map ${icon('external', 'inline')}</a></li>
      </ul>
      <p class="office-marks">${site.qualityMarks.map((m) => html`<span class="mark">${m}</span>`)}</p>
    </aside>
    <div class="form-card chamfer">
      <h2>${contact.form.heading}</h2>
      <p class="form-intro">${contact.form.intro} Fields marked <span class="req">*</span> are required.</p>
      ${configured ? '' : html`<div class="form-notice" role="status" data-form-notice><strong>Form endpoint not configured.</strong> ${site.form.notConfigured}</div>`}
      <form class="enquiry" data-form data-endpoint="${site.form.endpoint}" data-subject="${site.form.subject}" data-success="${site.form.success}" data-error="${site.form.error}" data-sending="${contact.form.sending}" action="${site.form.endpoint || '#'}" method="post" novalidate>
        <div class="form-grid">${contact.form.fields.map((f) => field(f, data))}</div>
        <p class="hp" aria-hidden="true"><label>Leave this empty <input type="text" name="_gotcha" tabindex="-1" autocomplete="off"></label></p>
        <div class="form-foot"><button class="btn btn-red" type="submit" ${configured ? '' : raw('disabled aria-disabled="true"')}>${contact.form.submit}</button><p class="privacy">${contact.form.privacy}</p></div>
        <p class="form-status" role="status" aria-live="polite" data-form-status></p>
      </form>
    </div>
  </div></section>`;
  return { path: '/contact/', title: 'Contact us', description: 'Contact Akcelport Industries, Mumbai: request a quote or ask a question about busbars, insulators, lugs, DIN rails, ducts and earthing products.', body };
}

// ------------------------------------------------------------------ sitemap + 404
export function sitemapPage(data) {
  const body = html`
  <section class="page-hero dark"><div class="container">${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Site map' }])}<div class="ph-grid"><div><h1>Site map</h1></div></div></div></section>
  <section class="sec sec-white"><div class="container smap">
    <div><h2>Company</h2><ul><li><a href="/">Home</a></li><li><a href="/about/">About us</a></li><li><a href="/downloads/">Downloads</a></li><li><a href="/contact/">Contact us</a></li><li><a href="/products/">All products</a></li></ul></div>
    ${data.categories.map((c) => html`<div><h2><a href="${categoryUrl(c.slug)}">${c.name}</a></h2><ul>${c.products.map((s) => html`<li><a href="${productUrl(s)}">${data.bySlug.get(s).name}</a></li>`)}</ul></div>`)}
  </div></section>`;
  return { path: '/sitemap/', title: 'Site map', description: 'Every page on the Akcelport Industries website.', body };
}

export function notFoundPage(data) {
  const body = html`<section class="page-hero dark"><div class="container"><div class="ph-grid"><div><p class="kicker">Error 404</p><h1>That page is not here.</h1><p class="lede">The link may be from our old website. Try the product list or the downloads page.</p><p><a class="btn btn-red" href="/products/">View products ${icon('arrow')}</a> <a class="btn btn-light" href="/">Home</a></p></div></div></div></section>`;
  return { path: '/404.html', title: 'Page not found', description: 'Page not found.', body };
}
