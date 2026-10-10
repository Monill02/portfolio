// Glyph figure — ASCII renderer ported from the prototype (index.html). Look is locked; see HANDOFF.md.
(function () {
  const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js';
  const LOOK = { rows: 184, aspect: 0.43, gamma: 1.5, iridescence: 0.08, split: 1.54, fringe: 0, flicker: 0.01, rain: 0, scanlines: 0.1, glitch: 3, edges: 0.01, detail: 0.3, headContrast: 1.95, bodyDim: 0.96, photo: 0.61, cavity: 0.4, bgDots: 0.155, fill: 0.94, zoom: 1.5, bottomPad: 0, turnEase: 0.6, sway: 3.2 };
  // Yaw: 180 = back to camera, 90 = profile, 0 = facing camera.
  const INTRO_FROM = 122, INTRO_TO = 80, INTRO_MS = 1800, END_DEG = 0;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
  const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  const RAMP = " .`-:/+osyhdmNM";
  const DIGITS = "0123456789";
  const EDGES = "|/-\\";
  const CHARSET = RAMP + DIGITS + EDGES;
  let THREE = null, threeP = null;
  const loadThree = () => threeP || (threeP = import(THREE_URL).then(m => (THREE = m)));
  // Performance: the scroll offset is cached from scroll events. Reading the document's
  // bounding rect on every frame (the old docY) forced a full layout each frame.
  let SY = window.scrollY;
  window.addEventListener('scroll', () => { SY = window.scrollY; }, { passive: true });

function parseGLB(buf) {
  const dv = new DataView(buf);
  let off = 12, json, bin;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    const body = buf.slice(off + 8, off + 8 + len);
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004E4942) bin = body;
    off += 8 + len;
  }
  const prim = json.meshes[0].primitives[0];
  const read = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const start = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
    return new C(bin.slice(start, start + a.count * comps * C.BYTES_PER_ELEMENT));
  };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(read(prim.attributes.POSITION), 3));
  g.setIndex(new THREE.BufferAttribute(read(prim.indices), 1));
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}
function b64ToBuf(s) {
  const bin = atob(s.trim()); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

/* =========================================================================
   Glyph atlas: every character drawn once into a strip, white on black.
   ========================================================================= */
let fontReady = false;
async function loadFont() { try { await document.fonts.load('600 24px "IBM Plex Mono"'); } catch (e) {} fontReady = true; }
/* Drawn at the exact cell size in device pixels and sampled NEAREST, so every
   glyph lands pixel-for-pixel like a terminal instead of a blurred mipmap. */
let atlasTex = null;
function makeAtlas(cw, ch) {
  const c = atlasTex ? atlasTex.image : document.createElement('canvas');
  c.width = cw * CHARSET.length; c.height = ch;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  const size = Math.min(ch * 0.98, cw / 0.6);
  x.font = `600 ${size}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
  [...CHARSET].forEach((k, i) => x.fillText(k, i * cw + cw / 2, ch / 2 + size * 0.04));
  if (!atlasTex) {
    atlasTex = new THREE.CanvasTexture(c);
    atlasTex.minFilter = THREE.NearestFilter; atlasTex.magFilter = THREE.NearestFilter; atlasTex.generateMipmaps = false;
  } else { atlasTex.dispose(); atlasTex.needsUpdate = true; }
  return atlasTex;
}

  function mount(container, opts = {}) {
    const P = Object.assign({}, LOOK);
    const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    if (reduceMotion) { P.flicker = 0; P.rain = 0; P.glitch = 0; P.sway = 0; }
    const canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'A 3D scan of Monil rendered entirely in ASCII glyphs; it turns to face you as you scroll');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block', opacity: '0' });
    container.appendChild(canvas);
    const state = { progress: 0, yawDeg: INTRO_FROM, section: 1, phase: 'pre' };
    const docY = () => SY;
    let ready = false, dead = false, shown = false, revealedOnce = false, pending = null;
    let running = false, raf = 0, last = 0, introT0 = 0, startY = 0, yaw = INTRO_FROM;
    let renderer, scene, camera, rt, quadScene, quadCam, pivot, sceneMat, asciiMat, ro, io, onWin, tear;
    let modelH = 1.9, modelW = 1.0;
    let dissolve = 0;
    const BAND = 6;   // rows of break-up at the dissolve front
    // d: 0 = whole figure, 1 = fully dissolved. Returns the front's position as a share of the box height (top → bottom).
    function setDissolve(d) {
      dissolve = clamp01(d);
      if (!asciiMat || !asciiMat.uniforms.uDissolve) return dissolve;
      const U = asciiMat.uniforms, rows = Math.max(1, Math.floor(U.uRes.value.y / U.uCell.value.y));
      const front = -BAND + dissolve * (rows + 2 * BAND);
      U.uDissolve.value = dissolve <= 0 ? -1e4 : front;
      return front / rows;
    }
    // Horizontal extent of the figure just below the dissolve front (container fractions) — where the thread unwinds from.
    let span = null, rowBuf = null, reading = false;
    const scanRow = (buf, rw) => {
      let a = -1, b = -1;
      for (let x = 0; x < rw; x++) if (buf[x * 4 + 2] > 127) { if (a < 0) a = x; b = x; }
      if (a >= 0) span = { x0: a / rw, x1: (b + 1) / rw };
    };
    function sampleFront() {
      if (!rt || !asciiMat || !asciiMat.uniforms.uDissolve) return;
      const U = asciiMat.uniforms, cellH = U.uCell.value.y, Hd = U.uRes.value.y, rw = rt.width, rh = rt.height;
      const yTop = (U.uDissolve.value + BAND * 0.6) * cellH;
      if (yTop < 0 || yTop >= Hd) return;
      const ry = Math.max(0, Math.min(rh - 1, Math.floor((Hd - yTop) / Hd * rh)));
      if (!rowBuf || rowBuf.length < rw * 4) rowBuf = new Uint8Array(rw * 4);
      // Performance: a synchronous readPixels stalls the CPU until the GPU has finished the
      // frame, on every frame of the dissolve. The async readback returns the same row a
      // frame or two later (the strand origin it feeds moves far slower than that).
      if (renderer.readRenderTargetPixelsAsync && renderer.capabilities.isWebGL2 !== false) {
        if (reading) return;
        reading = true;
        const buf = rowBuf;
        try {
          renderer.readRenderTargetPixelsAsync(rt, 0, ry, rw, 1, buf).then(() => { reading = false; scanRow(buf, rw); }, () => { reading = false; });
          return;
        } catch (e) { reading = false; }
      }
      renderer.readRenderTargetPixels(rt, 0, ry, rw, 1, rowBuf);
      scanRow(rowBuf, rw);
    }
    const ctrl = { state, params: P, canvas, reveal, hide, destroy, setDissolve, get ready() { return ready; },
      get frontSpan() { return dissolve > 0 && dissolve < 1 ? span : null; },
      get cellPx() { return asciiMat ? asciiMat.uniforms.uCell.value.y / asciiMat.uniforms.uDpr.value : 12; } };

    function progressNow() {
      const y = docY(), endY = y + (opts.getEndDelta ? opts.getEndDelta() : 0);
      if (endY <= startY) return y >= endY ? 1 : 0;
      return clamp01((y - startY) / (endY - startY));
    }
    const scrollTarget = p => INTRO_TO + (END_DEG - INTRO_TO) * easeInOutSine(p);

    function reveal(o = {}) {
      if (!ready) { pending = o; return; }
      const now = performance.now();
      if (!revealedOnce) {
        revealedOnce = true;
        if (o.skipIntro) { startY = opts.startY || 0; state.progress = progressNow(); yaw = scrollTarget(state.progress); state.phase = 'scroll'; }
        else if (reduceMotion) { startY = docY(); yaw = INTRO_TO; state.phase = 'scroll'; }
        else { introT0 = now; yaw = INTRO_FROM; state.phase = 'intro'; }
      }
      shown = true; canvas.style.opacity = '1';
    }
    function hide() { shown = false; canvas.style.opacity = '0'; }

    function layout() {
      if (!renderer) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = container.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
      const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      renderer.setPixelRatio(1); renderer.setSize(W, H, false);
      // glyph size follows the viewport (same as the prototype), not the container
      const cellH = Math.max(6, Math.round(window.innerHeight * dpr / P.rows)), cellW = Math.max(4, Math.round(cellH * P.aspect));
      asciiMat.uniforms.uRes.value.set(W, H);
      asciiMat.uniforms.uCell.value.set(cellW, cellH);
      asciiMat.uniforms.tAtlas.value = makeAtlas(cellW, cellH);
      asciiMat.uniforms.uDpr.value = dpr;
      rt.setSize(Math.ceil(W / 2), Math.ceil(H / 2));
      camera.aspect = w / h;
      // fill is a share of the container height; never overflow the container width
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const tanH = 2 * Math.tan(fov / 2);
      baseDist = Math.max((modelH / P.fill) / tanH, (modelW / 0.92) / (tanH * camera.aspect));
      halfTan = tanH / 2;
      placeCamera();
    }
    // At rest the feet sit on the bottom edge; zoom (1 → P.zoom) follows the smoothed yaw, so it coasts with the turn.
    let baseDist = 1, halfTan = 0.25, zoomK = 0;
    function placeCamera() {
      const dist = baseDist / (1 + (P.zoom - 1) * zoomK);
      // anchor = head top: its screen position at zoom 1 is kept, so zooming extends the figure down past the bottom edge
      const cy0 = -modelH / 2 + baseDist * halfTan - P.bottomPad * modelH;
      const headNdc = (modelH / 2 - cy0) / (baseDist * halfTan);
      const cy = modelH / 2 - headNdc * dist * halfTan;
      camera.position.set(0, cy, dist);
      camera.lookAt(0, cy, 0);
      sceneMat.uniforms.uDepthRange.value.set(dist - modelH * 0.4, dist + modelH * 0.4);
      camera.updateProjectionMatrix();
    }

    function frame(now) {
      raf = 0; if (!running || dead) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - (last || now)) / 1000, 0.1); last = now;
      const t = now / 1000;
      if (state.phase === 'intro') {
        const k = Math.min(1, (now - introT0) / INTRO_MS);
        yaw = INTRO_FROM + (INTRO_TO - INTRO_FROM) * easeOutCubic(k);
        if (k >= 1) { yaw = INTRO_TO; startY = docY(); state.phase = 'scroll'; }
      } else if (state.phase === 'scroll') {
        const p = (state.progress = progressNow());
        yaw += (scrollTarget(p) - yaw) * (1 - Math.exp(-dt / Math.max(P.turnEase, 0.001)));
      }
      const zk = clamp01((INTRO_TO - yaw) / (INTRO_TO - END_DEG));
      if (Math.abs(zk - zoomK) > 1e-4) { zoomK = zk; placeCamera(); }
      const sway = P.sway * Math.sin(t * 0.6);
      pivot.rotation.y = THREE.MathUtils.degToRad(yaw + sway);
      state.yawDeg = yaw; state.section = state.progress >= 1 ? 2 : 1;

      const U = asciiMat.uniforms;
      if (P.glitch > 0 && now > tear.next) {
        const rows = Math.floor(U.uRes.value.y / U.uCell.value.y);
        const hh = 1 + Math.floor(Math.random() * 4 * P.glitch);
        const y0 = Math.floor(rows * (0.12 + Math.random() * 0.76));
        U.uTear.value.set(y0, y0 + hh, (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 4 * P.glitch)), 1.5 * P.glitch);
        tear.until = now + 70 + Math.random() * 130;
        tear.next = now + (1400 + Math.random() * 2800) / Math.max(P.glitch, 0.05);
      }
      if (now > tear.until) U.uTear.value.set(-1, -1, 0, 0);
      sceneMat.uniforms.uTime.value = t; U.uTime.value = t;
      if (!shown) return;   // loop runs, nothing drawn until the load animation has finished
      renderer.setRenderTarget(rt); renderer.render(scene, camera);
      if (dissolve > 0 && dissolve < 1) sampleFront(); else span = null;
      renderer.setRenderTarget(null); renderer.render(quadScene, quadCam);
    }
    function setRunning(on) {
      if (on === running || dead) return;
      running = on;
      if (on) { last = 0; if (!raf) raf = requestAnimationFrame(frame); }
      else if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    function destroy() {
      dead = true; setRunning(false);
      if (ro) ro.disconnect(); if (io) io.disconnect(); if (onWin) window.removeEventListener('resize', onWin);
      if (renderer) renderer.dispose();
      canvas.remove();
    }

    (async () => {
      // Performance: the model and photo download in parallel with three.js instead of
      // waiting for it to finish first (same files, same result, one round trip sooner).
      const glbP = fetch(opts.glbUrl || 'assets/figure/figure.glb').then(r => r.arrayBuffer());
      const img = new Image();
      const imgP = new Promise((res, rej) => { img.onload = res; img.onerror = rej; });   // onload, not decode(): decode() can stall in hidden/throttled frames
      img.src = opts.photoUrl || 'assets/figure/photo.jpg';
      glbP.catch(() => {}); imgP.catch(() => {});   // awaited below; avoid unhandled-rejection noise if three.js fails first
      await loadThree(); if (dead) return;
    sceneMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uDepthRange: { value: new THREE.Vector2(1, 3) }, uProj: { value: new THREE.Vector4() }, tPhoto: { value: null }, uPhoto: { value: 1 }, uNeckY: { value: 0.47 }, uHeadContrast: { value: 1 }, uBodyDim: { value: 1 } },
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV; varying float vY; varying vec2 vPhotoUv; varying float vFront;
        uniform vec4 uProj;   // photo uv = (x * sx + ox, y * sy + oy) in model space
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vN = normalize(normalMatrix * normal); vV = -mv.xyz; vY = position.y;
          vPhotoUv = vec2(position.x * uProj.x + uProj.z, position.y * uProj.y + uProj.w);
          vFront = normal.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vN; varying vec3 vV; varying float vY; varying vec2 vPhotoUv; varying float vFront;
        uniform float uTime; uniform vec2 uDepthRange; uniform sampler2D tPhoto; uniform float uPhoto, uNeckY, uHeadContrast, uBodyDim;
        void main(){
          vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
          vec3 V = normalize(vV);
          float key  = max(dot(N, normalize(vec3(-0.62, 0.45, 0.64))), 0.0);   // side-high key: models nose, cheeks, brow
          float fill = max(dot(N, normalize(vec3( 0.80, 0.05, 0.45))), 0.0) * 0.18;
          float top  = max(N.y, 0.0) * 0.10;
          float rim  = pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.30;
          float lum  = clamp(0.04 + pow(key, 1.4) * 0.78 + fill + top + rim, 0.0, 1.0);
          // tone from the photo, projected from the front only: dark hair, beard and
          // glasses frames, light skin, white trousers. Sides and back fall back to 0.8.
          float ph = texture2D(tPhoto, vPhotoUv).r;
          float tone = mix(0.32, 1.0, pow(ph, 0.65));
          float w = smoothstep(-0.05, 0.45, vFront) * uPhoto;
          // soft roll-off instead of a hard clip, so bright skin keeps its detail
          lum = (1.0 - exp(-2.4 * lum * mix(0.85, tone, w))) / (1.0 - exp(-2.4));
          // the head gets extra contrast and the body steps back, so the eye goes to the face
          float head = smoothstep(uNeckY - 0.04, uNeckY + 0.04, vY);
          lum = mix(lum * uBodyDim, clamp((lum - 0.55) * uHeadContrast + 0.5, 0.0, 1.0), head);
          float hue  = fract(N.x * 0.32 + N.y * 0.22 + vY * 0.45 + 0.15);
          float dep = clamp((length(vV) - uDepthRange.x) / (uDepthRange.y - uDepthRange.x), 0.0, 1.0);
          gl_FragColor = vec4(lum, hue, 1.0, dep);
        }`,
      side: THREE.DoubleSide,
    });
    
    /* =========================================================================
       Pass 2 — the ASCII screen. One cell per glyph; each colour channel picks
       its own glyph from a slightly offset sample, which is the RGB split.
       ========================================================================= */
    asciiMat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tAtlas: { value: null },
        uRes: { value: new THREE.Vector2() }, uCell: { value: new THREE.Vector2() },
        uTime: { value: 0 }, uDpr: { value: 1 },
        uRampN: { value: RAMP.length }, uDigit0: { value: RAMP.length }, uEdge0: { value: RAMP.length + DIGITS.length }, uCount: { value: CHARSET.length },
        uEdge: { value: P.edges }, uAO: { value: P.cavity }, uDetail: { value: P.detail },
        uGamma: { value: P.gamma }, uIrid: { value: P.iridescence }, uSplit: { value: P.split },
        uFringe: { value: P.fringe }, uFlicker: { value: P.flicker }, uRain: { value: P.rain },
        uScan: { value: P.scanlines }, uBgDots: { value: P.bgDots },
        uTear: { value: new THREE.Vector4(-1, -1, 0, 0) },   // rowFrom, rowTo, shiftCells, extraSplit
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tScene, tAtlas;
        uniform vec2 uRes, uCell; uniform float uTime, uDpr;
        uniform float uRampN, uDigit0, uEdge0, uEdge, uAO, uDetail, uCount, uGamma, uIrid, uSplit, uFringe, uFlicker, uRain, uScan, uBgDots;
        uniform vec4 uTear;
        uniform float uDissolve, uBand;
    
        float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float glyph(float idx, vec2 luv){
          luv = clamp(luv, 0.0, 1.0);
          return texture2D(tAtlas, vec2((idx + luv.x) / uCount, luv.y)).r;
        }
        float rampIdx(float lum, float cov){
          if (cov < 0.5) return 0.0;
          float i = floor(clamp(pow(lum, uGamma), 0.0, 0.999) * uRampN);
          return max(i, 1.0);
        }
    
        void main(){
          vec2 frag = gl_FragCoord.xy;
          vec2 cell = floor(frag / uCell);
          vec2 luv  = fract(frag / uCell);
          float rows = floor(uRes.y / uCell.y);
          float rowFromTop = rows - 1.0 - cell.y;
    
          // glitch tear: a band of rows slides sideways by whole cells
          float inTear = step(uTear.x, rowFromTop) * step(rowFromTop, uTear.y);
          vec2 scell = cell + vec2(uTear.z * inTear, 0.0);
          float split = uSplit + uTear.w * inTear;
    
          vec2 px = uCell / uRes;
          vec2 c  = (scell + 0.5) * px;
          vec4 sG = texture2D(tScene, c);
          vec4 sR = texture2D(tScene, c + vec2( split * px.x, 0.0));
          vec4 sB = texture2D(tScene, c - vec2( split * px.x, 0.0));
    
          // average four sub-samples per cell instead of one point, then sharpen against the
          // neighbouring cells: at ~14 rows for a face, local contrast is what shows the
          // glasses, eye line, nose shadow and beard
          vec2 q4 = px * 0.25;
          float avgL = 0.25 * (texture2D(tScene, c + vec2(-q4.x, -q4.y)).r + texture2D(tScene, c + vec2(q4.x, -q4.y)).r
                             + texture2D(tScene, c + vec2(-q4.x,  q4.y)).r + texture2D(tScene, c + vec2(q4.x,  q4.y)).r);
          vec4 kL = texture2D(tScene, c - vec2(px.x, 0.0)), kR = texture2D(tScene, c + vec2(px.x, 0.0));
          vec4 kD = texture2D(tScene, c - vec2(0.0, px.y)), kU = texture2D(tScene, c + vec2(0.0, px.y));
          float nb = (kL.r * kL.b + kR.r * kR.b + kD.r * kD.b + kU.r * kU.b) / max(kL.b + kR.b + kD.b + kU.b, 1.0);
          float sharp = clamp(avgL + uDetail * (avgL - nb), 0.0, 1.0);
          float dl = sharp - sG.r;
          sG.r = clamp(sG.r + dl, 0.0, 1.0); sR.r = clamp(sR.r + dl, 0.0, 1.0); sB.r = clamp(sB.r + dl, 0.0, 1.0);
    
          // cavity shading: cells sitting behind their neighbours (eye sockets, under the
          // chin, between arm and torso) go darker, which is what makes a face read in glyphs
          float occ = 0.0;
          for (int k = 0; k < 8; k++) {
            float an = float(k) * 0.785398 + 0.39;
            for (int r = 1; r <= 2; r++) {
              vec2 o = vec2(cos(an), sin(an)) * px * float(r);
              vec4 sn = texture2D(tScene, c + o);
              float dz = (sG.a - sn.a) * sn.b;                 // neighbour closer to camera
              occ += clamp(dz * 40.0, 0.0, 1.0) * (1.0 - smoothstep(0.02, 0.05, dz));
            }
          }
          float ao = 1.0 - clamp(occ / 16.0 * uAO, 0.0, 0.8);
          sG.r *= ao; sR.r *= ao; sB.r *= ao;
          float iG = rampIdx(sG.r, sG.b), iR = rampIdx(sR.r, sR.b), iB = rampIdx(sB.r, sB.b);
          float cov = max(sG.b, max(sR.b, sB.b));
    
          // outlines: depth + light gradient across neighbouring cells picks one of four contour glyphs
          vec4 nL = texture2D(tScene, c - vec2(px.x, 0.0)), nR = texture2D(tScene, c + vec2(px.x, 0.0));
          vec4 nD = texture2D(tScene, c - vec2(0.0, px.y)), nU = texture2D(tScene, c + vec2(0.0, px.y));
          float fL = mix(1.0, nL.a, nL.b) * 6.0 + nL.r * 0.25, fR = mix(1.0, nR.a, nR.b) * 6.0 + nR.r * 0.25;
          float fD = mix(1.0, nD.a, nD.b) * 6.0 + nD.r * 0.25, fU = mix(1.0, nU.a, nU.b) * 6.0 + nU.r * 0.25;
          vec2 grad = vec2(fR - fL, fU - fD);
          float isEdge = step(0.5, sG.b) * step(1.0 - uEdge, length(grad) * 0.5) * step(0.001, uEdge);
          float ang = atan(grad.y, grad.x);                 // direction of change
          float a = mod(ang + 3.14159 / 8.0, 3.14159);      // fold to [0, pi)
          float sector = floor(a / (3.14159 / 4.0));        // 0 vertical, 1 falling, 2 horizontal, 3 rising
          float edgeIdx = uEdge0 + (sector < 0.5 ? 0.0 : sector < 1.5 ? 3.0 : sector < 2.5 ? 2.0 : 1.0);
          iG = mix(iG, edgeIdx, isEdge); iR = mix(iR, edgeIdx, isEdge * step(0.5, sR.b)); iB = mix(iB, edgeIdx, isEdge * step(0.5, sB.b));
    
          // flicker: a few cells swap to a digit for a beat
          float h1 = hash(scell + 0.17);
          float tick = floor(uTime * (2.0 + 6.0 * h1));
          float fl = hash(scell + tick * 1.731);
          float digitIdx = uDigit0 + floor(hash(scell * 1.3 + tick) * 10.0);
          float isFlick = step(fl, uFlicker) * step(0.5, sG.b);
    
          // data rain: some columns carry a falling stream of digits
          float hc = hash(vec2(scell.x, 7.13));
          float speed = mix(7.0, 20.0, hash(vec2(scell.x, 3.31)));
          float span = rows + 40.0;
          float head = mod(uTime * speed + hc * 997.0, span) - 20.0;   // rows from top
          float d = head - rowFromTop;                                   // trail sits above the head
          float trail = mix(6.0, 16.0, hash(vec2(scell.x, 9.7)));
          float rainK = step(hc, uRain) * step(0.0, d) * (1.0 - smoothstep(0.0, trail, d)) * step(0.5, sG.b);
          float rainDigit = uDigit0 + floor(hash(scell + floor(uTime * 14.0)) * 10.0);
    
          float swapK = max(isFlick, step(0.15, rainK));
          float useDigit = swapK;
          float gIdx = mix(iG, mix(digitIdx, rainDigit, step(0.15, rainK)), useDigit);
          float rIdx = mix(iR, gIdx, useDigit * step(0.5, sR.b));
          float bIdx = mix(iB, gIdx, useDigit * step(0.5, sB.b));
    
          // per-glyph chromatic fringe (sub-cell, in px)
          vec2 fr = vec2(uFringe * uDpr / uCell.x, 0.0);
          float gR = glyph(rIdx, luv - fr) * step(0.5, sR.b);
          float gGc = glyph(gIdx, luv) * step(0.5, sG.b);
          float gB = glyph(bIdx, luv + fr) * step(0.5, sB.b);
    
          // colour: white ↔ rainbow, keyed to surface orientation, drifting slowly
          vec3 irid = 0.5 + 0.5 * cos(6.28318 * (sG.g + uTime * 0.025 + vec3(0.0, 0.33, 0.67)));
          irid /= max(max(irid.r, irid.g), irid.b);           // keep it bright, ref 1 is neon not pastel
          vec3 tint = mix(vec3(1.0), irid, uIrid);
          float bright = mix(0.75, 1.35, sG.r) + isEdge * 0.35 + rainK * 0.9 + isFlick * 0.25;
          vec3 col = vec3(gR, gGc, gB) * tint * bright;
          col += vec3(0.75, 1.0, 0.92) * rainK * gGc * step(d, 1.0) * 0.8;   // stream head
    
          // faint dot field behind the figure
          if (cov < 0.5) {
            float hb = hash(cell * 1.37 + 3.1);
            float on = step(hb, uBgDots);
            float tw = 0.07 + 0.06 * sin(uTime * (0.6 + hb * 2.0) + hb * 60.0);
            col = vec3(glyph(1.0, luv)) * on * tw * vec3(0.8, 0.9, 1.0);
          }
    
          // dissolve (section 1 → 2): rows above the front are gone; cells at the front break up at random and flare
          float frontD = rowFromTop - uDissolve;
          float keep = step(0.0, frontD + hash(cell * 0.71 + 5.3) * uBand);
          float flare = (1.0 - smoothstep(0.0, uBand, abs(frontD))) * keep;
          col *= keep * (1.0 + 0.9 * flare);

          // scanlines + gentle vignette
          col *= 1.0 - uScan * step(0.5, fract(frag.y / (2.0 * uDpr)));
          vec2 q = frag / uRes - 0.5;
          col *= 1.0 - 0.35 * dot(q, q);
          gl_FragColor = vec4(col, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));   // transparent clear: section bg is not black
        }`,
      depthTest: false, depthWrite: false,
    });
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
      renderer.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
      rt = new THREE.WebGLRenderTarget(2, 2, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      quadScene = new THREE.Scene();
      quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), asciiMat));
      pivot = new THREE.Group(); scene.add(pivot);
      tear = { until: 0, next: performance.now() + 1500 };
    function syncUniforms() {
      const U = asciiMat.uniforms;
      U.uGamma.value = P.gamma; U.uIrid.value = P.iridescence; U.uSplit.value = P.split; U.uFringe.value = P.fringe;
      U.uFlicker.value = P.flicker; U.uRain.value = P.rain; U.uScan.value = P.scanlines; U.uBgDots.value = P.bgDots; U.uEdge.value = P.edges; U.uAO.value = P.cavity; U.uDetail.value = P.detail; sceneMat.uniforms.uPhoto.value = P.photo; sceneMat.uniforms.uHeadContrast.value = P.headContrast; sceneMat.uniforms.uBodyDim.value = P.bodyDim;
    }
      const geo = parseGLB(await glbP); if (dead) return;
      const bb = geo.boundingBox, c = new THREE.Vector3(); bb.getCenter(c);
      geo.translate(-c.x, -c.y, -c.z);
      modelH = bb.max.y - bb.min.y; modelW = bb.max.x - bb.min.x;
      pivot.add(new THREE.Mesh(geo, sceneMat));
      {
        const S = 616, CX = 1010, TOP = 160, X0 = 600, Y0 = 100, CW = 850, CH = 1233, ymax = bb.max.y;
        const sx = S / CW, ox = (CX + c.x * S - X0) / CW;
        const sy = S / CH, oy = 1 - (TOP + (ymax - c.y) * S - Y0) / CH;
        sceneMat.uniforms.uProj.value.set(sx, sy, ox, oy);
        await imgP;
        const pt = new THREE.Texture(img); pt.needsUpdate = true; pt.colorSpace = THREE.NoColorSpace;
        sceneMat.uniforms.tPhoto.value = pt;
      }
      asciiMat.uniforms.tScene.value = rt.texture;
      asciiMat.uniforms.uDissolve = { value: -1e4 }; asciiMat.uniforms.uBand = { value: BAND };
      await loadFont(); if (dead) return;
      syncUniforms(); layout();
      ro = new ResizeObserver(() => layout()); ro.observe(container);
      onWin = () => layout(); window.addEventListener('resize', onWin);
      io = new IntersectionObserver(([e]) => setRunning(e.isIntersecting), { threshold: 0 }); io.observe(container);
      ready = true;
      window.FIGURE = { params: P, state, charset: CHARSET, ramp: RAMP, uniforms: asciiMat.uniforms, relayout: layout, sync: syncUniforms, setDissolve, controller: ctrl };
      setDissolve(dissolve);
      if (pending) { const o = pending; pending = null; reveal(o); }
    })().catch(err => console.error('[GlyphFigure]', err));
    return ctrl;
  }
  window.GlyphFigure = { mount, LOOK, INTRO_FROM, INTRO_TO };
})();
