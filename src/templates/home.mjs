import { html, raw } from '../lib/html.mjs';
import { icon } from './icons.mjs';
import { picture, thumbOf, productCard, productUrl, categoryUrl, sectionHead, ctaBand } from './components.mjs';

function hero(data) {
  const { home } = data;
  const h = home.hero;
  const band = (b, i) => html`<div class="band" data-band data-fx="${b.fx}" data-range="${b.range.join(',')}" ${i === 0 ? raw('data-first') : ''} ${i === h.bands.length - 1 ? raw('data-last') : ''}>
      <p class="kicker">${b.kicker}</p>
      ${i === 0 ? html`<h1 class="hl" data-split>${b.headline}</h1>` : html`<h2 class="hl" data-split>${b.headline}</h2>`}
      <p class="sub">${b.text}</p>
      ${b.cta ? html`<div class="cta-row"><a class="btn btn-red" href="${h.primaryCta.href}">${h.primaryCta.label} ${icon('arrow')}</a><a class="btn btn-light" href="${h.secondaryCta.href}">${h.secondaryCta.label}</a></div>` : ''}
    </div>`;
  return html`<section class="hero" data-hero aria-label="Akcelport Industries" style="--hero-h:${h.scrollHeightVh}vh">
    <div class="hero-stage">
      <canvas class="hero-canvas" aria-hidden="true"></canvas>
      <div class="hero-scrim" aria-hidden="true"></div>
      <div class="bands">${h.bands.map(band)}</div>
      <div class="hero-static">
        <p class="kicker">${h.static.kicker}</p>
        <h1 class="hl">${h.static.headline}</h1>
        <p class="sub">${h.static.text}</p>
        <div class="cta-row"><a class="btn btn-red" href="${h.primaryCta.href}">${h.primaryCta.label} ${icon('arrow')}</a><a class="btn btn-light" href="${h.secondaryCta.href}">${h.secondaryCta.label}</a></div>
      </div>
      <div class="scroll-cue" aria-hidden="true"><span>${h.cue}</span><i></i></div>
    </div>
  </section>`;
}

function stats(data) {
  return html`<section class="stats"><div class="container stats-in">${data.site.stats.map((s) => html`<div class="stat"><strong>${s.value}</strong><span>${s.label}</span></div>`)}</div></section>`;
}

function families(data) {
  const { home, categories, bySlug } = data;
  return html`<section class="sec sec-paper" id="range"><div class="container">
    ${sectionHead(home.families)}
    <div class="fam-grid">${categories.map((c, i) => html`<a class="fam-card chamfer fam-${i + 1}" href="${categoryUrl(c.slug)}">
        <span class="fam-text">
          <span class="fam-icon">${icon(c.icon)}</span>
          <span class="fam-name">${c.name}</span>
          <span class="fam-sum">${c.summary}</span>
          <span class="fam-list">${c.products.map((s) => html`<span>${bySlug.get(s).name}</span>`)}</span>
          <span class="card-link">${c.products.length} ranges ${icon('arrow')}</span>
        </span>
        <span class="fam-media">${picture(thumbOf(c.image), { sizes: '(min-width: 900px) 30vw, 80vw' })}</span>
      </a>`)}</div>
  </div></section>`;
}

function process(data) {
  const p = data.home.process;
  const c = p.circuit;
  return html`<section class="sec sec-ink process" id="built-in"><div class="container">
    <div class="process-top">
      ${sectionHead(p, 'on-dark')}
      <div class="circuit" data-circuit>
        <div class="circuit-card chamfer">
          <p class="circuit-title">${icon('bolt')} ${c.title}</p>
          <svg class="circuit-svg" viewBox="0 0 520 120" role="img" aria-label="A switch that closes as you hold the button">
            <path class="wire" d="M16 70H196M308 70H504" />
            <path class="wire lit" d="M16 70H196M308 70H504" pathLength="1" />
            <circle class="term" cx="196" cy="70" r="7" /><circle class="term" cx="308" cy="70" r="7" />
            <g class="blade"><path d="M196 70 L296 70" /></g>
            <circle class="lamp" cx="504" cy="70" r="11" />
            <g class="rays"><path d="M504 44v-12M526 56l9-9M530 70h12M526 84l9 9M504 96v12" /></g>
          </svg>
          <button class="hold" type="button" data-hold aria-describedby="hold-hint"><span class="hold-fill" aria-hidden="true"></span><span class="hold-label">${c.button}</span></button>
          <p class="hold-hint" id="hold-hint">${c.hint}. Keyboard: hold Space or Enter.</p>
          <div class="circuit-result" aria-live="polite"><p class="circuit-done">${c.done}</p><ul>${c.items.map((t) => html`<li>${icon('check')}${t}</li>`)}</ul></div>
        </div>
      </div>
    </div>
    <ol class="steps">${p.steps.map((s, i) => html`<li class="step"><span class="step-n">0${i + 1}</span><h3>${s.title}</h3><p>${s.text}</p></li>`)}</ol>
  </div></section>`;
}

