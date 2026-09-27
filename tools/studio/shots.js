// One function per visual: builds the scene and frames the camera for a given aspect ratio.
import * as THREE from 'three';
import { frame } from './stage.js';
import { makeHeadphones, makeCase, makePhone, makeBox, makeCable, HP, CASE_HALF_HEIGHT } from './model.js';

const cam = () => new THREE.PerspectiveCamera();
const CENTER_Y = (HP.bandTop + 0.6 - HP.cupH / 2) / 2; // vertical centre of the upright headphones
// Folded flat (cups swivelled 90°, lying on the cushions): footprint spans z from the cup bottoms to the band top.
const FOLDED_LIFT = HP.depth / 2 + 2.07;
const FOLDED_CENTER_Z = (HP.bandTop + 0.46 - HP.cupH / 2) / 2;
function folded(palette) {
  const h = makeHeadphones({ palette, swivel: Math.PI / 2 });
  h.rotation.x = Math.PI / 2;
  h.position.y = FOLDED_LIFT;
  const g = new THREE.Group();
  g.add(h);
  g.position.z = -FOLDED_CENTER_Z; // centre the footprint on the origin
  return g;
}
// Light product on dark backgrounds, dark product on light ones.
const autoPalette = bg => (bg && luminance(bg) < 0.45 ? 'silver' : 'graphite');
export function luminance(bg) {
  const s = Object.values(bg.samples);
  return s.reduce((a, [r, g, b]) => a + (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, 0) / s.length;
}

function upright(stage, mood, palette, yaw, pitch = 0.05) {
  const scene = stage.scene(mood);
  const h = makeHeadphones({ palette });
  h.rotation.set(pitch, yaw, 0);
  scene.add(h);
  return scene;
}

const color = palette => (stage, aspect, t) => {
  if (t.mobile) {
    // Mobile shows only a narrow vertical strip of this 16:9 image (down to ~22% of its width):
    // a centred side profile fits there, like the original upright pen.
    const scene = upright(stage, 'gradient', palette, -Math.PI / 2 + 0.14, 0);
    return { scene, camera: frame(cam(), aspect, { target: [-0.2, CENTER_Y, 0], dir: [0, 0.05, 1], fit: [62, 31], fov: 14 }) };
  }
  return {
    scene: upright(stage, 'gradient', palette, -0.55, 0.06),
    camera: frame(cam(), aspect, { target: [0, CENTER_Y, 0], dir: [0.04, 0.12, 1], fit: [27, 30] }),
  };
};

// Side profile: the right cup faces the camera and the headband rises above it.
function profile(stage, aspect, palette) {
  const scene = stage.scene('gradient');
  const h = makeHeadphones({ palette });
  h.rotation.y = -Math.PI / 2 + 0.14;
  const g = new THREE.Group();
  g.add(h);
  if (aspect > 1.6) g.rotation.z = -Math.PI / 2; // horizontal strip: lay it on its side
  scene.add(g);
  const box = aspect > 1.6 ? [26, 12.5] : [12.5, 25];
  const target = aspect > 1.6 ? [CENTER_Y, -0.2, 0] : [-0.2, CENTER_Y, 0];
  // long lens: less perspective, so the near cup does not dwarf the rest
  return { scene, camera: frame(cam(), aspect, { target, dir: [0, 0.05, 1], fit: box, fov: 14 }) };
}

export function heroFrame(stage, aspect, p) {
  // Scroll animation: from a close-up of the right cup to the full headphones.
  const e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
  const scene = upright(stage, 'gradient', 'silver', -0.55 + 0.25 * (1 - e), 0.06);
  const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
  const target = lerp([9.2, 1.2, 3.5], [-2.6, CENTER_Y - 1.8, 0]);
  const dir = lerp([0.55, 0.05, 1], [0.04, 0.12, 1]);
  const fitH = Math.exp(Math.log(7) + (Math.log(27) - Math.log(7)) * e);
  return { scene, camera: frame(cam(), aspect, { target, dir, fit: [fitH * 1.1, fitH] }) };
}

const ease = p => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

// "Who it's for" video: on white, from the logo on the right cup back to the whole headphones.
const rotY = ([x, y, z], a) => [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)];

