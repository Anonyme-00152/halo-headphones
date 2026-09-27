// Rendering: studio environments, background matching, framing and export.
import * as THREE from 'three';

// Studio lighting as an HDR environment made of emissive softboxes (drives the reflections).
const MOODS = {
  dark: { base: 0x030304, exposure: 1.0, key: 1.2, panels: [
    { pos: [-9, 11, 9], size: [16, 9], i: 5 }, { pos: [13, 4, -7], size: [3, 20], i: 10 },
    { pos: [-14, 2, -5], size: [3, 18], i: 7 }, { pos: [0, 17, -2], size: [12, 12], i: 2 }] },
  light: { base: 0xbdbec0, exposure: 1.0, key: 1.6, panels: [
    { pos: [0, 16, 7], size: [22, 14], i: 3.2 }, { pos: [-15, 4, 7], size: [7, 16], i: 2.6 },
    { pos: [15, 4, 5], size: [7, 16], i: 2.0 }, { pos: [0, -14, 0], size: [24, 24], i: 0.7 }] },
  gradient: { base: 0x4a4f58, exposure: 1.0, key: 1.4, panels: [
    { pos: [-6, 13, 12], size: [22, 11], i: 5 }, { pos: [16, 5, -3], size: [4, 22], i: 9 },
    { pos: [-16, 3, -3], size: [4, 20], i: 7 }, { pos: [0, 19, 0], size: [14, 14], i: 2.2 },
    { pos: [0, -3, 18], size: [26, 5], i: 1.6 }] },
};

export class Stage {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envs = {};
  }

  env(mood) {
    if (this.envs[mood]) return this.envs[mood];
    const m = MOODS[mood];
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(m.base);
    for (const p of m.panels) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p.i), side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...p.size), mat);
      mesh.position.set(...p.pos);
      mesh.lookAt(0, 0, 0);
      scene.add(mesh);
    }
    return (this.envs[mood] = this.pmrem.fromScene(scene, 0.03).texture);
  }

  // A scene lit by a mood, with an optional shadow-catching ground at height `ground`.
  scene(mood, { ground = null, shadow = 0.32, keyDir = [-0.45, 1, 0.55], shadowSize = 30, envIntensity = 1 } = {}) {
    const m = MOODS[mood];
    const scene = new THREE.Scene();
    scene.environment = this.env(mood);
    scene.environmentIntensity = envIntensity;
    scene.userData.exposure = m.exposure;
    const key = new THREE.DirectionalLight(0xffffff, m.key);
    key.position.set(...keyDir).normalize().multiplyScalar(60);
    scene.add(key);
    if (ground !== null) {
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.radius = 14;
      key.shadow.blurSamples = 24;
      key.shadow.bias = -0.0004;
      const c = key.shadow.camera;
      c.left = c.bottom = -shadowSize;
      c.right = c.top = shadowSize;
      c.near = 1; c.far = 140;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: shadow }));
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = ground;
      plane.receiveShadow = true;
      scene.add(plane);
    }
    return scene;
  }

  // Draw scene into a w×h canvas (supersampled), optionally over a background canvas.
  render(scene, camera, w, h, { background = null, ss = 2 } = {}) {
    const max = 7000;
    const s = Math.min(ss, max / Math.max(w, h));
    const W = Math.round(w * s), H = Math.round(h * s);
    this.renderer.setSize(W, H, false);
    this.renderer.toneMappingExposure = scene.userData.exposure ?? 1;
    this.renderer.render(scene, camera);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const g = out.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    if (background) g.drawImage(background, 0, 0, w, h);
    g.drawImage(this.renderer.domElement, 0, 0, W, H, 0, 0, w, h);
    return out;
  }
}

// Place the camera so a fitW × fitH box around `target` is framed ("contain") or fills the frame ("cover").
export function frame(camera, aspect, { target, dir, fit, offset = [0, 0], fov = 28, up = [0, 1, 0], mode = 'contain' }) {
  camera.fov = fov;
  camera.aspect = aspect;
  const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const byH = fit[1] / (2 * t), byW = fit[0] / (2 * t * aspect);
  const d = mode === 'cover' ? Math.min(byH, byW) : Math.max(byH, byW);
  const tgt = new THREE.Vector3(...target);
  camera.position.copy(tgt).addScaledVector(new THREE.Vector3(...dir).normalize(), d);
  camera.up.set(...up);
  camera.lookAt(tgt);
  const vh = 2 * d * t, vw = vh * aspect;
  camera.translateX(-offset[0] * vw / 2);
  camera.translateY(-offset[1] * vh / 2);
  camera.near = d / 40;
  camera.far = d * 8;
  camera.updateProjectionMatrix();
  return camera;
}