function featured(data) {
  const f = data.home.featured;
  return html`<section class="sec sec-white" id="featured"><div class="container">
    <div class="split-head">${sectionHead(f)}<div class="scroller-nav"><button type="button" class="round-btn" data-scroll="-1" aria-label="Previous products">${icon('arrowLeft')}</button><button type="button" class="round-btn" data-scroll="1" aria-label="Next products">${icon('arrow')}</button></div></div>
    <div class="scroller" data-scroller tabindex="0" role="region" aria-label="Popular product ranges">${f.slugs.map((s) => productCard(data.bySlug.get(s), data))}</div>
  </div></section>`;
}

function industries(data) {
  const ind = data.home.industries;
  return html`<section class="sec sec-black industries" id="industries"><div class="container">
    ${sectionHead(ind, 'on-dark')}
    <div class="tabs" data-tabs>
      <div class="tablist" role="tablist" aria-label="Industries">${ind.items.map((t, i) => html`<button role="tab" id="tab-${t.id}" aria-controls="panel-${t.id}" aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}"><span>${t.name}</span></button>`)}</div>
      ${ind.items.map((t, i) => html`<div class="tabpanel" role="tabpanel" id="panel-${t.id}" aria-labelledby="tab-${t.id}" ${i ? raw('hidden') : ''}>
        <div class="tp-text"><p class="kicker">${t.name}</p><h3>${t.headline}</h3><p>${t.text}</p>
          <p class="tp-areas-h">Application areas</p><ul class="tp-areas">${t.areas.map((a) => html`<li>${a}</li>`)}</ul></div>
        <div class="tp-products"><p class="tp-areas-h">Ranges for this industry</p><ul>${t.products.map((s) => html`<li><a href="${productUrl(s)}"><span class="tp-thumb">${picture(thumbOf(data.bySlug.get(s).hero))}</span><span>${data.bySlug.get(s).name}</span>${icon('arrow')}</a></li>`)}</ul></div>
      </div>`)}
    </div>
  </div></section>`;
}

function globalPresence(data) {
  const { home, markets } = data;
  return html`<section class="sec sec-paper" id="global"><div class="container">
    ${sectionHead({ kicker: home.global.kicker, title: home.global.title, lede: markets.intro })}
    <div class="region-grid">${markets.regions.map((r) => html`<div class="region"><h3>${r.name}</h3><p class="region-n">${r.countries.length} ${r.countries.length > 1 ? 'countries' : 'country'}</p><ul>${r.countries.map((c) => html`<li>${c}</li>`)}</ul></div>`)}</div>
  </div></section>`;
}

function brochure(data) {
  const d = data.docById.get(data.home.downloads.docId);
  const b = data.home.downloads;
  return html`<section class="sec sec-white"><div class="container brochure">
    <div class="brochure-text">${sectionHead(b)}<a class="btn btn-red" href="${d.file}" download>${icon('download')} Download the brochure</a><a class="btn btn-ghost" href="/downloads/">All datasheets</a></div>
    <div class="brochure-doc"><img src="${d.thumb}" width="210" height="297" alt="First page of the Akcelport company brochure" loading="lazy"></div>
  </div></section>`;
}

export function homePage(data) {
  const body = html`${hero(data)}${stats(data)}${families(data)}${process(data)}${featured(data)}${industries(data)}${globalPresence(data)}${brochure(data)}${ctaBand(data.home.cta)}`;
  const { site } = data;
  return {
    path: '/', title: `${site.name} | Electrical components for control panels and switchgear`, titleRaw: true, description: site.description,
    bodyClass: 'home', scripts: ['/assets/hero.js'], body,
    head: raw('<noscript><style>.hero{height:auto!important}.hero-stage{position:relative!important;height:auto!important;min-height:100svh}.bands{display:none!important}.hero-static{display:block!important}</style></noscript>'),
    jsonLd: { '@context': 'https://schema.org', '@type': 'Organization', name: site.name, url: site.siteUrl, logo: site.siteUrl + site.logo.src, email: site.contact.email, telephone: site.contact.phone, address: { '@type': 'PostalAddress', streetAddress: site.contact.address.slice(0, 2).join(', '), addressLocality: 'Mumbai', postalCode: '400088', addressCountry: 'IN' } },
  };
}
