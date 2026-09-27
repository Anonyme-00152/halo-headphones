// Procedural 3D models for the HALO One visuals: headphones, travel case, phone, box.
// Units: centimetres. Y up; the ear cups sit on ±X, the front of the product faces +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const PALETTES = {
  silver: { shell: '#d3d6da', shellMetal: 1, shellRough: 0.34, band: '#aeb1b6', cushion: '#a2a5aa', cap: '#dfe2e6', fabric: '#8a8d92' },
  graphite: { shell: '#45474b', shellMetal: 0.55, shellRough: 0.46, band: '#2c2d30', cushion: '#232325', cap: '#505257', fabric: '#56585d' },
  blue: { shell: '#93a9c4', shellMetal: 0.9, shellRough: 0.36, band: '#8797ab', cushion: '#9aa8ba', cap: '#a7b9cf', fabric: '#5e6b7b' },
  red: { shell: '#b8291f', shellMetal: 0.8, shellRough: 0.38, band: '#962219', cushion: '#6e1e19', cap: '#c7362c', fabric: '#3a1412' },
  orange: { shell: '#e26a20', shellMetal: 0.75, shellRough: 0.38, band: '#cc5b1c', cushion: '#bd5a22', cap: '#ee7c33', fabric: '#5a2a10' },
};

// ---------- procedural textures ----------
const texCache = new Map();
function canvasTexture(key, size, draw, { color = false, repeat = 1 } = {}) {
  const id = `${key}:${repeat}`;
  if (texCache.has(id)) return texCache.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(id, t);
  return t;
}

// Tileable value noise → normal map (used for leather grain and soft-touch finish).
function noiseNormal(key, size, scales, strength, repeat) {
  return canvasTexture(key, size, (g, n) => {
    const h = new Float32Array(n * n);
    let seed = 1337;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const [cells, amp] of scales) {
      const grid = Array.from({ length: cells * cells }, rand);
      const at = (x, y) => grid[((y + cells) % cells) * cells + ((x + cells) % cells)];
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const fx = (x / n) * cells, fy = (y / n) * cells;
        const x0 = Math.floor(fx), y0 = Math.floor(fy);
        const sx = fx - x0, sy = fy - y0;
        const ux = sx * sx * (3 - 2 * sx), uy = sy * sy * (3 - 2 * sy);
        const v = at(x0, y0) * (1 - ux) * (1 - uy) + at(x0 + 1, y0) * ux * (1 - uy) + at(x0, y0 + 1) * (1 - ux) * uy + at(x0 + 1, y0 + 1) * ux * uy;
        h[y * n + x] += v * amp;
      }
    }
    const img = g.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const dx = (h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)]) * strength;
      const dy = (h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * n + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat });
}

// Acoustic knit fabric (colour) and its bump.
function fabricMap(repeat) {
  return canvasTexture('fabric', 256, (g, n) => {
    g.fillStyle = '#b9b9b9';
    g.fillRect(0, 0, n, n);
    const step = n / 32;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const cx = (x + (y % 2) * 0.5) * step, cy = y * step;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, step * 0.55);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#6f6f6f');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(cx, cy, step * 0.42, step * 0.3, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, { repeat });
}

// Fine concentric brushing for the aluminium caps (roughness variation).
function brushedRadial() {
  return canvasTexture('brushed', 1024, (g, n) => {
    g.fillStyle = '#7a7a7a';
    g.fillRect(0, 0, n, n);
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 2; r < n * 0.72; r += 0.8) {
      const v = 118 + rand() * 22;
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = 1;
      g.beginPath();
      g.arc(n / 2, n / 2, r, 0, Math.PI * 2);
      g.stroke();
    }
  });
}

