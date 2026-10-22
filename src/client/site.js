// Site behaviour: menus, tabs, scroller, lightbox, filters, subnav, hold interaction, enquiry form.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- mega menu + mobile drawer
  const mega = $('[data-mega]'), toggle = $('[data-mega-toggle]');
  if (mega && toggle) {
    const set = (open) => { mega.hidden = !open; toggle.setAttribute('aria-expanded', String(open)); };
    toggle.addEventListener('click', (e) => { e.preventDefault(); set(mega.hidden); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !mega.hidden) { set(false); toggle.focus(); } });
    document.addEventListener('click', (e) => { if (!mega.hidden && !mega.contains(e.target) && !toggle.contains(e.target)) set(false); });
    toggle.closest('.has-mega').addEventListener('mouseenter', () => matchMedia('(hover:hover)').matches && set(true));
    $('[data-header]').addEventListener('mouseleave', () => matchMedia('(hover:hover)').matches && set(false));
  }
  const drawer = $('[data-drawer]'), burger = $('[data-drawer-toggle]');
  if (drawer && burger) {
    burger.addEventListener('click', () => {
      const open = drawer.hidden; drawer.hidden = !open; burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu'); document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  // ---- tabs (industries)
  $$('[data-tabs]').forEach((root) => {
    const tabs = $$('[role=tab]', root), panels = $$('[role=tabpanel]', root);
    const pick = (i, focus) => tabs.forEach((t, n) => {
      const on = n === i; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; panels[n].hidden = !on; if (on && focus) t.focus();
    });
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => pick(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); pick((i + 1) % tabs.length, true); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); pick((i - 1 + tabs.length) % tabs.length, true); }
      });
    });
  });

  // ---- horizontal scroller buttons
  $$('[data-scroll]').forEach((b) => b.addEventListener('click', () => {
    const sc = $('[data-scroller]'); const step = sc.firstElementChild.getBoundingClientRect().width + 20;
    sc.scrollBy({ left: Number(b.dataset.scroll) * step * 2, behavior: reduced() ? 'auto' : 'smooth' });
  }));

  // ---- lightbox
  let dlg;
  const lightbox = (src, alt) => {
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.className = 'lightbox'; dlg.setAttribute('aria-label', 'Image viewer');
      dlg.innerHTML = '<div class="lb-in"><div class="lb-bar"><p class="lb-cap"></p><button type="button" class="lb-close" aria-label="Close image">Close</button></div><div class="lb-stage"><img alt=""></div></div>';
      document.body.append(dlg);
      dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.classList.contains('lb-stage')) dlg.close(); });
      $('.lb-close', dlg).addEventListener('click', () => dlg.close());
      dlg.addEventListener('close', () => { document.body.style.overflow = ''; dlg.opener && dlg.opener.focus(); });
    }
    const img = $('img', dlg); img.src = src; img.alt = alt || '';
    $('.lb-cap', dlg).textContent = alt || '';
    img.onload = () => $('.lb-stage', dlg).classList.toggle('fit', img.naturalHeight / img.naturalWidth < 1.4);
    dlg.opener = document.activeElement; dlg.showModal(); document.body.style.overflow = 'hidden'; $('.lb-stage', dlg).scrollTop = 0;
  };
  document.addEventListener('click', (e) => {
    const z = e.target.closest('[data-zoom]'); if (!z) return;
    e.preventDefault(); lightbox(z.dataset.zoom, z.dataset.zoomAlt);
  });

  // ---- filter (products index, downloads)
  $$('[data-filter]').forEach((bar) => {
    const scope = bar.parentElement, items = $$('[data-search]', scope), input = $('[data-filter-input]', bar), count = $('[data-filter-count]', bar), empty = $('[data-filter-empty]', scope);
    const chips = $$('.chip', bar); let family = 'all';
    const run = () => {
      const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean); let n = 0;
      items.forEach((it) => {
        const ok = (family === 'all' || it.dataset.family.split(' ').includes(family)) && q.every((w) => it.dataset.search.includes(w));
        it.classList.toggle('is-hidden', !ok); if (ok) n++;
      });
      count.textContent = `${n} shown`; if (empty) empty.hidden = n > 0;
      $$('.group-h', scope).forEach((h) => { const grid = h.nextElementSibling; h.classList.toggle('is-hidden', ![...grid.children].some((c) => !c.classList.contains('is-hidden'))); });
    };
    chips.forEach((c) => c.addEventListener('click', () => { family = c.dataset.family; chips.forEach((x) => { x.classList.toggle('is-on', x === c); x.setAttribute('aria-pressed', x === c); }); run(); }));
    input.addEventListener('input', run);
    const params = new URLSearchParams(location.search);
    if (params.get('q')) input.value = params.get('q');
    if (params.get('family')) { const c = chips.find((x) => x.dataset.family === params.get('family')); if (c) c.click(); }
    if (params.get('focus') === 'search') input.focus();
    run();
  });

  // ---- product subnav highlight
  const sub = $('[data-subnav]');
  if (sub && 'IntersectionObserver' in window) {
    const links = $$('a[href^="#"]', sub), map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) links.forEach((a) => a.classList.toggle('is-on', a === map.get(en.target.id))); }), { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // ---- press-and-hold: close the circuit
  $$('[data-circuit]').forEach((root) => {
    const btn = $('[data-hold]', root); let p = 0, holding = false, raf = 0, last = 0;
    const paint = () => { root.style.setProperty('--p', p.toFixed(3)); };
    const done = () => { root.classList.add('is-done'); p = 1; paint(); };
    const tick = (t) => {
      const dt = Math.min(64, t - (last || t)); last = t;
      p = Math.max(0, Math.min(1, p + (holding ? dt / 1500 : -dt / 900)));
      paint();
      if (p >= 1) { holding = false; return done(); }
      if (p > 0 || holding) raf = requestAnimationFrame(tick); else { raf = 0; last = 0; }
    };
    const start = () => { if (root.classList.contains('is-done')) return; if (reduced()) return done(); holding = true; if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    const stop = () => { holding = false; };
    btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture?.(e.pointerId); start(); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => btn.addEventListener(ev, stop));
    btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } });
    btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => { if (e.matches && p > 0) done(); });
  });

  // ---- enquiry form (Formspree-style JSON endpoint from content/site.json)
  const form = $('[data-form]');
  if (form) {
    const q = new URLSearchParams(location.search).get('product');
    const req = $('#f-requirement'); if (q && req && !req.value) req.value = `Enquiry about: ${q}\n\n`;
    const status = $('[data-form-status]', form), endpoint = form.dataset.endpoint;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!endpoint) { status.className = 'form-status err'; status.textContent = 'Form endpoint not configured.'; return; }
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const btn = $('button[type=submit]', form), label = btn.textContent;
      btn.disabled = true; btn.textContent = form.dataset.sending; status.className = 'form-status'; status.textContent = '';
      try {
        const data = new FormData(form); data.append('_subject', form.dataset.subject);
        const res = await fetch(endpoint, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(String(res.status));
        form.reset(); status.className = 'form-status ok'; status.textContent = form.dataset.success;
      } catch {
        status.className = 'form-status err'; status.textContent = form.dataset.error;
      } finally { btn.disabled = false; btn.textContent = label; }
    });
  }

  // ---- pause looping animation on hidden tabs
  document.addEventListener('visibilitychange', () => document.body.classList.toggle('paused', document.hidden));
})();
