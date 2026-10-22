// Home hero: a scroll-scrubbed canvas glide "down the busbar", drawn in code (no video, no image assets).
// Scroll progress 0..1 drives the camera along three copper busbars on red standoff insulators and
// settles on a bolted splice joint. Pacing, gating and legibility follow the 10k-websites standard.
(() => {
  const root = document.querySelector('[data-hero]');
  if (!root) return;
  const stage = root.querySelector('.hero-stage');
  const canvas = root.querySelector('.hero-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const rng = (seed) => { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

  // ------------------------------------------------------------------ text bands
  const bands = [...root.querySelectorAll('[data-band]')].map((el, i) => {
    const [a, b] = el.dataset.range.split(',').map(Number);
    return { el, a, b, fx: el.dataset.fx, first: 'first' in el.dataset, last: 'last' in el.dataset, op: -1, k: -1, i };
  });
  bands.forEach((b) => {
    const h = b.el.querySelector('[data-split]'); if (!h) return;
    const text = h.textContent.trim(), r = rng(7 + b.i * 13), words = text.split(/\s+/);
    h.textContent = '';
    const sr = document.createElement('span'); sr.className = 'sr-only-split'; sr.textContent = text;
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    const total = text.replace(/\s/g, '').length; let ci = 0;
    words.forEach((w, wi) => {
      const ws = document.createElement('span'); ws.className = 'w';
      ws.style.setProperty('--th', (wi / Math.max(1, words.length) * 0.45 + r() * 0.04).toFixed(3));
      if (b.fx === 'snap') {
        [...w].forEach((ch) => { const cs = document.createElement('span'); cs.className = 'c'; cs.textContent = ch; cs.style.setProperty('--th', (ci++ / total * 0.55 + r() * 0.04).toFixed(3)); ws.append(cs); });
      } else ws.textContent = w;
      vis.append(ws); if (wi < words.length - 1) vis.append(' ');
    });
    h.append(sr, vis);
  });

  // ------------------------------------------------------------------ scene
  const BG = [11, 13, 17];
  const JZ = 10.3;                    // splice joint position along the run
  const BARS = [-1.12, 0, 1.12];      // three phases
  const BW = 0.46, BY0 = 0.02, BY1 = 0.1;
  const FLOOR = -0.62, PLATE_TOP = FLOOR + 0.05, CH = 1.1, LIGHT = (() => { const l = [-0.5, 0.72, -0.48]; const n = Math.hypot(...l); return l.map((v) => v / n); })();
  const COPPER = { mid: [196, 112, 66], hi: [246, 184, 134], dark: [112, 58, 34], side: [120, 64, 38] };
  const RED = [214, 34, 28], STEEL = [150, 158, 170];
  const fog = (c, d) => { const t = Math.pow(smooth(4.2, 17.5, d), 1.1); return [mix(c[0], BG[0], t), mix(c[1], BG[1], t), mix(c[2], BG[2], t)]; };
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  const scale = (c, s) => [clamp(c[0] * s, 0, 255), clamp(c[1] * s, 0, 255), clamp(c[2] * s, 0, 255)];
  const add = (c, v) => [clamp(c[0] + v, 0, 255), clamp(c[1] + v, 0, 255), clamp(c[2] + v, 0, 255)];

  let W = 0, H = 0, dpr = 1, tall = false;
  const motes = (() => { const r = rng(99); return Array.from({ length: 70 }, () => ({ x: (r() - 0.5) * 7, y: -0.5 + r() * 1.9, z: r() * 14, s: 0.6 + r() * 1.3, ph: r() * 6.28 })); })();

  function camera(p) {
    const u = clamp(p / 0.9, 0, 1), e = 0.5 - 0.5 * Math.cos(Math.PI * u), z = mix(-1.2, JZ - 1.5, e), s = smooth(0.35, 1, u);
    const pitch = mix(0.11, 0.38, smooth(0, 1, u));
    return {
      x: mix(-0.1, 0.0, s), y: mix(0.46, 0.66, smooth(0, 1, u)), z, pitch, cp: Math.cos(pitch), sp: Math.sin(pitch),
      f: H * mix(0.92, 1.02, smooth(0.45, 1, u)), cx: W * (tall ? 0.5 : mix(0.62, 0.72, s)), cy: H * (tall ? mix(0.42, 0.5, s) : mix(0.44, 0.5, s)),
    };
  }
  const P = (c, x, y, z) => { const dx = x - c.x, dy = y - c.y, dz = z - c.z; const yy = dy * c.cp + dz * c.sp, zz = dz * c.cp - dy * c.sp; return { x: c.cx + c.f * dx / zz, y: c.cy - c.f * yy / zz, z: zz }; };
  const ok = (pts) => pts.every((q) => q.z > 0.12);
  function poly(pts, fill, stroke) {
    if (!ok(pts)) return;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y); ctx.closePath();
    ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 0.6; ctx.stroke(); }
  }

  // Polished copper box: left side, optional near face, and a gradient-lit top. `pulse` adds the travelling current glint.
  function bar(c, x0, x1, y0, y1, z0, z1, o = {}) {
    const d = (z0 + z1) / 2 - c.z; if (d < -0.5) return;
    const a = P(c, x0, y1, z0), b = P(c, x1, y1, z0), cc = P(c, x1, y1, z1), dd = P(c, x0, y1, z1);
    // sheen band travels with the camera so the metal reads as polished
    const sheen = (0.88 + 0.22 * Math.sin((z0 + z1) * 0.9 + 0.8) * Math.cos(z0 * 0.37)) * (o.bright || 1);
    if (c.x < x0) { // left face
      const l0 = P(c, x0, y0, z0), l1 = P(c, x0, y0, z1);
      const g = ctx.createLinearGradient(0, a.y, 0, l0.y);
      g.addColorStop(0, css(fog(scale(COPPER.side, 1.15 * sheen), d))); g.addColorStop(1, css(fog(scale(COPPER.dark, 0.7), d)));
      poly([a, dd, l1, l0], g, css(fog(scale(COPPER.side, 0.9), d)));
    }
    if (o.near && c.z < z0) { const n0 = P(c, x0, y0, z0), n1 = P(c, x1, y0, z0); poly([a, b, n1, n0], css(fog(scale(COPPER.mid, 0.62), d))); }
    const g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    const hi = scale(COPPER.hi, sheen), mid = scale(COPPER.mid, sheen), dk = scale(COPPER.dark, 1.1);
    g.addColorStop(0, css(fog(dk, d))); g.addColorStop(0.1, css(fog(hi, d))); g.addColorStop(0.32, css(fog(mid, d)));
    g.addColorStop(0.62, css(fog(scale(mid, 1.1), d))); g.addColorStop(0.88, css(fog(hi, d))); g.addColorStop(1, css(fog(dk, d)));
    poly([a, b, cc, dd], g, css(fog(COPPER.mid, d)));
    if (o.glow) { // current pulse: a soft warm streak along the centre of the bar
      const m0 = P(c, (x0 + x1) / 2 - 0.035, y1, z0), m1 = P(c, (x0 + x1) / 2 + 0.035, y1, z0), m2 = P(c, (x0 + x1) / 2 + 0.035, y1, z1), m3 = P(c, (x0 + x1) / 2 - 0.035, y1, z1);
      const k0 = o.glow(z0), k1 = o.glow(z1);
      if (k0 + k1 > 0.02 && ok([m0, m1, m2, m3])) {
        const gg = ctx.createLinearGradient((m0.x + m1.x) / 2, (m0.y + m1.y) / 2, (m3.x + m2.x) / 2, (m3.y + m2.y) / 2);
        gg.addColorStop(0, `rgba(255,214,170,${0.55 * k0 * (1 - smooth(8, 17, d))})`); gg.addColorStop(1, `rgba(255,214,170,${0.55 * k1 * (1 - smooth(8, 17, d))})`);
        poly([m0, m1, m2, m3], gg);
      }
    }
  }

  // Vertical prism (cylinder or hex) lit by the key light; drawn as shaded facets.
  function prism(c, x, z, y0, y1, r, sides, base, o = {}) {
    const d = z - c.z; if (d < -0.4) return;
    const rot = o.rot || 0, ring = (y) => Array.from({ length: sides }, (_, i) => { const t = rot + i / sides * Math.PI * 2; return P(c, x + r * Math.cos(t), y, z + r * Math.sin(t)); });
    const bot = ring(y0), top = ring(y1);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides, tm = rot + (i + 0.5) / sides * Math.PI * 2, n = [Math.cos(tm), 0, Math.sin(tm)];
      const px = x + r * n[0], pz = z + r * n[2];
      if (n[0] * (c.x - px) + n[2] * (c.z - pz) <= 0) continue;
      const lam = Math.max(0, n[0] * LIGHT[0] + n[2] * LIGHT[2]), hx = LIGHT[0] + 0, hz = LIGHT[2] - 1, hn = Math.hypot(hx, LIGHT[1], hz);
      const spec = Math.pow(Math.max(0, (n[0] * hx + n[2] * hz) / hn), o.gloss || 14) * (o.spec ?? 0.55);
      const col = add(scale(base, 0.3 + 0.95 * lam), spec * 255);
      poly([bot[i], bot[j], top[j], top[i]], css(fog(col, d)), css(fog(col, d)));
    }
    if (c.y > y1) poly(top, css(fog(add(scale(base, 1.05), 18), d)), css(fog(scale(base, 0.7), d)));
  }

  function draw(p) {
    const c = camera(p), now = performance.now() / 1000;
    // backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, css([7, 9, 12])); bg.addColorStop(Math.max(0.05, Math.min(0.9, c.cy / H)), css([22, 27, 33])); bg.addColorStop(1, css([13, 15, 19]));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    // mounting plate (floor) with seams
    const f0 = P(c, -9, FLOOR, c.z + 0.4), f1 = P(c, 9, FLOOR, c.z + 0.4), f2 = P(c, 9, FLOOR, c.z + 26), f3 = P(c, -9, FLOOR, c.z + 26);
    if (ok([f0, f1, f2, f3])) {
      const fg = ctx.createLinearGradient(0, f3.y, 0, f0.y); fg.addColorStop(0, css([24, 29, 35])); fg.addColorStop(1, css([44, 51, 59]));
      poly([f0, f1, f2, f3], fg);
      ctx.lineWidth = 1;
      for (let z = Math.ceil((c.z + 0.4) / CH) * CH; z < c.z + 24; z += CH * 2) { const a = P(c, -9, FLOOR, z), b = P(c, 9, FLOOR, z); if (a.z > 0.12) { ctx.strokeStyle = `rgba(160,172,186,${0.07 * (1 - smooth(5, 22, z - c.z))})`; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); } }
    }
    // collect and sort primitives far to near
    const items = [], zMin = Math.floor((c.z - 0.6) / CH) * CH, zMax = c.z + 19;
    const glow = (z) => { const s = ((z * 0.8 - p * 36) % 4.2 + 4.2) % 4.2; return Math.exp(-Math.pow((s - 2.1) * 1.5, 2)); };
    const slice = (z) => Math.floor(z / CH + 1e-6);
    for (const bx of BARS) {
      for (let z = zMin; z < zMax; z += CH) {
        const a = z, b = z + CH, segs = a < JZ && b > JZ ? [[a, JZ - 0.006], [JZ + 0.006, b]] : [[a, b]];
        for (const [s0, s1] of segs) items.push({ s: slice(s0), y: 1, f: () => bar(c, bx - BW / 2, bx + BW / 2, BY0, BY1, s0, s1, { glow, near: s0 <= zMin + 0.01 }) });
      }
      for (let z = 1.5 + Math.floor((c.z - 2) / 2.2) * 2.2; z < zMax; z += 2.2) {
        if (Math.abs(z - JZ) < 0.9 || z < c.z + 1.0) continue;
        items.push({ s: slice(z), y: 0, f: () => { prism(c, bx, z, FLOOR, PLATE_TOP, 0.27, 4, [58, 64, 72], { rot: Math.PI / 4, spec: 0.05 }); prism(c, bx, z, PLATE_TOP, BY0 - 0.004, 0.17, 20, RED, { spec: 0.7, gloss: 18 }); } });
        items.push({ s: slice(z), y: 2, f: () => { prism(c, bx, z, BY1, BY1 + 0.012, 0.085, 14, STEEL, { spec: 0.6 }); prism(c, bx, z, BY1 + 0.012, BY1 + 0.058, 0.062, 6, STEEL, { rot: 0.3, spec: 0.5 }); } });
      }
      // splice plate and bolts at the joint (kept inside one slice so painter ordering holds)
      items.push({ s: slice(JZ), y: 3, f: () => bar(c, bx - BW * 0.4, bx + BW * 0.4, BY1, BY1 + 0.065, JZ - 0.38, JZ + 0.38, { near: true, bright: 1.12 }) });
      for (const dz of [-0.2, 0.2]) items.push({ s: slice(JZ), y: 4, f: () => { prism(c, bx, JZ + dz, BY1 + 0.065, BY1 + 0.083, 0.1, 16, STEEL, { spec: 0.6 }); prism(c, bx, JZ + dz, BY1 + 0.083, BY1 + 0.15, 0.068, 6, STEEL, { rot: 0.25, spec: 0.6 }); } });
    }
    items.sort((m, n) => (n.s - m.s) || (m.y - n.y));
    for (const it of items) it.f();
    // dust motes, parallax against the camera
    for (const m of motes) {
      const zz = ((m.z - c.z) % 14 + 14) % 14 + 0.5, q = P(c, m.x + Math.sin(now * 0.15 + m.ph) * 0.05, m.y + Math.sin(now * 0.2 + m.ph) * 0.04, c.z + zz);
      if (q.z < 0.3 || q.x < 0 || q.x > W || q.y < 0 || q.y > H) continue;
      const a = 0.35 * (1 - smooth(5, 14, zz)) * smooth(0.5, 1.5, zz);
      ctx.fillStyle = `rgba(255,224,196,${a})`; ctx.beginPath(); ctx.arc(q.x, q.y, m.s * (H / 900) * (1.2 / Math.max(0.6, zz * 0.5)), 0, 6.283); ctx.fill();
    }
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2, 2560 / Math.max(1, stage.clientWidth));
    W = Math.max(1, Math.round(stage.clientWidth * dpr)); H = Math.max(1, Math.round(stage.clientHeight * dpr));
    canvas.width = W; canvas.height = H; tall = stage.clientWidth / stage.clientHeight < 1.05;
  }

  // ------------------------------------------------------------------ scrub engine (rAF loop that rests)
  let target = 0, shown = 0, rafId = null, lastTick = 0, onScreen = true, scrubOn = false, loadK = 0, loadStart = 0, drawn = -1;
  const heroProgress = () => { const r = root.getBoundingClientRect(), total = root.offsetHeight - innerHeight; return total > 0 ? clamp(-r.top / total, 0, 1) : 0; };
  function updateBands(p) {
    for (const b of bands) {
      const { a, b: e } = b, f = Math.min(0.05, (e - a) / 3);
      const op = (b.first ? 1 : smooth(a, a + f, p)) * (b.last ? 1 : 1 - smooth(e - f, e, p));
      let k = clamp((p - a) / Math.min(0.05, (e - a) * 0.35), 0, 1); if (b.first) k = Math.max(k, loadK);
      if (Math.abs(op - b.op) > 0.004 || (op === 0 && b.op !== 0) || (op === 1 && b.op !== 1)) { b.op = op; b.el.style.opacity = op.toFixed(3); b.el.style.visibility = op < 0.01 ? 'hidden' : 'visible'; }
      if (Math.abs(k - b.k) > 0.008 || (k === 0 && b.k !== 0) || (k === 1 && b.k !== 1)) { b.k = k; b.el.style.setProperty('--k', k.toFixed(3)); }
    }
    root.classList.toggle('scrolled', p > 0.02);
  }
  function frame(p) { if (Math.abs(p - drawn) > 0.0003) { drawn = p; draw(p); } updateBands(p); }
  function tick(now) {
    const dt = Math.min(100, now - (lastTick || now)); lastTick = now;
    shown += (target - shown) * (1 - Math.pow(1 - 0.16, dt / 16.667));
    if (loadK < 1) loadK = clamp((now - loadStart) / 1100, 0, 1);
    const settled = Math.abs(target - shown) < 0.0005 && loadK >= 1;
    if (settled) { shown = target; rafId = null; lastTick = 0; } else rafId = requestAnimationFrame(tick);
    frame(shown);
  }
  const kick = () => { if (rafId === null && onScreen && scrubOn) rafId = requestAnimationFrame(tick); };
  function onScroll() { target = heroProgress(); kick(); }
  new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; if (onScreen) { target = heroProgress(); kick(); } }).observe(root);
  addEventListener('resize', () => { size(); drawn = -1; scrubOn ? (target = heroProgress(), shown = target, frame(shown)) : drawStatic(); });

  // static hero: same composition at rest, text laid out in the page (phones, portrait, reduced motion)
  function drawStatic() { size(); draw(0.97); drawn = -1; }

  // ---- the five static-hero gates: must match the CSS media query character for character
  const GATES = [
    '(max-width: 720px)',
    '(orientation: portrait) and (max-width: 1024px)',
    '(orientation: portrait) and (pointer: coarse)',
    '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
    '(prefers-reduced-motion: reduce)',
  ];
  function enableScrub() {
    if (scrubOn) return; scrubOn = true;
    size(); addEventListener('scroll', onScroll, { passive: true });
    bands.forEach((b) => { b.op = -1; b.k = -1; });
    loadStart = performance.now(); loadK = target > 0.02 ? 1 : 0; drawn = -1;
    target = shown = heroProgress(); frame(shown); kick();
  }
  function disableScrub() {
    if (scrubOn) { scrubOn = false; removeEventListener('scroll', onScroll); if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } }
    bands.forEach((b) => { b.el.style.opacity = ''; b.el.style.visibility = ''; });
    drawStatic();
  }
  function applyHeroMode() { GATES.some((q) => matchMedia(q).matches) ? disableScrub() : enableScrub(); }
  const MQLS = GATES.map((q) => matchMedia(q));
  MQLS.forEach((m) => m.addEventListener('change', applyHeroMode));
  applyHeroMode();
  window.__heroDebug = { draw: (p) => { size(); draw(p); }, get mode() { return scrubOn ? 'scrub' : 'static'; } };
})();