// ---------- materials ----------
export function makeMaterials(paletteName) {
  const P = PALETTES[paletteName];
  const leatherN = noiseNormal('leather', 512, [[96, 1], [192, 0.5], [256, 0.25]], 4, 10);
  const softN = noiseNormal('soft', 256, [[128, 1], [64, 0.4]], 1.4, 10);
  const fab = fabricMap(9);
  return {
    shell: new THREE.MeshPhysicalMaterial({ color: P.shell, metalness: P.shellMetal, roughness: P.shellRough, clearcoat: 0.2, clearcoatRoughness: 0.4 }),
    cap: new THREE.MeshPhysicalMaterial({ color: P.cap, metalness: P.shellMetal, roughness: 0.3, roughnessMap: brushedRadial() }),
    band: new THREE.MeshPhysicalMaterial({ color: P.band, metalness: 0.05, roughness: 0.6, normalMap: softN, normalScale: new THREE.Vector2(0.2, 0.2), sheen: 0.35, sheenRoughness: 0.7, sheenColor: new THREE.Color('#ffffff') }),
    leather: new THREE.MeshPhysicalMaterial({ color: P.cushion, roughness: 0.52, normalMap: leatherN, normalScale: new THREE.Vector2(0.22, 0.22), sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.12, clearcoatRoughness: 0.5 }),
    fabric: new THREE.MeshStandardMaterial({ color: P.fabric, roughness: 0.95, map: fab, normalMap: noiseNormal('knit', 256, [[128, 1], [64, 0.5]], 3, 12), normalScale: new THREE.Vector2(0.6, 0.6) }),
    steel: new THREE.MeshPhysicalMaterial({ color: '#e9ebee', metalness: 1, roughness: 0.12 }),
    polished: new THREE.MeshPhysicalMaterial({ color: '#c9cbce', metalness: 1, roughness: 0.18 }),
    dark: new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.45 }),
    palette: P,
  };
}