export function whoFrame(stage, aspect, p) {
  const e = ease(p);
  const yaw = -0.95 + 0.45 * e;
  const scene = upright(stage, 'light', 'graphite', yaw, 0.04);
  const lerp = (a, b) => a.map((v, i) => v + (b[i] - v) * e);
  // start on the logo of the right cup (wherever the rotation puts it)
  const target = lerp(rotY([HP.cupX + HP.depth / 2, 0.4, 0], yaw), [0, CENTER_Y, 0]);
  const dir = lerp(rotY([1, 0.12, 0.3], yaw), [0.12, 0.1, 1]);
  const fitH = Math.exp(Math.log(5.5) + (Math.log(29) - Math.log(5.5)) * e);
  return { scene, camera: frame(cam(), aspect, { target, dir, fit: [fitH * 1.2, fitH] }) };
}

// Details video: slow macro travel along the headband, from the right slider over the top.
export function detailsFrame(stage, aspect, p) {
  // From the top of the headband, along it to the slider, then down the steel rod to the cup.
  const scene = upright(stage, 'light', 'graphite', 0, 0);
  const s = ease(p);
  let x, y;
  if (s < 0.72) {
    const a = 0.25 + (Math.PI / 2 - 0.25) * (s / 0.72);
    x = (HP.cupX + 0.02) * Math.sin(a);
    y = HP.bandEnd + (HP.bandTop - HP.bandEnd) * Math.cos(a);
  } else {
    x = HP.cupX;
    y = HP.bandEnd - (HP.bandEnd - HP.cupH / 2 - 0.8) * ((s - 0.72) / 0.28);
  }
  return { scene, camera: frame(cam(), aspect, { target: [x, y - 0.3, 0.4], dir: [0.5 + 0.25 * s, 0.3 - 0.15 * s, 1], fit: [10, 5.6], mode: 'cover' }) };
}

