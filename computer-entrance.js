/* Computer entrance — a 3D vintage computer in front of the landing page.
   The computer sits still, turned 30°, showing analogue static with a "Click to enter"
   button on its glass. On enter the camera arcs round to face the screen and dollies in
   until the picture covers the viewport; the static calms into the page's own colour and
   the real page (DOM underneath) tunes in through a crossfade. */
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/+esm';
const GLTF_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js/+esm';
const ROOM_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/environments/RoomEnvironment.js/+esm';
const MODEL_URL = new URL('assets/computer.glb', document.baseURI).href;
const GRID_URL = new URL('screen-grid.json', document.baseURI).href;
const KEY = 'computer-entered';

const CFG = {
  fov: 30,
  framing: 0.46,            // model height as a share of the viewport height at rest
  maxWidth: 0.6,            // never wider than this share of the viewport (phones)
  yawDeg: 45,               // starting three-quarter turn; it swings to face the viewer on load
  turnMs: 1600,             // duration of that swing
  turnDelay: 250,
  turnEase: [0.6, 0, 0.3, 1], // speeds up, then settles
  enterMs: 1700,            // camera arc + dolly into the screen
  revealMs: 520,            // crossfade from the screen to the live page
  ease: [0.45, 0, 0.15, 1],
  glitchEvery: [1800, 5200],
  glitchMs: [120, 320],
  powerOnMs: 900,
  inset: [0.935, 0.915],    // share of the glass the picture fills
  button: 0.5,              // on-screen button width as a share of the picture width
  loadTimeoutMs: 2500,
  age: 0.85,                // 0 = factory-new plastic, 1 = decades of sun and hands
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const html = document.documentElement;

/* ---------- preload as soon as the page loads ---------- */
let libP = null, bufP = null, gridP = null;
const preload = () => {
  libP = libP || Promise.all([import(THREE_URL), import(GLTF_URL), import(ROOM_URL)]);
  bufP = bufP || fetch(MODEL_URL).then(r => { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); });
  gridP = gridP || fetch(GRID_URL).then(r => r.json());
  [libP, bufP, gridP].forEach(p => p.catch(() => {}));
};

/* ---------- styles + DOM ---------- */
const BW = 220, BH = 88;   // on-screen button, design px (mapped onto the glass with a homography)
const css = `
#ce-entrance{position:fixed;inset:0;z-index:2147483001;background:radial-gradient(120% 90% at 50% 45%,#1c1d21 0%,#141518 60%);color:#ececec;overflow:hidden}
#ce-entrance[hidden]{display:none!important}
#ce-entrance.revealing{opacity:0;transition:opacity ${CFG.revealMs}ms cubic-bezier(.3,0,.2,1);pointer-events:none}
#ce-entrance canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:manipulation}
#ce-entrance.hot canvas{cursor:pointer}
#ce-entrance .ce-ui{position:absolute;inset:0;pointer-events:none;padding:22px 26px;display:grid;grid-template-rows:auto 1fr auto;font-family:'Redaction',Georgia,serif;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:#9a9a9a;transition:opacity .3s}
#ce-entrance .ce-row{display:flex;justify-content:space-between;align-items:end;gap:16px}
#ce-entrance .ce-row b{color:#ececec;font-weight:400}
#ce-entrance.zooming .ce-ui{opacity:0}
#ce-skip{white-space:nowrap;pointer-events:auto;font:inherit;letter-spacing:inherit;text-transform:inherit;color:#9a9a9a;background:none;border:0;padding:10px 0;cursor:pointer}
#ce-skip:hover,#ce-skip:focus-visible{color:#ececec;outline:none;text-decoration:underline}
#ce-enter{position:absolute;left:0;top:0;width:${BW}px;height:${BH}px;padding:0;margin:0;border:0;background:none;cursor:pointer;transform-origin:0 0;will-change:transform,opacity;opacity:0;outline:none;-webkit-tap-highlight-color:transparent}
#ce-enter svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
#ce-enter svg rect{opacity:0;transition:opacity .14s steps(3)}
#ce-enter:hover svg rect,#ce-enter:focus-visible svg rect,#ce-entrance.hot #ce-enter svg rect{opacity:1}
#ce-enter .ce-face{position:absolute;inset:7px 8px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:2px solid #d4d4d4;background:#1f1f1f;color:#fff;font-family:'Redaction 10','Redaction',Georgia,serif;font-size:36px;line-height:1;letter-spacing:0;text-transform:uppercase;white-space:nowrap;transition:background .14s steps(3),color .14s steps(3),border-color .14s steps(3)}
#ce-enter:hover .ce-face,#ce-enter:focus-visible .ce-face,#ce-entrance.hot #ce-enter .ce-face{background:#fff;border-color:#fff;color:#111}
#ce-enter>*{visibility:hidden}
#ce-entrance::after{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(110% 85% at 48% 42%,transparent 55%,rgba(0,0,0,.42) 100%)}`;
let entrance, ui, enterBtn, skipBtn;
function buildDOM() {
  if (entrance) return;
  const st = document.createElement('style'); st.id = 'ce-style'; st.textContent = css; document.head.appendChild(st);
  entrance = document.createElement('div');
  entrance.id = 'ce-entrance';
  entrance.setAttribute('role', 'dialog');
  entrance.setAttribute('aria-label', 'Vintage computer. Enter the portfolio through its screen.');
  entrance.innerHTML = `<div class="ce-ui"></div>`
    + `<button id="ce-enter" type="button" aria-label="Click to enter" disabled><svg viewBox="0 0 ${BW} ${BH}" preserveAspectRatio="none" aria-hidden="true"><rect x="1" y="1" width="${BW - 2}" height="${BH - 2}" fill="none" stroke="#df5227" stroke-width="2" pathLength="100" stroke-dasharray="24.3 2 17.5 1.1 32.5 2.8 15.5 2.1 2.2 0"></rect></svg><span class="ce-face">Click</span></button>`;
  document.body.appendChild(entrance);
  ui = entrance.querySelector('.ce-ui'); enterBtn = entrance.querySelector('#ce-enter');
  enterBtn.addEventListener('click', () => enter());
  enterBtn.addEventListener('pointerenter', () => { btnHot = true; });
  enterBtn.addEventListener('pointerleave', () => { btnHot = false; });
  enterBtn.addEventListener('focus', () => { if (enterBtn.matches(':focus-visible')) btnHot = true; });
  enterBtn.addEventListener('blur', () => { btnHot = false; });
}

