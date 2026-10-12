/* Scroll feel — damped wheel/keyboard scrolling with sticky stops.
   Input moves the page at a reduced rate and can only run a short way ahead of the page, so a hard flick can't jump a
   section. Components register stop points via window.__detents[name] = () => [scrollY, ...]; the page settles on a stop
   and only moves on after a short hold plus fresh input in the same direction. Touch scrolling stays native. */
(() => {
  const CFG = window.SCROLL_FEEL = {
    speed: 0.6,       // share of the raw wheel delta applied
    maxLead: 0.32,    // wheel target may run at most this share of the viewport ahead of the page
    keyLead: 0.9,     // same cap for keyboard steps
    smoothMs: 130,    // easing time constant
    holdMs: 520,      // minimum stay on a stop
    press: 0.4,       // fresh input (share of viewport) needed after holdMs to leave a stop
    line: 40, arrow: 90,
  };
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches, html = document.documentElement;
  let cur = scrollY, target = scrollY, raf = 0, last = 0, hold = null;
  const maxY = () => Math.max(0, html.scrollHeight - innerHeight);
  const stops = () => {
    const D = window.__detents || {}; let a = [];
    for (const k in D) { try { a = a.concat(D[k]() || []); } catch (e) {} }
    return a.filter(Number.isFinite);
  };
  const locked = () => html.classList.contains('ce-on');
  function innerScroller(el, dy) {
    for (; el && el.nodeType === 1 && el !== document.body && el !== html; el = el.parentElement) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1 && (dy > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0)) return el;
    }
    return null;
  }
  function sync() { if (!raf) { cur = target = scrollY; } }
  function push(dy, lead, now) {
    const vh = innerHeight, dir = Math.sign(dy);
    if (hold) {
      if (dir !== hold.dir) hold = null;
      else { if (now >= hold.until) hold.p += Math.abs(dy); if (hold.p < CFG.press * vh) return; hold = null; }
    }
    const L = lead * vh;
    let t = Math.max(cur - L, Math.min(cur + L, target + dy));
    t = Math.max(0, Math.min(maxY(), t));
    let best = null;
    for (const d of stops()) {
      const crosses = dir > 0 ? d > cur + 1 && d <= t : d < cur - 1 && d >= t;
      if (crosses && (best === null || Math.abs(d - cur) < Math.abs(best - cur))) best = d;
    }
    if (best !== null) { t = best; hold = { dir, until: now + CFG.holdMs, p: 0 }; }
    target = t; kick();
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(now) {
    raf = 0;
    const dt = Math.min(64, now - last); last = now;
    cur += (target - cur) * (rm ? 1 : 1 - Math.exp(-dt / CFG.smoothMs));
    if (Math.abs(target - cur) < 0.5) cur = target;
    window.scrollTo({ top: cur, behavior: 'instant' });
    if (cur !== target) raf = requestAnimationFrame(tick);
  }
  addEventListener('wheel', e => {
    if (e.ctrlKey || e.defaultPrevented || locked() || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dy = e.deltaY * (e.deltaMode === 1 ? CFG.line : e.deltaMode === 2 ? innerHeight : 1);
    if (!dy || innerScroller(e.target, dy)) return;
    e.preventDefault(); sync();
    push(dy * CFG.speed, CFG.maxLead, performance.now());
  }, { passive: false });
  addEventListener('keydown', e => {
    if (e.defaultPrevented || locked() || e.altKey || e.ctrlKey || e.metaKey) return;
    const tg = e.target || {};
    if (/INPUT|TEXTAREA|SELECT|BUTTON|A/.test(tg.tagName || '') && e.key === ' ' || /INPUT|TEXTAREA|SELECT/.test(tg.tagName || '') || tg.isContentEditable) return;
    const vh = innerHeight, k = e.key;
    const dy = k === 'ArrowDown' ? CFG.arrow : k === 'ArrowUp' ? -CFG.arrow : k === 'PageDown' || (k === ' ' && !e.shiftKey) ? vh * 0.85 : k === 'PageUp' || (k === ' ' && e.shiftKey) ? -vh * 0.85 : 0;
    if (!dy) return;
    e.preventDefault(); sync();
    push(dy, CFG.keyLead, performance.now());
  });
  // anchor jumps, scrollbar drags, touch: follow them
  addEventListener('scroll', () => {
    if (Math.abs(scrollY - cur) > (raf ? 60 : 2)) { cancelAnimationFrame(raf); raf = 0; cur = target = scrollY; hold = null; }
  }, { passive: true });
})();