// ---------- geometry helpers ----------
function squircle(cx, cy, hw, hh, n = 4, steps = 48) {
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    pts.push([cx + hw * Math.sign(c) * Math.abs(c) ** (2 / n), cy + hh * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return pts;
}

// Revolve a (radius, axial) profile around the cup axis (+X), then stretch into an oval.
function ovalLathe(profile, ry, rz, { closed = false, segments = 128 } = {}) {
  const pts = closed ? [...profile, profile[0]] : profile;
  const g = new THREE.LatheGeometry(pts.map(([r, a]) => new THREE.Vector2(r, a)), segments);
  g.rotateZ(-Math.PI / 2);
  g.scale(1, ry, rz); // applyMatrix4 keeps the lathe's smooth normals
  return g;
}

// Point on the cup's oval rim at height y, and the outward angle there (for parts mounted on the rim).
function onRim(y, side) {
  const ry = HP.cupH / 2, rz = HP.cupW / 2;
  const z = side * rz * Math.sqrt(1 - (y / ry) ** 2);
  const angle = Math.atan2(y / ry ** 2, Math.abs(z) / rz ** 2);
  return { z, angle };
}

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}

function planeUV(geo, w, h) {
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) / w + 0.5; uv[i * 2 + 1] = p.getY(i) / h + 0.5; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// Sweep a closed 2D profile (u across the band, v along Z) along a planar path in XY.
function sweep(path, profile, center, taper = 6) {
  const rows = path.length, cols = profile.length;
  const pos = new Float32Array(rows * cols * 3);
  const uv = new Float32Array(rows * cols * 2);
  const idx = [];
  for (let i = 0; i < rows; i++) {
    const p = path[i];
    const a = path[Math.max(0, i - 1)], b = path[Math.min(rows - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    const nrm = new THREE.Vector3(t.y, -t.x, 0);
    if (nrm.dot(new THREE.Vector3().subVectors(p, center)) < 0) nrm.negate();
    const edge = Math.min(i, rows - 1 - i);
    const s = edge < taper ? Math.sqrt(1 - ((taper - edge) / taper) ** 2) : 1;
    for (let j = 0; j < cols; j++) {
      const [u, v] = profile[j];
      const k = (i * cols + j) * 3;
      pos[k] = p.x + nrm.x * u * s;
      pos[k + 1] = p.y + nrm.y * u * s;
      pos[k + 2] = v * s;
      uv[(i * cols + j) * 2] = j / cols;
      uv[(i * cols + j) * 2 + 1] = i / (rows - 1) * 6;
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) {
    const a = i * cols + j, b = i * cols + ((j + 1) % cols), c = (i + 1) * cols + j, d = (i + 1) * cols + ((j + 1) % cols);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function logoShape(size) {
  // The HALO mark: a ring with a bar above it (a halo) (38×40 units in the SVG logo).
  const k = size / 40;
  const ring = new THREE.Shape();
  ring.absarc(0, -4.5 * k, 15.5 * k, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, -4.5 * k, 8 * k, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const bar = new THREE.Shape();
  const w = 10 * k, h = 2.5 * k, y = 17.5 * k;
  bar.absarc(-w + h, y, h, Math.PI / 2, Math.PI * 1.5, false);
  bar.absarc(w - h, y, h, -Math.PI / 2, Math.PI / 2, false);
  return [ring, bar];
}

// ---------- headphones ----------
export const HP = { cupX: 9.8, cupH: 9.8, cupW: 8.4, depth: 2.9, bandTop: 16.4, bandEnd: 8.9 };

function makeCup(M) {
  const g = new THREE.Group();
  const ry = HP.cupH / 2, rz = HP.cupW / 2, D = HP.depth / 2;
  // Shell (profile from the inner face, around the rim, to the groove around the cap).
  // Pebble-like shell: full size at the cushion, tapering towards the outer cap.
  const shell = ovalLathe([
    [0.6, -D], [0.86, -D], [0.95, -D + 0.05], [0.99, -D + 0.2], [1.0, -D + 0.45], [0.99, -D + 0.9],
    [0.975, 0], [0.95, D - 0.55], [0.915, D - 0.26], [0.87, D - 0.08], [0.8, D], [0.766, D - 0.02], [0.76, D - 0.2],
  ], ry, rz);
  g.add(new THREE.Mesh(shell, M.shell));
  // Brushed aluminium cap, slightly domed.
  const cap = ovalLathe([[0.745, D - 0.22], [0.745, D - 0.06], [0.73, D - 0.02], [0.6, D + 0.05], [0.3, D + 0.1], [0.0001, D + 0.12]], ry, rz);
  const capMesh = new THREE.Mesh(cap, M.cap);
  // planar UVs for the radial brushing
  const p = cap.attributes.position, uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uvs[i * 2] = 0.5 + p.getZ(i) / (rz * 2.1); uvs[i * 2 + 1] = 0.5 + p.getY(i) / (ry * 2.1); }
  cap.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.add(capMesh);
  // Raised polished logo on the cap.
  const logo = new THREE.ExtrudeGeometry(logoShape(2.2), { depth: 0.025, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 48 });
  logo.rotateY(Math.PI / 2);
  const logoMesh = new THREE.Mesh(logo, M.polished);
  logoMesh.position.set(D + 0.115, 0.3, 0);
  g.add(logoMesh);
  // Cushion (squircle cross-section) and recessed fabric.
  const cushion = ovalLathe(squircle(0.775, -D - 1.02, 0.215, 1.05, 3.2, 64), ry, rz, { closed: true });
  g.add(new THREE.Mesh(cushion, M.leather));
  const fabric = new THREE.CircleGeometry(1, 96);
  fabric.rotateY(-Math.PI / 2);
  fabric.scale(1, ry * 0.6, rz * 0.6);
  const fabricMesh = new THREE.Mesh(fabric, M.fabric);
  fabricMesh.position.x = -D - 0.25;
  g.add(fabricMesh);
  // Noise-control button on the back edge, USB-C port and microphones on the rim.
  const b = onRim(1.2, -1);
  const btn = new THREE.Mesh(new RoundedBoxGeometry(0.55, 1.2, 0.22, 4, 0.1), new THREE.MeshPhysicalMaterial({ color: '#cfd2d6', metalness: 1, roughness: 0.32 }));
  btn.position.set(-0.2, 1.2, b.z * 0.985 - 0.02);
  btn.rotation.x = b.angle;
  g.add(btn);
  const port = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.3, 0.3, 4, 0.14), M.dark);
  port.position.set(0.1, -ry * 0.995, 0.4);
  g.add(port);
  for (const y of [1.5, -2.2]) {
    const m = onRim(y, 1);
    const mic = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.2, 16), M.dark);
    mic.rotation.x = Math.PI / 2 - m.angle;
    mic.position.set(0.2, y, m.z * 0.975 - 0.08);
    g.add(mic);
  }
  return g;
}

export function makeHeadphones({ palette = 'graphite', swivel = 0 } = {}) {
  const M = makeMaterials(palette);
  const root = new THREE.Group();
  root.name = 'headphones';
  const cupTop = HP.cupH / 2;
  for (const side of [-1, 1]) {
    // The cup swivels around the arm axis (vertical) to fold flat.
    const pivot = new THREE.Group();
    pivot.position.set(side * HP.cupX, 0, 0);
    pivot.rotation.y = side * swivel;
    const cup = makeCup(M);
    cup.scale.x = side; // mirror: outer face points away from the head
    pivot.add(cup);
    // Steel pivot on top of the cup, and the telescopic rod up into the headband.
    const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.45, 8, 32), M.steel);
    stem.position.y = cupTop + 0.2;
    pivot.add(stem);
    root.add(pivot);
    const rodLen = HP.bandEnd - cupTop;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, rodLen, 32), M.steel);
    rod.position.set(side * HP.cupX, cupTop + 0.3 + rodLen / 2, 0);
    root.add(rod);
    // Slider housing at the end of the headband.
    const housing = new THREE.Mesh(new RoundedBoxGeometry(1.2, 2.3, 3.5, 6, 0.5), M.band);
    housing.position.set(side * (HP.cupX + 0.02), HP.bandEnd - 0.15, 0);
    root.add(housing);
  }
  // Headband: flat soft-touch shell + recessed cushion, swept along a half-ellipse.
  const center = new THREE.Vector3(0, HP.bandEnd, 0);
  const pathAt = (r) => {
    const pts = [];
    for (let i = 0; i <= 140; i++) {
      const t = -Math.PI / 2 + (i / 140) * Math.PI;
      pts.push(new THREE.Vector3((HP.cupX + r) * Math.sin(t), HP.bandEnd + (HP.bandTop - HP.bandEnd + r) * Math.cos(t), 0));
    }
    return pts;
  };
  root.add(new THREE.Mesh(sweep(pathAt(0.02), squircle(0, 0, 0.44, 1.75, 6, 48), center, 3), M.band));
  root.add(new THREE.Mesh(sweep(pathAt(-0.68).slice(24, -24), squircle(0, 0, 0.36, 1.3, 3, 40), center, 8), M.leather));
  root.userData.materials = M;
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// ---------- travel case ----------
const CASE_H = 3.3; // half height of the shell, without the seam
export const CASE_HALF_HEIGHT = CASE_H + 0.12;
export function makeCase({ palette = 'graphite' } = {}) {
  const M = makeMaterials(palette);
  const g = new THREE.Group();
  const shellMat = new THREE.MeshPhysicalMaterial({ color: palette === 'graphite' ? '#2c2d30' : M.palette.band, roughness: 0.72, normalMap: noiseNormal('case', 256, [[96, 1], [48, 0.5]], 3, 14), normalScale: new THREE.Vector2(0.5, 0.5), sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color('#ffffff') });
  // Clamshell: superellipse profile (straight sides, rounded top), oval in plan.
  const half = (sign) => {
    const prof = [];
    for (let i = 0; i <= 48; i++) {
      const t = (i / 48) * Math.PI / 2;
      prof.push([Math.cos(t) ** (2 / 3.2), CASE_H * Math.sin(t) ** (2 / 3.2) * sign]);
    }
    if (sign < 0) prof.reverse(); // keep faces pointing outward
    const geo = new THREE.LatheGeometry(prof.map(([r, a]) => new THREE.Vector2(Math.max(r, 0.0001), a)), 128);
    geo.scale(10, 1, 8.3);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, shellMat);
  };
  const top = half(1), bottom = half(-1);
  top.position.y = 0.12;
  bottom.position.y = -0.12;
  g.add(top, bottom);
  // zipper seam
  const zip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 12, 256), new THREE.MeshPhysicalMaterial({ color: '#16161a', roughness: 0.35, metalness: 0.4 }));
  zip.rotation.x = Math.PI / 2;
  zip.scale.set(10.02, 8.32, 12);
  g.add(zip);
  const pull = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.28, 0.7, 3, 0.12), M.steel);
  pull.position.set(5.9, 0, 6.72);
  pull.rotation.y = -0.62;
  g.add(pull);
  // embossed logo on the lid
  const logo = new THREE.Mesh(new THREE.ExtrudeGeometry(logoShape(2.6), { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, curveSegments: 48 }), new THREE.MeshPhysicalMaterial({ color: '#3a3b3f', roughness: 0.4, metalness: 0.2 }));
  logo.rotation.x = -Math.PI / 2;
  logo.position.set(0, CASE_H + 0.13, 0);
  g.add(logo);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- phone with the Halo app ----------