/* ---------- the real landing page ---------- */
const findSite = () => document.querySelector('[data-screen-label="Page"]');
function waitSite() {
  return new Promise(res => {
    const s = findSite(); if (s) return res(s);
    const mo = new MutationObserver(() => { const s = findSite(); if (s) { mo.disconnect(); res(s); } });
    mo.observe(document.body, { childList: true, subtree: true });
  });
}
let inertMO = null;
function lockPage() {
  html.classList.add('ce-on');
  const s = findSite(); if (s) s.inert = true;
  // the DC runtime may re-mount the page node; keep whatever node is live inert
  if (!inertMO) { inertMO = new MutationObserver(() => { if (html.classList.contains('ce-on')) { const n = findSite(); if (n && !n.inert) n.inert = true; } }); inertMO.observe(document.body, { childList: true, subtree: true }); }
}
function releasePage() {
  html.classList.remove('ce-on');
  if (inertMO) { inertMO.disconnect(); inertMO = null; }
  document.querySelectorAll('[data-screen-label="Page"]').forEach(n => { n.inert = false; });
  window.__computerHold = false;
  dispatchEvent(new CustomEvent('computer:release'));
}
function focusMain() {
  const site = findSite(); const m = (site && site.querySelector('main')) || site; if (!m) return;
  if (!m.hasAttribute('tabindex')) m.setAttribute('tabindex', '-1');
  try { m.focus({ preventScroll: true }); } catch (e) {}
}
const toTop = () => { try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); } };

/* ---------- state ---------- */
let state = 'off';   // off → loading → idle → zooming → revealing → done
let S = null, SCREEN = null;
let hot = false, btnHot = false, hover = 0, powerT0 = 0, last = 0, zoom = null, raf = 0, revealT = 0;
const pointer = { down: null };
const glitch = { until: 0, next: 0 };

function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } return Y(Math.min(1, Math.max(0, t))); };
}
const easeEnter = bezier(CFG.ease), easeTurn = bezier(CFG.turnEase);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp01 = x => Math.min(1, Math.max(0, x));

