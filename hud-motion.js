// HUD motion primitives — reusable across the site. All timings (ms) and easings live in CONFIG.
(function () {
  const CONFIG = {
    boot: { start: 100, scaleDur: 600, ease: [0.65, 0, 0.35, 1], fill: [[100, 1], [450, 0.6], [700, 0.25], [1000, 0]], bracketsAt: 350, bracketsFade: 100, flickerAt: 1000, revealAt: 1050 },
    flicker: { steps: [[1, 40], [0, 70], [1, 30], [0.3, 120]] },
    scramble: { glyphMs: 40, cycles: [3, 6], charStagger: 30, total: [600, 900], maxGlyphMs: 100, glyphs: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%/_' },
    reveal: { fade: 150, stagger: 40 },
    glitch: { dur: 250, bands: 5, jumpers: [2, 3], shift: [4, 12], jumpEvery: 50, split: [30, 170], splitPx: 3, tearAt: [70, 150], blackout: [190, 223] },
    reduced: { fade: 150 },
    hero: { cardStagger: 80, centerBootAt: 160, swapStagger: 60, pinVh: 1, trigger: 0.4, mobileTrigger: 0.5 }
  };

  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(rnd(a, b + 1));
  const kf = (pts, t) => {
    if (t <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return v0 + (v1 - v0) * (t - t0) / (t1 - t0); }
    return pts[pts.length - 1][1];
  };
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) { const v = X(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return Y(t);
    };
  }

  // Single rAF clock. speed scales every duration; clock pauses while the tab is hidden.
  class Engine {
    constructor() { this.tracks = []; this.clock = 0; this.speed = 1; this.reduced = false; this.last = 0; this.hooks = []; this.raf = 0; this.loop = this.loop.bind(this); }
    start() { if (!this.raf) this.raf = requestAnimationFrame(this.loop); }
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
    loop(now) {
      this.raf = requestAnimationFrame(this.loop);
      const dt = this.last ? Math.min(64, now - this.last) : 16; this.last = now;
      if (!document.hidden) {
        this.clock += dt * this.speed;
        for (const tr of this.tracks.slice()) {
          if (tr.dead) continue;
          const t = this.clock - tr.t0; if (t < 0) continue;
          if (!tr.began) { tr.began = true; tr.onStart && tr.onStart(); }
          tr.fn && tr.fn(Math.min(t, tr.dur));
          if (t >= tr.dur) { tr.dead = true; tr.onEnd && tr.onEnd(); }
        }
        this.tracks = this.tracks.filter(t => !t.dead);
      }
      for (const h of this.hooks) h(now, dt);
    }
    add({ delay = 0, dur = 0, fn, onStart, onEnd, tag }) { const tr = { t0: this.clock + delay, dur, fn, onStart, onEnd, tag }; this.tracks.push(tr); return tr; }
    cancel(tag) { for (const t of this.tracks) if (t.tag === tag) t.dead = true; }
  }

  function parts(card) {
    return {
      card,
      outline: card.querySelector('[data-hud-outline]'),
      screens: Array.from(card.querySelectorAll('[data-hud-screen]')),
      boot: card.querySelector('[data-hud-boot]'),
      fill: card.querySelector('[data-hud-fill]'),
      arms: Array.from(card.querySelectorAll('[data-hud-arm]')),
      wrap: card.querySelector('[data-hud-sets]'),
      sets: Array.from(card.querySelectorAll('[data-hud-set]')),
      set: n => card.querySelector('[data-hud-set="' + n + '"]'),
      tear: card.querySelector('[data-crt-tear]'),
      black: card.querySelector('[data-crt-flicker]')
    };
  }
  const items = setEl => Array.from(setEl.querySelectorAll('[data-rv]'));
  function showSet(s, on) { s.style.opacity = on ? '1' : '0'; s.setAttribute('aria-hidden', on ? 'false' : 'true'); s.inert = !on; }

  // Brackets: each arm is a 1px bar. Arms translate with the overlay corner and lengthen with scaleX/scaleY
  // along their own axis only, so the stroke never thickens.
  function setArms(p, s) {
    const W = +(p.boot && p.boot.getAttribute('data-w')) || 0, H = +(p.boot && p.boot.getAttribute('data-h')) || 0;
    p.arms.forEach(a => {
      const k = a.getAttribute('data-hud-arm'), sx = k[1] === 'l' ? 1 : -1, sy = k[0] === 't' ? 1 : -1;
      const dx = sx * (1 - s) * W / 2, dy = sy * (1 - s) * H / 2;
      a.style.transform = 'translate(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px) ' + (k[3] === 'h' ? 'scaleX(' : 'scaleY(') + s.toFixed(4) + ')';
    });
  }

  function prime(card, setName) {
    const p = parts(card);
    card.__hudGlitch = false;
    card.querySelectorAll('[data-hud-glitch]').forEach(n => n.remove());
    if (p.outline) p.outline.style.opacity = '0';
    p.screens.forEach(e => (e.style.opacity = '0'));
    if (p.fill) { p.fill.style.opacity = '0'; p.fill.style.transform = 'scale(0)'; }
    setArms(p, 0); p.arms.forEach(a => (a.style.opacity = '0'));
    p.sets.forEach(s => showSet(s, s.getAttribute('data-hud-set') === setName));
    const cur = p.set(setName); if (cur) items(cur).forEach(e => (e.style.opacity = '0'));
  }

  // ---- text scramble: per-character boxes locked to final glyph widths so layout never moves ----
  let mctx = null;
  function fontOf(el) { const cs = getComputedStyle(el); return { font: cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily, ls: parseFloat(cs.letterSpacing) || 0 }; }
  function prepScramble(el) {
    const live = el.__scr && el.contains(el.__scr.vis), f = fontOf(el);
    if (live && el.__scr.font === f.font) return el.__scr;
    const text = live ? el.__scr.text : (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    mctx = mctx || document.createElement('canvas').getContext('2d'); mctx.font = f.font;
    el.textContent = '';
    const sr = document.createElement('span'); sr.textContent = text;
    Object.assign(sr.style, { position: 'absolute', width: '1px', height: '1px', margin: '-1px', padding: '0', border: '0', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' });
    const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
    const chars = [];
    text.split(/( )/).forEach(tok => {
      if (tok === ' ') { vis.appendChild(document.createTextNode(' ')); return; }
      if (!tok) return;
      const w = document.createElement('span'); w.style.display = 'inline-block'; w.style.whiteSpace = 'nowrap';
      for (const ch of tok) {
        const c = document.createElement('span'); c.style.display = 'inline-block'; c.style.width = (mctx.measureText(ch).width + f.ls).toFixed(3) + 'px'; c.textContent = ch;
        w.appendChild(c); chars.push({ span: c, final: ch, fixed: !/[A-Za-z0-9]/.test(ch) });
      }
      vis.appendChild(w);
    });
    el.appendChild(sr); el.appendChild(vis);
    el.__scr = { text, font: f.font, vis, chars };
    return el.__scr;
  }
  function finishText(el) { const st = prepScramble(el); if (st) st.chars.forEach(c => (c.span.textContent = c.final)); }
  function fontsReady(root) {
    const els = Array.from((root || document).querySelectorAll('[data-scr]'));
    const fonts = Array.from(new Set(els.map(e => fontOf(e).font)));
    const load = document.fonts ? Promise.all(fonts.map(f => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready) : Promise.resolve();
    return Promise.race([load, new Promise(r => setTimeout(r, 3000))]).then(() => { els.forEach(e => prepScramble(e)); });
  }

  // C) textScramble — returns its duration (ms, unscaled)
  function textScramble(eng, el, { delay = 0, tag } = {}) {
    const st = prepScramble(el);
    if (!st || eng.reduced) { if (st) finishText(el); eng.add({ delay, dur: 0, tag, onEnd: () => (el.style.opacity = '1') }); return 0; }
    const S = CONFIG.scramble, n = st.chars.length;
    const s = Math.min(S.charStagger, (S.total[1] - S.cycles[1] * S.glyphMs) / Math.max(1, n - 1));
    let g = S.glyphMs;
    if ((n - 1) * s + S.cycles[1] * g < S.total[0]) g = Math.min(S.maxGlyphMs, (S.total[0] - (n - 1) * s) / S.cycles[1]);
    const plan = st.chars.map((c, i) => ({ c, start: i * s, lock: c.fixed ? 0 : i * s + rint(S.cycles[0], S.cycles[1]) * g, k: -1, done: false }));
    const dur = Math.max(0, ...plan.map(q => q.lock));
    eng.add({
      delay, dur, tag,
      onStart: () => { el.style.opacity = '1'; plan.forEach(q => { q.k = -1; q.done = q.c.fixed; q.c.span.textContent = q.c.fixed ? q.c.final : '\u00a0'; }); },
      fn: t => {
        for (const q of plan) {
          if (q.done) continue;
          if (t >= q.lock) { q.c.span.textContent = q.c.final; q.done = true; }
          else if (t >= q.start) { const k = ((t - q.start) / g) | 0; if (k !== q.k) { q.k = k; q.c.span.textContent = S.glyphs[(Math.random() * S.glyphs.length) | 0]; } }
        }
      },
      onEnd: () => finishText(el)
    });
    return dur;
  }

  // B) flickerOn — opacity only
  function flickerOn(eng, els, { delay = 0, tag, onEnd } = {}) {
    els = [].concat(els).filter(Boolean);
    const set = v => els.forEach(e => (e.style.opacity = String(v)));
    if (eng.reduced) { eng.add({ delay, dur: 0, tag, onEnd: () => { set(1); onEnd && onEnd(); } }); return 0; }
    const steps = CONFIG.flicker.steps, dur = steps.reduce((a, s) => a + s[1], 0);
    eng.add({ delay, dur, tag, fn: t => { let acc = 0; for (const [v, d] of steps) { if (t < acc + d) { set(v); return; } acc += d; } set(1); }, onEnd: () => { set(1); onEnd && onEnd(); } });
    return dur;
  }

  // D) revealContent — images fade, text scrambles, 40ms stagger in DOM order
  function revealContent(eng, setEl, { delay = 0, tag, onEnd } = {}) {
    const R = CONFIG.reveal, its = setEl ? items(setEl) : [];
    if (eng.reduced) {
      const F = CONFIG.reduced.fade;
      its.forEach(e => { if (e.hasAttribute('data-scr')) finishText(e); });
      eng.add({ delay, dur: F, tag, fn: t => its.forEach(e => (e.style.opacity = String(t / F))), onEnd });
      return;
    }
    let end = delay;
    its.forEach((e, i) => {
      const d = delay + i * R.stagger;
      if (e.hasAttribute('data-scr')) end = Math.max(end, d + textScramble(eng, e, { delay: d, tag }));
      else { eng.add({ delay: d, dur: R.fade, tag, fn: t => (e.style.opacity = String(t / R.fade)) }); end = Math.max(end, d + R.fade); }
    });
    eng.add({ delay: end, dur: 0, tag, onEnd });
  }

  // A) bootUp
  // onScreenOn fires when the screen area has finished its flicker-on (the end of the screen's load animation).
  function bootUp(eng, card, { delay = 0, set = 'A', tag = card, onEnd, onScreenOn } = {}) {
    const B = CONFIG.boot, p = parts(card), ease = bezier.apply(null, B.ease), setEl = p.set(set);
    eng.cancel(tag); prime(card, set);
    if (eng.reduced) {
      eng.add({ delay, dur: 0, tag, onEnd: () => { setArms(p, 1); p.arms.forEach(a => (a.style.opacity = '1')); if (p.outline) p.outline.style.opacity = '1'; p.screens.forEach(e => (e.style.opacity = '1')); onScreenOn && onScreenOn(); } });
      revealContent(eng, setEl, { delay, tag, onEnd });
      return;
    }
    eng.add({
      delay, dur: B.flickerAt, tag,
      fn: t => {
        const s = t < B.start ? 0 : ease(clamp01((t - B.start) / B.scaleDur));
        if (p.fill) { p.fill.style.transform = 'scale(' + s.toFixed(4) + ')'; p.fill.style.opacity = t < B.start ? '0' : kf(B.fill, t).toFixed(3); }
        setArms(p, s);
        const a = clamp01((t - B.bracketsAt) / B.bracketsFade); p.arms.forEach(e => (e.style.opacity = String(a)));
      },
      onEnd: () => { if (p.fill) p.fill.style.opacity = '0'; setArms(p, 1); p.arms.forEach(e => (e.style.opacity = '1')); }
    });
    flickerOn(eng, [p.outline].concat(p.screens), { delay: delay + B.flickerAt, tag, onEnd: onScreenOn });
    revealContent(eng, setEl, { delay: delay + B.revealAt, tag, onEnd });
  }

  // E0) bootDown — bootUp in reverse: content fades out, screens + outline flicker off, brackets collapse into the fill flash.
  // keepOutline: leave the outer outline lit (it is handed to another element); extra: more elements faded with the content.
  function bootDown(eng, card, { delay = 0, set = null, tag = card, onEnd, keepOutline = false, extra = [] } = {}) {
    const B = CONFIG.boot, p = parts(card), ease = bezier.apply(null, B.ease), cur = set ? p.set(set) : null, its = (cur ? items(cur) : []).concat(extra);
    if (keepOutline) p.outline = null;
    eng.cancel(tag); card.__hudGlitch = false; card.querySelectorAll('[data-hud-glitch]').forEach(n => n.remove());
    const lit = [p.outline].concat(p.screens).filter(Boolean), done = () => { const o = keepOutline && card.querySelector('[data-hud-outline]'), ov = o && o.style.opacity; prime(card, set); if (o) o.style.opacity = ov; onEnd && onEnd(); };
    if (eng.reduced) {
      const F = CONFIG.reduced.fade, all = lit.concat(p.arms, its);
      eng.add({ delay, dur: F, tag, fn: t => all.forEach(e => (e.style.opacity = String(1 - t / F))), onEnd: done });
      return;
    }
    const fadeAt = 0, offAt = 160, colAt = 380, colDur = B.scaleDur, end = colAt + colDur;
    const off = [[0, 1], [40, 0.3], [80, 1], [140, 0], [170, 0.5], [200, 0]];
    const fill = [[0, 0], [250, 0.25], [480, 0.6], [colDur - 40, 1], [colDur, 0]];
    eng.add({
      delay, dur: end, tag,
      fn: t => {
        its.forEach((e, i) => { const k = clamp01((t - fadeAt - (its.length - 1 - i) * 20) / 120); e.style.opacity = String(1 - k); });
        if (t >= offAt) { const v = kf(off, t - offAt); lit.forEach(e => (e.style.opacity = String(v))); }
        if (t >= colAt) {
          const k = t - colAt, s = 1 - ease(clamp01(k / colDur));
          if (p.fill) { p.fill.style.transform = 'scale(' + s.toFixed(4) + ')'; p.fill.style.opacity = kf(fill, k).toFixed(3); }
          setArms(p, s);
          const a = 1 - clamp01((k - (colDur - 120)) / 100); p.arms.forEach(e => (e.style.opacity = String(a)));
        }
      },
      onEnd: done
    });
  }

  // E) glitchSwap
  function cleanClone(a) {
    const c = a.cloneNode(true);
    c.removeAttribute('data-hud-set'); c.setAttribute('aria-hidden', 'true'); c.inert = true; c.style.opacity = '1';
    c.querySelectorAll('[data-rv],[data-scr]').forEach(e => { e.removeAttribute('data-rv'); e.removeAttribute('data-scr'); });
    return c;
  }
  function buildGlitch(card, p, a) {
    const G = CONFIG.glitch, root = document.createElement('div');
    root.setAttribute('data-hud-glitch', '1'); root.setAttribute('aria-hidden', 'true');
    Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    const cuts = [0, 1]; for (let i = 0; i < G.bands - 1; i++) cuts.push(rnd(0.06, 0.94)); cuts.sort((x, y) => x - y);
    const bands = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      const y = cuts[i], h = cuts[i + 1] - cuts[i]; if (h < 0.01) continue;
      const w = document.createElement('div'), inner = document.createElement('div');
      Object.assign(w.style, { position: 'absolute', left: '0', width: '100%', top: y * 100 + '%', height: h * 100 + '%', overflow: 'hidden' });
      Object.assign(inner.style, { position: 'absolute', left: '0', width: '100%', top: (-y / h) * 100 + '%', height: 100 / h + '%' });
      inner.appendChild(cleanClone(a)); w.appendChild(inner); root.appendChild(w); bands.push(w);
    }
    const idx = bands.map((_, i) => i).sort(() => Math.random() - 0.5), jumpers = idx.slice(0, rint(G.jumpers[0], G.jumpers[1]));
    const mk = (col, dx) => {
      const w = document.createElement('div'); Object.assign(w.style, { position: 'absolute', inset: '0', opacity: '0', mixBlendMode: 'screen', transform: 'translateX(' + dx + 'px)' });
      const c = cleanClone(a); c.style.color = col;
      c.querySelectorAll('*').forEach(e => { e.style.color = col; e.style.textShadow = 'none'; if (e.tagName === 'IMG') e.style.visibility = 'hidden'; });
      w.appendChild(c); root.appendChild(w); return w;
    };
    const red = mk('#ff0000', -G.splitPx), cyan = mk('#00ffff', G.splitPx);
    (p.wrap || card).appendChild(root);
    return { root, bands, jumpers, red, cyan, tearOn: false };
  }
  function glitchSwap(eng, card, from, to, { delay = 0, tag = card, onEnd } = {}) {
    const G = CONFIG.glitch, p = parts(card), a = p.set(from), b = p.set(to);
    if (!a || !b || a === b) { eng.add({ delay, dur: 0, tag, onEnd }); return; }
    if (eng.reduced) {
      const F = CONFIG.reduced.fade;
      eng.add({
        delay, dur: F, tag,
        onStart: () => { items(b).forEach(e => { e.style.opacity = '1'; if (e.hasAttribute('data-scr')) finishText(e); }); b.style.opacity = '0'; b.setAttribute('aria-hidden', 'false'); b.inert = false; },
        fn: t => { const k = t / F; a.style.opacity = String(1 - k); b.style.opacity = String(k); },
        onEnd: () => { showSet(a, false); showSet(b, true); onEnd && onEnd(); }
      });
      return;
    }
    let g = null, seg = -1;
    eng.add({
      delay, dur: G.dur, tag,
      onStart: () => { g = buildGlitch(card, p, a); a.style.opacity = '0'; card.__hudGlitch = true; },
      fn: t => {
        const k = (t / G.jumpEvery) | 0;
        if (k !== seg) {
          seg = k;
          g.bands.forEach((bd, i) => { bd.style.transform = g.jumpers.indexOf(i) >= 0 && Math.random() < 0.75 ? 'translateX(' + ((Math.random() < 0.5 ? -1 : 1) * rnd(G.shift[0], G.shift[1])).toFixed(1) + 'px)' : 'none'; });
        }
        const sp = t >= G.split[0] && t < G.split[1];
        g.red.style.opacity = g.cyan.style.opacity = sp ? '0.85' : '0';
        if (p.tear) {
          const on = t >= G.tearAt[0] && t < G.tearAt[1];
          if (on && !g.tearOn) { p.tear.style.top = rnd(10, 90).toFixed(1) + '%'; p.tear.style.height = '2px'; }
          g.tearOn = on; p.tear.style.opacity = on ? '0.5' : '0';
        }
        const bo = t >= G.blackout[0] && t < G.blackout[1];
        g.root.style.opacity = bo ? '0' : '1';
        if (p.black) p.black.style.opacity = bo ? '1' : '0';
      },
      onEnd: () => {
        if (g) g.root.remove();
        card.__hudGlitch = false;
        if (p.tear) p.tear.style.opacity = '0';
        if (p.black) p.black.style.opacity = '0';
        showSet(a, false); items(b).forEach(e => (e.style.opacity = '0')); showSet(b, true);
        flickerOn(eng, [p.outline], { tag });
        revealContent(eng, b, { tag, onEnd });
      }
    });
  }

  window.HUDMotion = { CONFIG, Engine, bezier, prime, bootUp, bootDown, flickerOn, textScramble, revealContent, glitchSwap, fontsReady, prepScramble, finishText };
})();