function appScreen() {
  const W = 780, H = 1688;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0b0b0c';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2f2f2';
  g.font = '600 34px Inter, Arial';
  g.fillText('9:41', 64, 78);
  g.fillRect(W - 120, 56, 56, 24);
  g.font = '500 30px Inter, Arial';
  g.fillStyle = '#8b8b8e';
  g.fillText('Connected', 64, 196);
  g.fillStyle = '#ffffff';
  g.font = '600 64px Inter, Arial';
  g.fillText('Halo One', 64, 268);
  g.fillStyle = '#8b8b8e';
  g.font = '500 30px Inter, Arial';
  g.fillText('Battery 82%  ·  34 h left', 64, 318);
  // headphone glyph
  g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.lineCap = 'round';
  g.beginPath(); g.arc(W - 150, 250, 58, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.roundRect(W - 222, 246, 34, 60, 14); g.roundRect(W - 112, 246, 34, 60, 14); g.fill();
  // mode pills
  const pills = ['Adaptive', 'Noise off', 'Transparency'];
  let x = 64;
  g.font = '600 30px Inter, Arial';
  pills.forEach((p, i) => {
    const w = g.measureText(p).width + 56;
    g.fillStyle = i === 0 ? '#ff2200' : '#1c1c1e';
    g.beginPath(); g.roundRect(x, 384, w, 72, 36); g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(p, x + 28, 432);
    x += w + 16;
  });
  // sound profile card with EQ curve
  g.fillStyle = '#161618';
  g.beginPath(); g.roundRect(48, 510, W - 96, 560, 36); g.fill();
  g.fillStyle = '#ffffff';
  g.font = '600 38px Inter, Arial';
  g.fillText('Your sound profile', 88, 584);
  g.fillStyle = '#8b8b8e';
  g.font = '500 28px Inter, Arial';
  g.fillText('Tuned to your ears · updated today', 88, 630);
  g.strokeStyle = '#2a2a2d'; g.lineWidth = 2;
  for (let i = 0; i < 5; i++) { const y = 700 + i * 80; g.beginPath(); g.moveTo(88, y); g.lineTo(W - 88, y); g.stroke(); }
  const curve = x => 860 - 110 * Math.sin(x * 2.6 + 0.4) * Math.exp(-x * 0.6) - 40 * Math.cos(x * 7);
  const grad = g.createLinearGradient(0, 700, 0, 1020);
  grad.addColorStop(0, 'rgba(255,34,0,0.45)'); grad.addColorStop(1, 'rgba(255,34,0,0)');
  g.beginPath(); g.moveTo(88, 1020);
  for (let i = 0; i <= 100; i++) { const t = i / 100; g.lineTo(88 + t * (W - 176), curve(t * 3)); }
  g.lineTo(W - 88, 1020); g.closePath(); g.fillStyle = grad; g.fill();
  g.beginPath();
  for (let i = 0; i <= 100; i++) { const t = i / 100; const X = 88 + t * (W - 176), Y = curve(t * 3); i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
  g.strokeStyle = '#ff2200'; g.lineWidth = 7; g.stroke();
  g.fillStyle = '#6e6e72'; g.font = '500 24px Inter, Arial';
  ['60', '250', '1k', '4k', '16k'].forEach((l, i) => g.fillText(l, 88 + i * ((W - 200) / 4), 1050));
  // devices list
  const rows = [['iPhone', 'Playing · now'], ['MacBook Pro', 'Ready'], ['iPad', 'Ready']];
  g.fillStyle = '#ffffff'; g.font = '600 36px Inter, Arial';
  g.fillText('Synced devices', 64, 1150);
  rows.forEach(([n, s], i) => {
    const y = 1190 + i * 120;
    g.fillStyle = '#161618'; g.beginPath(); g.roundRect(48, y, W - 96, 100, 28); g.fill();
    g.fillStyle = '#ffffff'; g.font = '500 32px Inter, Arial'; g.fillText(n, 88, y + 62);
    g.fillStyle = i === 0 ? '#ff5a3c' : '#8b8b8e'; g.font = '500 26px Inter, Arial';
    g.fillText(s, W - 88 - g.measureText(s).width, y + 62);
  });
  // bottom bar
  g.fillStyle = '#f2f2f2'; g.beginPath(); g.roundRect(W / 2 - 110, H - 40, 220, 10, 5); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function makePhone() {
  const g = new THREE.Group();
  const bodyGeo = new THREE.ExtrudeGeometry(roundedRectShape(7.15, 14.7, 1.0), { depth: 0.5, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.16, bevelSegments: 6, curveSegments: 24 });
  bodyGeo.translate(0, 0, -0.25);
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshPhysicalMaterial({ color: '#2b2c2f', metalness: 1, roughness: 0.28 }));
  g.add(body);
  // Glass with the app UI as emission, so the environment still reflects on it.
  const screenGeo = planeUV(new THREE.ShapeGeometry(roundedRectShape(6.9, 14.45, 0.85), 24), 6.9, 14.45);
  const screen = new THREE.Mesh(screenGeo, new THREE.MeshPhysicalMaterial({ color: '#000000', roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, emissive: '#ffffff', emissiveMap: appScreen(), emissiveIntensity: 1 }));
  screen.position.z = 0.42;
  g.add(screen);
  const island = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(2.0, 0.6, 0.29), 16), new THREE.MeshBasicMaterial({ color: '#000000' }));
  island.position.set(0, 6.55, 0.425);
  g.add(island);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ---------- retail box (open, seen from above) ----------
export function makeBox() {
  const g = new THREE.Group();
  const W = 31, D = 25, H = 7, wall = 0.35;
  const outer = new THREE.MeshPhysicalMaterial({ color: '#1d1d1f', roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.8, normalMap: noiseNormal('paper', 256, [[128, 1]], 1.2, 8), normalScale: new THREE.Vector2(0.3, 0.3) });
  const foam = new THREE.MeshStandardMaterial({ color: '#111113', roughness: 0.95, normalMap: noiseNormal('foam', 256, [[160, 1], [80, 0.5]], 5, 10), normalScale: new THREE.Vector2(0.6, 0.6) });
  const wallGeo = (w, d) => new RoundedBoxGeometry(w, H, d, 3, 0.12);
  const walls = [[W, wall, 0, -D / 2], [W, wall, 0, D / 2], [wall, D, -W / 2, 0], [wall, D, W / 2, 0]];
  for (const [w, d, x, z] of walls) {
    const m = new THREE.Mesh(wallGeo(w, d), outer);
    m.position.set(x, H / 2, z);
    g.add(m);
  }
  const floor = new THREE.Mesh(new RoundedBoxGeometry(W - wall, 1, D - wall, 2, 0.1), foam);
  floor.position.y = H - 3.2;
  g.add(floor);
  g.userData.floorY = H - 2.7;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

export function makeCable(color = '#e7e7e7') {
  // A small coiled USB-C cable.
  const pts = [];
  for (let i = 0; i <= 400; i++) {
    const t = (i / 400) * Math.PI * 2 * 3.2;
    const r = 3.2 + 0.18 * Math.sin(t * 0.5);
    pts.push(new THREE.Vector3(Math.cos(t) * r, 0.2 + (i / 400) * 0.5, Math.sin(t) * r * 0.85));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 800, 0.16, 12), new THREE.MeshPhysicalMaterial({ color, roughness: 0.5, sheen: 0.3 }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