/* ---------- screen shader ---------- */
const FRAG = /* glsl */`
uniform float uTime, uPower, uHover, uFlash, uCrt, uGlitch, uSeed, uAspect, uTune, uBtn; uniform vec2 uInset, uBtnHalf;
uniform sampler2D uBtnA, uBtnB;
float h12(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float h11(float x){ return fract(sin(x * 127.1) * 43758.5453); }
float grain(vec2 uv, float fr){ vec2 g = floor(uv * vec2(200.0 * uAspect, 200.0)); return h12(g + vec2(fr * 7.13, fr * 3.71)); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), f.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), f.x), f.y); }
varying vec2 vUv;
float sdRB(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec2 c0 = vUv - 0.5;
  float dOuter = sdRB(c0 * vec2(uAspect, 1.0), vec2(0.5 * uAspect, 0.5), 0.085);
  float mask = 1.0 - smoothstep(-0.004, 0.004, dOuter);
  vec2 c = c0 / uInset;
  c *= 1.0 + uCrt * 0.06 * dot(c, c);
  vec2 uv = c + 0.5;
  float ca = uAspect * uInset.x / uInset.y;
  float dIn = sdRB(c * vec2(ca, 1.0), vec2(0.5 * ca, 0.5), 0.05 * (0.3 + 0.7 * uCrt));
  float inside = 1.0 - smoothstep(-0.003, 0.003, dIn);
  float lineW = smoothstep(0.0, 0.4, uPower), open = smoothstep(0.35, 1.0, uPower);
  float vis = inside * step(abs(c.x), 0.5 * lineW + 0.003) * step(abs(c.y), mix(0.003, 0.5, open));
  float fr = floor(uTime * 30.0);
  float band = floor(uv.y * 14.0 + uSeed * 7.0);
  float tear = (h11(band + uSeed * 31.0) - 0.5) * 0.18 * uGlitch * step(0.55, h11(band * 3.1 + uSeed));
  vec2 su = vec2(uv.x + tear, fract(uv.y + uGlitch * 0.08 * sin(uSeed * 9.0)));
  float split = 0.004 + uGlitch * 0.02;
  float nR = grain(su + vec2(split, 0.0), fr), nG = grain(su, fr), nB = grain(su - vec2(split, 0.0), fr);
  vec3 col = vec3(nR, nG, nB);
  col = mix(vec3(nG), col, 0.06 + 0.94 * uGlitch);
  float roll = smoothstep(0.0, 0.12, abs(fract(uv.y * 0.6 - uTime * 0.18) - 0.5));
  col *= mix(0.55, 1.0, roll);
  col *= 0.42 + 0.25 * uHover + 0.5 * uGlitch * step(0.7, h11(band + fr));
  col *= mix(1.0, 0.08, uGlitch * step(h11(band * 5.7 + uSeed), 0.18));
  col += uGlitch * 0.35 * smoothstep(0.012, 0.0, abs(fract(uv.y + uSeed * 0.37) - 0.5));
  col *= vec3(0.92, 0.97, 1.0);
  vec2 bu = (su - 0.5) / (2.0 * uBtnHalf) + 0.5;
  float inB = step(0.0, bu.x) * step(bu.x, 1.0) * step(0.0, bu.y) * step(bu.y, 1.0);
  vec2 bc = clamp(bu, 0.0, 1.0);
  vec4 bS = mix(texture2D(uBtnA, bc), texture2D(uBtnB, bc), uHover);
  vec4 bR = mix(texture2D(uBtnA, bc + vec2(split * 1.6, 0.0)), texture2D(uBtnB, bc + vec2(split * 1.6, 0.0)), uHover);
  vec4 bG = mix(texture2D(uBtnA, bc, 4.0), texture2D(uBtnB, bc, 4.0), uHover);
  vec3 bCol = vec3(bR.r, bS.g, bS.b) * vec3(1.0, 0.98, 0.94);
  col = mix(col * (1.0 - 0.55 * uBtn * bG.a), bCol * 1.08, bS.a * uBtn * inB);
  col += bG.rgb * bG.a * 0.32 * uBtn * (0.9 + 0.1 * sin(uTime * 120.0));
  float scan = 0.5 + 0.5 * sin(uv.y * 260.0 * 6.28318);
  col *= 1.0 - 0.22 * scan;
  col *= 1.0 - uCrt * 0.45 * smoothstep(0.5, 1.45, length(c * 2.0));
  col *= 1.0 + (1.0 - open) * 2.0 + uCrt * 0.015 * sin(uTime * 55.0);
  // tune-in: the static calms into the landing page's own background (#262626 → #1d1d1d → #151515)
  float t = length(vec2(c.x, c.y - 0.1)) / 0.72;
  vec3 pageCol = vec3(t < 0.55 ? mix(0.149, 0.114, t / 0.55) : mix(0.114, 0.082, clamp((t - 0.55) / 0.45, 0.0, 1.0)));
  pageCol *= 1.0 - 0.05 * scan * (1.0 - uTune * 0.6);
  pageCol += (nG - 0.5) * (0.035 * (1.0 - uTune) + 0.006);
  col = mix(col, pageCol, uTune);
  col += vec3(1.0, 0.96, 0.88) * uFlash;
  col = col * (0.97 + 0.03 * sin(uTime * 7.0 + uv.y * 3.0)) + vec3(0.018, 0.022, 0.02) * uCrt;
  col *= mix(1.0, 0.55 + 0.45 * smoothstep(0.0, -0.06, dIn), uCrt);
  vec3 glass = vec3(0.03, 0.034, 0.032) + 0.05 * smoothstep(0.7, 0.0, length(c0 - vec2(-0.3, 0.35))) * uCrt;
  vec3 outc = mix(glass, col, vis);
  vec2 rp = c0 * vec2(uAspect, 1.0);
  float smudge = vn(rp * 4.0 + 3.1) * (0.4 + 0.6 * vn(rp * 13.0 + 7.7));
  float win = 1.0 - smoothstep(0.0, 0.07, sdRB(rp - vec2(-0.2 * uAspect, 0.24), vec2(0.15, 0.1), 0.025));
  win *= 0.55 + 0.45 * step(0.012, abs(rp.x + 0.2 * uAspect));
  float sheen = smoothstep(0.85, 0.0, length(c0 - vec2(-0.38, 0.5)));
  float dust = step(0.9965, h12(floor(vUv * vec2(380.0 * uAspect, 380.0)) + 11.0));
  vec3 refl = vec3(0.88, 0.9, 0.93) * (win * (0.035 + 0.06 * smudge) + sheen * (0.025 + 0.05 * smudge) + smudge * 0.012 + dust * 0.09);
  outc += refl * uCrt;
  gl_FragColor = vec4(outc, mask);
}`;