// ---------- background matching ----------
// Average colour/alpha of a patch of an image, in [0,1] fractions of its size.
function patch(data, W, H, fx, fy, fs) {
  const x0 = Math.floor((fx - fs / 2) * W), y0 = Math.floor((fy - fs / 2) * H);
  const x1 = Math.ceil((fx + fs / 2) * W), y1 = Math.ceil((fy + fs / 2) * H);
  let r = 0, g = 0, b = 0, a = 0, n = 0;
  for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) {
    const i = (y * W + x) * 4;
    r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
  }
  return [r / n, g / n, b / n, a / n];
}

// Samples the 8 border points of an original visual, plus how transparent it is.
export function sampleBackground(source, sw, sh) {
  const W = 256, H = Math.max(8, Math.round(256 * sh / sw));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, 0, 0, W, H);
  const { data } = g.getImageData(0, 0, W, H);
  const e = 0.03, s = 0.05;
  const pts = { tl: [e, e], t: [0.5, e], tr: [1 - e, e], l: [e, 0.5], r: [1 - e, 0.5], bl: [e, 1 - e], b: [0.5, 1 - e], br: [1 - e, 1 - e] };
  const samples = {};
  for (const [k, [x, y]] of Object.entries(pts)) samples[k] = patch(data, W, H, x, y, s).map(v => Math.round(v));
  let clear = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) clear++;
  const transparentShare = clear / (W * H);
  const cornersClear = ['tl', 'tr', 'bl', 'br'].every(k => samples[k][3] < 128);
  return { samples, transparent: cornersClear && transparentShare > 0.05, transparentShare: Math.round(transparentShare * 100) / 100 };
}

// Smooth background (Coons patch through the 8 border samples) with a little dither against banding.
// Where the original subject touched an edge, its colour pollutes that sample: fall back to the corners.
function cleanSamples(samples) {
  const S = Object.fromEntries(Object.entries(samples).map(([k, v]) => [k, v.slice(0, 3)]));
  const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const avg = list => [0, 1, 2].map(i => list.reduce((a, c) => a + c[i], 0) / list.length);
  // A corner is polluted only if it disagrees with the three others while they agree with each other
  // (a genuine gradient makes corners differ in pairs, which must be kept).
  const corners = ['tl', 'tr', 'bl', 'br'];
  for (const k of corners) {
    const others = corners.filter(o => o !== k).map(o => lum(S[o]));
    const spread = Math.max(...others) - Math.min(...others);
    if (spread < 40 && others.every(v => Math.abs(v - lum(S[k])) > 60)) {
      S[k] = avg(corners.filter(o => o !== k).map(o => S[o]));
    }
  }
  for (const [mid, a, b] of [['t', 'tl', 'tr'], ['b', 'bl', 'br'], ['l', 'tl', 'bl'], ['r', 'tr', 'br']]) {
    const ref = avg([S[a], S[b]]);
    if (Math.abs(lum(S[mid]) - lum(ref)) > 40) S[mid] = ref;
  }
  return S;
}

export function backgroundCanvas(bg, w, h) {
  const S = cleanSamples(bg.samples), gw = 64, gh = Math.max(8, Math.round(64 * h / w));
  const small = document.createElement('canvas');
  small.width = gw; small.height = gh;
  const g = small.getContext('2d');
  const img = g.createImageData(gw, gh);
  const lerp = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const edge = (a, m, b, t) => (t < 0.5 ? lerp(a, m, t * 2) : lerp(m, b, (t - 0.5) * 2));
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    const u = x / (gw - 1), v = y / (gh - 1);
    const top = edge(S.tl, S.t, S.tr, u), bot = edge(S.bl, S.b, S.br, u);
    const lef = edge(S.tl, S.l, S.bl, v), rig = edge(S.tr, S.r, S.br, v);
    const bil = lerp(lerp(S.tl, S.tr, u), lerp(S.bl, S.br, u), v);
    const i = (y * gw + x) * 4;
    for (let k = 0; k < 3; k++) img.data[i + k] = (1 - v) * top[k] + v * bot[k] + (1 - u) * lef[k] + u * rig[k] - bil[k];
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = true;
  o.imageSmoothingQuality = 'high';
  o.drawImage(small, 0, 0, w, h);
  const d = o.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 2.2;
    d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n;
  }
  o.putImageData(d, 0, 0);
  return out;
}

export async function toBlob(canvas, format, alpha) {
  const type = format === 'PNG' ? 'image/png' : format === 'WebP' ? 'image/webp' : 'image/jpeg';
  if (type === 'image/jpeg' || (type === 'image/png' && !alpha)) {
    // flatten (JPEG has no alpha; opaque PNGs stay opaque)
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(canvas, 0, 0);
    canvas = c;
  }
  return new Promise(r => canvas.toBlob(r, type, 0.92));
}

export async function save(path, blob) {
  const res = await fetch('/__studio/save?path=' + encodeURIComponent(path), { method: 'POST', body: blob });
  if (!res.ok) throw new Error(`save ${path}: ${res.status}`);
  return res.json();
}