export const SHOTS = {
  'color-silver': color('silver'),
  'color-graphite': color('graphite'),
  'color-blue': color('blue'),
  'color-red': color('red'),
  'color-orange': color('orange'),

  'order-popup': (stage, aspect) => ({
    scene: upright(stage, 'gradient', 'blue', -0.95, 0.08),
    camera: frame(cam(), aspect, { target: [0, CENTER_Y, 0], dir: [0.1, 0.1, 1], fit: [30, 28] }),
  }),

  'hero-mobile': (stage, aspect) => profile(stage, aspect, 'silver'),
  'specs-profile': (stage, aspect) => profile(stage, aspect, 'graphite'),
  'hero-lottie': (stage, aspect) => heroFrame(stage, aspect, 1),

  'paper-folded': (stage, aspect) => {
    const scene = stage.scene('dark', { ground: 0, shadow: 0.55 });
    scene.add(folded('graphite'));
    return { scene, camera: frame(cam(), aspect, { target: [0, 0, 0], dir: [0, 1, -0.2], up: [0, 0, 1], fit: [32, 30] }) };
  },
  'paper-cushion': (stage, aspect) => ({
    scene: upright(stage, 'dark', 'graphite', 0, 0),
    camera: frame(cam(), aspect, { target: [-6.9, 0.6, 0.4], dir: [0.8, 0.35, 0.9], fit: [11, 9], mode: 'cover' }),
  }),
  'paper-case': (stage, aspect) => {
    const scene = stage.scene('dark', { ground: 0, shadow: 0.55, shadowSize: 40 });
    const h = folded('graphite');
    h.position.x = -10;
    h.rotation.y = 0.12;
    const c = makeCase();
    c.position.set(13, CASE_HALF_HEIGHT, 1);
    c.rotation.y = -0.35;
    scene.add(h, c);
    return { scene, camera: frame(cam(), aspect, { target: [1.5, 0, 0], dir: [0, 1, 0.22], up: [0, 0, -1], fit: [50, 32] }) };
  },
  'paper-phone': (stage, aspect) => {
    const scene = stage.scene('dark', { ground: 0, shadow: 0.55, shadowSize: 40 });
    const p = makePhone();
    p.rotation.set(-Math.PI / 2, 0, 0.32);
    p.position.set(-1, 0.58, 0);
    const h = folded('graphite');
    h.position.set(21, 0, -2);
    h.rotation.y = 0.9;
    scene.add(p, h);
    return { scene, camera: frame(cam(), aspect, { target: [0.5, 0, 0.5], dir: [0.15, 1, 0.45], up: [0, 0, -1], fit: [21, 17.5] }) };
  },

  'inside-box': (stage, aspect) => {
    const scene = stage.scene('light', { ground: 0, shadow: 0.28, shadowSize: 40 });
    const box = makeBox();
    const h = folded('graphite');
    h.position.y = box.userData.floorY;
    const cable = makeCable('#3a3b3e');
    cable.scale.setScalar(0.8);
    cable.position.set(0, box.userData.floorY, 6.5);
    scene.add(box, h, cable);
    // Tablet/mobile crops: the section's text sits over the top of the image, so push the box down.
    const narrow = aspect < 1.6;
    return { scene, camera: frame(cam(), aspect, { target: [0, 3, narrow ? 5.5 : 0], dir: [0, 1, -0.1], up: [0, 0, 1], fit: narrow ? [40, 44] : [35, 31] }) };
  },
  'inside-cup': (stage, aspect, t) => {
    if (t.mobile) {
      // Like the original pen: lying across the lower half, running off the right edge.
      const scene = stage.scene('light');
      const h = makeHeadphones({ palette: 'graphite' });
      h.rotation.y = -Math.PI / 2; // pure side view: the far cup hides behind the near one
      const g = new THREE.Group();
      g.add(h);
      g.rotation.z = -Math.PI / 2;
      scene.add(g);
      return { scene, camera: frame(cam(), aspect, { target: [8, 3.6, 0], dir: [0, 0.1, 1], fit: [22, 22], mode: 'cover', fov: 18 }) };
    }
    return {
      scene: upright(stage, 'light', 'graphite', -0.35, 0),
      camera: frame(cam(), aspect, { target: [8.6, 4.2, 1.5], dir: [0.6, 0.18, 1], fit: [15, 15], mode: 'cover' }),
    };
  },
  'inside-case': (stage, aspect, t) => {
    const scene = stage.scene('light', { ground: -CASE_HALF_HEIGHT, shadow: 0.3 });
    const c = makeCase();
    c.rotation.y = 0.55;
    scene.add(c);
    // on mobile the text sits over the top: keep the case in the lower part
    const view = t.mobile ? { target: [0, 5.5, 0], fit: [27, 31] } : { target: [0, -0.4, 0], fit: [25, 19] };
    return { scene, camera: frame(cam(), aspect, { ...view, dir: [0.55, 0.62, 1] }) };
  },
  'inside-case-top': (stage, aspect) => {
    const scene = stage.scene('light', { ground: -CASE_HALF_HEIGHT, shadow: 0.3 });
    const c = makeCase();
    c.rotation.y = -0.4;
    const cable = makeCable('#3a3b3e');
    cable.position.set(9, -CASE_HALF_HEIGHT, 9);
    scene.add(c, cable);
    return { scene, camera: frame(cam(), aspect, { target: [2, 0, 2], dir: [0.1, 1, 0.35], up: [0, 0, -1], fit: [29, 29] }) };
  },

  'detail-band': (stage, aspect, t) => ({
    scene: upright(stage, t.mood, autoPalette(t.bg), 0, 0),
    camera: frame(cam(), aspect, { target: [0, HP.bandTop + 0.6, 0.3], dir: [0.35, 0.8, 0.9], fit: [10, 7], mode: 'cover' }),
  }),
  // captioned "Refined colors" on the site, over a blue background: shown in Mist Blue
  'detail-arm': (stage, aspect, t) => ({
    scene: upright(stage, t.mood, 'blue', 0, 0),
    camera: frame(cam(), aspect, { target: [HP.cupX, 7.6, 0], dir: [0.5, 0.12, 1], fit: [5.5, 9.5], mode: 'cover' }),
  }),
  'detail-button': (stage, aspect, t) => ({
    scene: upright(stage, t.mood, autoPalette(t.bg), 0, 0),
    camera: frame(cam(), aspect, { target: [HP.cupX - 0.2, 1.0, -3.9], dir: [0.5, 0.2, -1], fit: [6.5, 5], mode: 'cover' }),
  }),
  'detail-cup-edge': (stage, aspect, t) => ({
    scene: upright(stage, t.mood, autoPalette(t.bg), -0.2, 0),
    camera: frame(cam(), aspect, { target: [8.6, -2.2, 2.8], dir: [0.35, -0.2, 1], fit: [10, 6.5], mode: 'cover' }),
  }),
  'detail-cushion': (stage, aspect, t) => ({
    scene: upright(stage, t.mood, autoPalette(t.bg), 0, 0),
    camera: frame(cam(), aspect, { target: [-6.5, 0.8, 1.2], dir: [1, 0.25, 0.55], fit: [4.4, 5.8], mode: 'cover' }),
  }),
};

// Mood for shots that adapt to the original's background.
export function moodFor(bg) {
  const l = luminance(bg);
  return l < 0.2 ? 'dark' : l > 0.6 ? 'light' : 'gradient';
}