/* ---------- scene ---------- */
async function createSession() {
  const [[THREE, { GLTFLoader }, { RoomEnvironment }], buf, grid] = await Promise.all([libP, bufP, gridP]);
  SCREEN = grid;
  const canvas = document.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.fov, 1, 0.005, 50);
  const rig = new THREE.Group(); scene.add(rig);
  const s = { THREE, canvas, renderer, scene, camera, rig, modelBox: new THREE.Box3(), worldBox: new THREE.Box3(), restCam: new THREE.Vector3(), restTarget: new THREE.Vector3(), lookTarget: new THREE.Vector3(), ray: new THREE.Raycaster(), ndc: new THREE.Vector2(), projV: new THREE.Vector3() };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.98;
  const pm = new THREE.PMREMGenerator(renderer);
  s.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.environment = s.envTex; scene.environmentIntensity = 0.32;
  const key = new THREE.DirectionalLight(0xffdcb0, 2.5); key.position.set(-2.6, 2.6, 2.4); scene.add(key);
  const fill = new THREE.DirectionalLight(0x9fb3c8, 0.32); fill.position.set(3, 0.6, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xc8d6ff, 0.7); rim.position.set(2.5, 1.8, -2.5); scene.add(rim);
  const spill = new THREE.PointLight(0xdfe8ff, 0.3, 2.2, 2); spill.position.set(0, 0.2, 0.55); rig.add(spill);
  s.spill = spill;

  const gltf = await new Promise((res, rej) => new GLTFLoader().parse(buf.slice(0), '', res, rej));
  rig.add(gltf.scene); gltf.scene.updateMatrixWorld(true);
  s.modelBox.setFromObject(gltf.scene);   // model space (rig unrotated)
  const mSize = s.modelBox.getSize(new THREE.Vector3());
  gltf.scene.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => ageMaterial(m, s.modelBox.min.clone(), mSize)); });

  const { X0, X1, Y0, Y1, NX, NY, z } = SCREEN;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    pos.push(X0 + (X1 - X0) * i / NX, Y1 - (Y1 - Y0) * j / NY, z[j * (NX + 1) + i] + 0.006);
    uv.push(i / NX, 1 - j / NY);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  s.screenMat = new THREE.ShaderMaterial({
    transparent: true, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uHover: { value: 0 }, uFlash: { value: 0 }, uCrt: { value: 1 }, uTune: { value: 0 },
      uGlitch: { value: 0 }, uSeed: { value: 0 }, uBtn: { value: 0 }, uBtnHalf: { value: new THREE.Vector2(0.25, 0.1) }, uBtnA: { value: null }, uBtnB: { value: null }, uAspect: { value: (X1 - X0) / (Y1 - Y0) }, uInset: { value: new THREE.Vector2(CFG.inset[0], CFG.inset[1]) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: FRAG,
  });
  rig.add(new THREE.Mesh(geo, s.screenMat));
  const picW = (X1 - X0) * CFG.inset[0], picH = (Y1 - Y0) * CFG.inset[1];
  const bhw = CFG.button / 2, bhh = bhw * (BH / BW) * (picW / picH);
  s.screenMat.uniforms.uBtnHalf.value.set(bhw * (BW + 2 * BM) / BW, bhh * (BH + 2 * BM) / BH);
  s.btnTex = [makeBtnTex(THREE, false), makeBtnTex(THREE, true)];
  s.screenMat.uniforms.uBtnA.value = s.btnTex[0].tex; s.screenMat.uniforms.uBtnB.value = s.btnTex[1].tex;
  (document.fonts && document.fonts.load ? document.fonts.load('36px "Redaction 10"').catch(() => {}) : Promise.resolve()).then(() => s.btnTex.forEach(b => b.draw()));

  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(.55, 'rgba(0,0,0,.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
  s.shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  s.shadow.rotation.x = -Math.PI / 2; s.shadow.position.y = s.modelBox.min.y + 0.002; rig.add(s.shadow);

  // frame for the final, straight-on pose; start turned and swing round on load
  rig.rotation.set(0, 0, 0); rig.updateMatrixWorld(true);
  s.worldBox.setFromObject(gltf.scene);
  setYaw(s, reduceMotion ? 0 : CFG.yawDeg);

  bindCanvas(s);
  return s;
}

/* "Click" button drawn as phosphor on the glass; BM = glow margin in design px */
const BM = 22, BS = 3;
function makeBtnTex(THREE, hotState) {
  const c = document.createElement('canvas'); c.width = (BW + 2 * BM) * BS; c.height = (BH + 2 * BM) * BS;
  const x = c.getContext('2d'); const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const draw = () => {
    x.setTransform(BS, 0, 0, BS, BM * BS, BM * BS); x.clearRect(-BM, -BM, BW + 2 * BM, BH + 2 * BM);
    if (hotState) {
      x.strokeStyle = '#df5227'; x.lineWidth = 2;
      const P = 2 * ((BW - 2) + (BH - 2)), seg = [24.3, 2, 17.5, 1.1, 32.5, 2.8, 15.5, 2.1, 2.2, 0].map(v => v * P / 100);
      x.setLineDash(seg); x.strokeRect(1, 1, BW - 2, BH - 2); x.setLineDash([]);
    }
    x.fillStyle = hotState ? '#ffffff' : '#1f1f1f'; x.fillRect(8, 7, BW - 16, BH - 14);
    x.strokeStyle = hotState ? '#ffffff' : '#d4d4d4'; x.lineWidth = 2; x.strokeRect(9, 8, BW - 18, BH - 16);
    x.fillStyle = hotState ? '#111111' : '#ffffff'; x.font = '36px "Redaction 10", "Redaction", Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CLICK', BW / 2, BH / 2 + 1);
    tex.needsUpdate = true;
  };
  draw();
  return { tex, draw };
}
/* weather the scanned plastic: sun-yellowing on light surfaces, grime in patches and along the base, matte wear, specks */
function ageMaterial(m, min, size) {
  if (!m || !m.isMeshStandardMaterial) return;
  m.envMapIntensity = 0.8;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAge = { value: CFG.age }; sh.uniforms.uMin = { value: min }; sh.uniforms.uSize = { value: size };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vAgeP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAgeP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vAgeP; uniform float uAge; uniform vec3 uMin, uSize;
float aH(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float aN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(aH(i), aH(i + vec3(1,0,0)), f.x), mix(aH(i + vec3(0,1,0)), aH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(aH(i + vec3(0,0,1)), aH(i + vec3(1,0,1)), f.x), mix(aH(i + vec3(0,1,1)), aH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float aF(vec3 p){ return 0.5 * aN(p) + 0.25 * aN(p * 2.03) + 0.125 * aN(p * 4.11) + 0.0625 * aN(p * 8.27); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 ap = (vAgeP - uMin) / max(max(uSize.x, uSize.y), uSize.z);
float aLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
float aPl = smoothstep(0.12, 0.45, aLum);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.06, 0.92, 0.7), uAge * (0.55 + 0.5 * aF(ap * 5.0)) * aPl);
float aG = smoothstep(0.48, 0.8, aF(ap * 20.0 + 4.0));
float aLow = 1.0 - smoothstep(0.0, 0.2, (vAgeP.y - uMin.y) / uSize.y);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.79, 0.68), uAge * (0.45 * aG + 0.35 * aLow));
diffuseColor.rgb *= 1.0 - step(0.9915, aH(floor(ap * 640.0))) * 0.45 * uAge;
diffuseColor.rgb *= 0.94 + 0.06 * aN(ap * 180.0);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + uAge * (0.12 + 0.18 * aG), 0.0, 1.0);`);
  };
  m.needsUpdate = true;
}
function setYaw(s, deg) { s.rig.rotation.set(0, s.THREE.MathUtils.degToRad(deg), 0); s.rig.updateMatrixWorld(true); }
let turnT0 = 0;
function disposeSession(s) {
  if (!s) return;
  s.scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); });
  });
  if (s.envTex) s.envTex.dispose();
  s.renderer.dispose(); try { s.renderer.forceContextLoss(); } catch (e) {}
  s.canvas.remove();
}

function frameRest(s) {
  const { THREE, camera, worldBox } = s;
  camera.aspect = innerWidth / innerHeight;
  const size = new THREE.Vector3(); worldBox.getSize(size); const ctr = new THREE.Vector3(); worldBox.getCenter(ctr);
  const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const dist = Math.max(size.y / CFG.framing / t, size.x / CFG.maxWidth / (t * camera.aspect));
  s.restTarget.set(ctr.x, ctr.y + size.y * 0.02, ctr.z);
  s.restCam.set(ctr.x, ctr.y + size.y * 0.16, ctr.z + dist + size.z * 0.5);
  camera.updateProjectionMatrix();
}
function poseRest(s) { s.camera.position.copy(s.restCam); s.lookTarget.copy(s.restTarget); s.camera.up.set(0, 1, 0); s.camera.lookAt(s.lookTarget); s.camera.updateMatrixWorld(true); }
function resize() {
  if (!S) return;
  S.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  S.renderer.setSize(innerWidth, innerHeight, false);
  frameRest(S);
  if (state === 'idle') poseRest(S);
}
addEventListener('resize', resize);

function hitModel(cx, cy) {
  if (!S) return false;
  S.ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); S.ray.setFromCamera(S.ndc, S.camera);
  const local = S.ray.ray.clone().applyMatrix4(S.rig.matrixWorld.clone().invert());
  return !!local.intersectBox(S.modelBox, new S.THREE.Vector3());
}
function bindCanvas(s) {
  const cv = s.canvas;
  cv.addEventListener('pointermove', (e) => {
    if (state !== 'idle') return;
    hot = hitModel(e.clientX, e.clientY);
  });
  cv.addEventListener('pointerdown', (e) => { pointer.down = { x: e.clientX, y: e.clientY }; });
  cv.addEventListener('pointerup', (e) => {
    const d = pointer.down; pointer.down = null;
    // touch / small screens: the on-glass button is tiny, so any tap enters
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 10 && (e.pointerType === 'touch' || innerWidth < 760 || hitModel(e.clientX, e.clientY))) enter();
  });
  cv.addEventListener('pointercancel', () => { pointer.down = null; });
  cv.addEventListener('pointerleave', () => { hot = false; });
}
addEventListener('keydown', (e) => { if (e.key === 'Escape' && (state === 'idle' || state === 'loading')) { e.preventDefault(); skip(); } });

/* ---------- screen geometry ---------- */
function screenPoint(i, j, out) {
  const { X0, X1, Y0, Y1, NX, NY, z } = SCREEN;
  const i0 = Math.min(NX - 1, Math.max(0, Math.floor(i))), j0 = Math.min(NY - 1, Math.max(0, Math.floor(j))), fi = i - i0, fj = j - j0;
  const Z = (a, b) => z[b * (NX + 1) + a];
  const zz = (Z(i0, j0) * (1 - fi) + Z(i0 + 1, j0) * fi) * (1 - fj) + (Z(i0, j0 + 1) * (1 - fi) + Z(i0 + 1, j0 + 1) * fi) * fj;
  out.set(X0 + (X1 - X0) * i / NX, Y1 - (Y1 - Y0) * j / NY, zz + 0.006);
  return out.applyMatrix4(S.rig.matrixWorld);
}
const picI = (u) => SCREEN.NX * (0.5 + (u - 0.5) * CFG.inset[0]);
const picJ = (v) => SCREEN.NY * (0.5 + (v - 0.5) * CFG.inset[1]);
function toPx(v, cam, out) { const p = S.projV.copy(v).project(cam); out.x = (p.x + 1) / 2 * innerWidth; out.y = (1 - p.y) / 2 * innerHeight; out.z = p.z; return out; }

/* does the picture fully cover the viewport from camera distance d along the normal? */
function covers(d, frame, cam) {
  const { THREE } = S;
  cam.position.copy(frame.C).addScaledVector(frame.n, d); cam.up.copy(frame.up); cam.lookAt(frame.C); cam.updateMatrixWorld(true);
  const v = new THREE.Vector3(), q = {}; const m = 0.02;
  for (let k = 0; k <= 16; k++) {
    const f = k / 16;
    toPx(screenPoint(picI(f), picJ(0), v), cam, q); if (q.y > -m * innerHeight) return false;
    toPx(screenPoint(picI(f), picJ(1), v), cam, q); if (q.y < innerHeight * (1 + m)) return false;
    toPx(screenPoint(picI(0), picJ(f), v), cam, q); if (q.x > -m * innerWidth) return false;
    toPx(screenPoint(picI(1), picJ(f), v), cam, q); if (q.x < innerWidth * (1 + m)) return false;
  }
  return true;
}

/* map the on-screen button (BW×BH css px) onto 4 projected points on the glass */
function quadMatrix(p0, p1, p2, p3) {
  const sx = p0.x - p1.x + p2.x - p3.x, sy = p0.y - p1.y + p2.y - p3.y;
  let a, b, c, d, e, f, g, h;
  if (Math.abs(sx) < 1e-9 && Math.abs(sy) < 1e-9) { a = p1.x - p0.x; b = p3.x - p0.x; c = p0.x; d = p1.y - p0.y; e = p3.y - p0.y; f = p0.y; g = 0; h = 0; }
  else {
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
    a = p1.x - p0.x + g * p1.x; b = p3.x - p0.x + h * p3.x; c = p0.x; d = p1.y - p0.y + g * p1.y; e = p3.y - p0.y + h * p3.y; f = p0.y;
  }
  a /= BW; d /= BW; g /= BW; b /= BH; e /= BH; h /= BH;
  return `matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;
}
const bq = [{}, {}, {}, {}];
function placeButton(opacity, jitter) {
  const { THREE } = S, v = new THREE.Vector3();
  const picW = (SCREEN.X1 - SCREEN.X0) * CFG.inset[0], picH = (SCREEN.Y1 - SCREEN.Y0) * CFG.inset[1];
  const hw = CFG.button / 2, hh = hw * (BH / BW) * (picW / picH);
  const pts = [[0.5 - hw, 0.5 - hh], [0.5 + hw, 0.5 - hh], [0.5 + hw, 0.5 + hh], [0.5 - hw, 0.5 + hh]];
  pts.forEach(([u, w], k) => { toPx(screenPoint(picI(u), picJ(w), v), S.camera, bq[k]); bq[k].x += jitter; });
  enterBtn.style.transform = quadMatrix(bq[0], bq[1], bq[2], bq[3]);
  enterBtn.style.opacity = opacity.toFixed(3);
  S.screenMat.uniforms.uBtn.value = opacity;
}

/* ---------- enter ---------- */
function enter() {
  if (state !== 'idle') return;
  if (reduceMotion || !S) return skip();
  const { THREE, camera } = S;
  state = 'zooming'; entrance.classList.add('zooming'); entrance.classList.remove('hot'); enterBtn.disabled = true; enterBtn.blur();
  const { NX, NY } = SCREEN; const v = () => new THREE.Vector3();
  const C = screenPoint(NX / 2, NY / 2, v());
  const L = screenPoint(picI(0), NY / 2, v()), R = screenPoint(picI(1), NY / 2, v()), Tp = screenPoint(NX / 2, picJ(0), v()), B = screenPoint(NX / 2, picJ(1), v());
  const right = R.clone().sub(L), up = Tp.clone().sub(B).normalize();
  const n = new THREE.Vector3().crossVectors(right, up).normalize();
  const frame = { C, n, up };
  // closest-fitting distance at which the curved picture covers the whole viewport
  const probe = camera.clone();
  let lo = 0.02, hi = right.length() * 3;
  for (let k = 0; k < 24; k++) { const mid = (lo + hi) / 2; if (covers(mid, frame, probe)) lo = mid; else hi = mid; }
  const d1 = Math.max(0.02, lo);
  const off = camera.position.clone().sub(C), d0 = off.length(), dir0 = off.normalize();
  zoom = { t0: performance.now(), C, n, up, d0, d1, dir0, fromLook: S.lookTarget.clone(), q: new THREE.Quaternion().setFromUnitVectors(dir0, n), qI: new THREE.Quaternion(), qT: new THREE.Quaternion(), dir: new THREE.Vector3(), upV: new THREE.Vector3() };
  toTop();
  // watchdog: if the frame loop stalls (throttled tab, GPU hiccup) never leave the page locked
  setTimeout(() => { if (state === 'zooming') startReveal(performance.now()); }, CFG.enterMs + 1200);
}

function startReveal(now) {
  state = 'revealing'; revealT = now;
  releasePage(); toTop();           // page is live underneath; hero intro starts as it tunes in
  entrance.classList.add('revealing');
  setTimeout(finishEnter, CFG.revealMs + 30);
}
function teardown() {
  cancelAnimationFrame(raf); raf = 0;
  disposeSession(S); S = null; zoom = null;
  entrance.hidden = true; entrance.classList.remove('zooming', 'hot', 'revealing');
  enterBtn.style.cssText = ''; hot = btnHot = false;
}
function finishEnter() {
  if (state !== 'revealing') return;
  state = 'done';
  teardown();
  focusMain();
  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  dispatchEvent(new CustomEvent('computer:entered'));
}
function skip() {
  if (state === 'done' || state === 'off' || state === 'revealing') return;
  state = 'done';
  teardown();
  releasePage(); toTop();
  const site = findSite(); if (site) site.animate([{ opacity: 0.2 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
  focusMain();
  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  dispatchEvent(new CustomEvent('computer:entered'));
}

/* ---------- frame loop (only while the entrance is visible) ---------- */
function tick(now) {
  try { tickInner(now); } catch (e) { console.warn('Computer entrance frame failed, skipping to the page', e); raf = 0; if (state === 'zooming') startReveal(performance.now()); else skip(); }
}
function tickInner(now) {
  raf = 0;
  if (!S || (state !== 'idle' && state !== 'zooming')) return;
  const { screenMat, camera, renderer } = S;
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  const U = screenMat.uniforms; U.uTime.value = reduceMotion ? 12.345 : now / 1000;
  U.uPower.value = reduceMotion ? 1 : clamp01((now - powerT0) / CFG.powerOnMs);
  const isHot = state === 'idle' && (hot || btnHot);
  entrance.classList.toggle('hot', isHot);
  hover += ((isHot ? 1 : 0) - hover) * (1 - Math.exp(-dt * 24)); U.uHover.value = hover;
  if (!reduceMotion && state === 'idle' && now > glitch.next) {
    glitch.until = now + CFG.glitchMs[0] + Math.random() * (CFG.glitchMs[1] - CFG.glitchMs[0]);
    glitch.next = glitch.until + CFG.glitchEvery[0] + Math.random() * (CFG.glitchEvery[1] - CFG.glitchEvery[0]);
    U.uSeed.value = Math.random() * 100;
  }
  const gOn = !reduceMotion && now < glitch.until ? 1 : 0;
  U.uGlitch.value += (gOn - U.uGlitch.value) * (1 - Math.exp(-dt * 40));
  if (gOn && Math.random() < 0.25) U.uSeed.value = Math.random() * 100;
  if (S.spill) S.spill.intensity = (0.22 + 0.1 * hover + 0.25 * U.uGlitch.value * Math.random()) * smooth(0, 0.6, U.uPower.value) * (1 - U.uTune.value);
  const jitter = U.uGlitch.value > 0.35 ? (Math.random() - 0.5) * 10 * U.uGlitch.value : 0;

  if (state === 'idle') {
    if (!reduceMotion) setYaw(S, CFG.yawDeg * (1 - easeTurn(clamp01((now - turnT0) / CFG.turnMs))));
    placeButton(smooth(0.6, 1, U.uPower.value) * (1 - 0.5 * U.uGlitch.value * Math.random()), jitter);
  } else {
    const p = CFG.freezeAt != null ? CFG.freezeAt : clamp01((now - zoom.t0) / CFG.enterMs);
    const B = easeEnter(p);
    // camera arcs round to the screen's normal (done by ~85%) while dollying in at a constant rate of zoom
    const Bd = easeEnter(clamp01(p / 0.85));
    zoom.qT.copy(zoom.qI).slerp(zoom.q, Bd);
    zoom.dir.copy(zoom.dir0).applyQuaternion(zoom.qT);
    const d = zoom.d0 * Math.pow(zoom.d1 / zoom.d0, B);
    camera.position.copy(zoom.C).addScaledVector(zoom.dir, d);
    S.lookTarget.lerpVectors(zoom.fromLook, zoom.C, easeEnter(clamp01(p / 0.6)));
    camera.up.copy(zoom.upV.set(0, 1, 0).lerp(zoom.up, Bd).normalize());
    camera.lookAt(S.lookTarget); camera.updateMatrixWorld(true);
    U.uCrt.value = 1 - smooth(0.3, 0.85, B);
    U.uTune.value = smooth(0.5, 0.95, B);
    U.uFlash.value = Math.sin(Math.PI * smooth(0.4, 0.82, B)) * 0.1;
    S.shadow.material.opacity = 1 - smooth(0.3, 0.6, B);
    placeButton(1 - smooth(0.1, 0.32, B), 0);
    if (p >= 1) { renderer.render(S.scene, camera); startReveal(now); return; }
  }
  renderer.render(S.scene, camera);
  raf = requestAnimationFrame(tick);
}

/* ---------- show (on load, or from the nav's ↺ Computer) ---------- */
async function show() {
  if (state === 'loading' || state === 'idle' || state === 'zooming' || state === 'revealing') return;
  state = 'loading';
  preload(); buildDOM();
  window.__computerHold = true;
  entrance.hidden = false; entrance.classList.remove('zooming', 'hot', 'revealing');
  enterBtn.disabled = true; enterBtn.style.opacity = '0';
  lockPage(); toTop();
  html.classList.add('ce-cover-off');
  try {
    const s = await Promise.race([
      createSession(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('model not loaded after ' + CFG.loadTimeoutMs + 'ms')), CFG.loadTimeoutMs)),
    ]);
    if (state !== 'loading') { disposeSession(s); return; }
    S = s;
    entrance.insertBefore(S.canvas, ui);
    resize(); poseRest(S);
    state = 'idle'; enterBtn.disabled = false;
    const now = performance.now();
    powerT0 = now + 250; turnT0 = now + CFG.turnDelay; glitch.until = 0; glitch.next = now + 2500;
    raf = requestAnimationFrame(t => { last = t; tick(t); });
  } catch (e) {
    console.warn('Computer entrance unavailable, skipping to the page', e);
    if (state === 'loading') skip();
  }
}
function back() {
  if (state !== 'done' && state !== 'off') return;
  state = 'off';
  show();
}

window.COMPUTER = {
  CFG, enter, skip, back, show,
  forceGlitch: (ms = 400) => { glitch.until = performance.now() + ms; if (S) S.screenMat.uniforms.uSeed.value = Math.random() * 100; },
  get state() { return state; },
};
addEventListener('computer:back', back);

/* ---------- boot ---------- */
(async () => {
  let seen = false; try { seen = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  await waitSite();
  if (seen) { html.classList.add('ce-cover-off'); window.__computerHold = false; return; }
  show();
})();
