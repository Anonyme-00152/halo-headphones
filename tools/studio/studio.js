// Studio: analyses the original visuals, then renders the HALO versions at the same paths.
import * as THREE from 'three';
import { Stage, sampleBackground, backgroundCanvas, toBlob, save } from './stage.js';
import { SHOTS, moodFor, heroFrame, whoFrame, detailsFrame, ogFrame, heroMobileFrame } from './shots.js';
import { encodeMp4, rebuildLottie } from './video.js';

const ANIMATIONS = { 'video-who': whoFrame, 'video-details': detailsFrame, 'hero-lottie': heroFrame };

const stage = new Stage();
const log = msg => {
  const el = document.getElementById('log');
  el.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n` + el.textContent;
};
const targets = await (await fetch('targets.json', { cache: 'no-store' })).json();
let analysis = {};
try { analysis = await (await fetch('analysis.json', { cache: 'no-store' })).json(); } catch {}

const loadImage = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });

async function originalSource(t) {
  const src = `/original-assets/${t.path}`;
  if (t.format === 'MP4') {
    const v = document.createElement('video');
    v.muted = true; v.src = src;
    await new Promise(r => (v.onloadeddata = r));
    v.currentTime = 0.1;
    await new Promise(r => (v.onseeked = r));
    return [v, v.videoWidth, v.videoHeight];
  }
  if (t.format === 'Lottie JSON') {
    const j = await (await fetch(src)).json();
    const img = await loadImage(j.assets.at(-1).p);
    return [img, img.width, img.height];
  }
  const img = await loadImage(src);
  return [img, img.naturalWidth, img.naturalHeight];
}

// The original tablet/mobile spec photos lost their transparency (saved as JPEG → black box on a
// white section). They are .webp files, so we render them with real transparency instead.
const FORCE_TRANSPARENT = /scene2-adaptive(480|768)/;

async function analyze() {
  for (const t of targets) {
    const [source, w, h] = await originalSource(t);
    analysis[t.path] = sampleBackground(source, w, h);
    if (FORCE_TRANSPARENT.test(t.path)) analysis[t.path].transparent = true;
  }
  await save('tools/studio/analysis.json', new Blob([JSON.stringify(analysis, null, 1)]));
  log(`analyse : ${Object.keys(analysis).length} originaux`);
  return analysis;
}

function dispose(scene) {
  scene.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) [].concat(o.material).forEach(m => m.dispose());
  });
}

function draw(shot, w, h, bg, extra = {}) {
  const t = { bg, mood: bg ? moodFor(bg) : 'light', ...extra };
  // Tablet/mobile-only crops often carry the section's text over their top part.
  t.mobile = !!(extra.widths && extra.widths.length && extra.widths.every(x => x < 992));
  const { scene, camera } = SHOTS[shot](stage, w / h, t);
  const background = bg && !bg.transparent ? backgroundCanvas(bg, w, h) : null;
  const canvas = stage.render(scene, camera, w, h, { background });
  dispose(scene);
  return canvas;
}

async function renderTarget(t, { to = t.path } = {}) {
  const bg = analysis[t.path];
  if (!bg) throw new Error('lance d’abord l’analyse');
  const canvas = draw(t.shot, t.w, t.h, bg, { widths: t.widths });
  const blob = await toBlob(canvas, t.format, bg.transparent);
  await save(to, blob);
  show(canvas);
  return canvas;
}

function show(canvas) {
  const p = document.getElementById('preview');
  p.width = canvas.width; p.height = canvas.height;
  p.getContext('2d').drawImage(canvas, 0, 0);
}

// Preview a shot into tools/studio/out/ without touching the site.
async function preview(shot, index = 0) {
  const list = targets.filter(t => t.shot === shot);
  const t = list[Math.min(index, list.length - 1)];
  const name = `tools/studio/out/${shot}_${t.w}x${t.h}.${t.format === 'PNG' ? 'png' : 'jpg'}`;
  await renderTarget({ ...t, format: t.format === 'PNG' ? 'PNG' : 'JPG' }, { to: name });
  log(`aperçu ${name}`);
  return name;
}

// One labelled thumbnail per target (or per shot) in a single image, to review framing quickly.
async function contactSheet({ shots = null, all = false, cell = 360, cols = 4, name = 'contact' } = {}) {
  let list = targets.filter(t => SHOTS[t.shot] && !['MP4', 'Lottie JSON'].includes(t.format) && (!shots || shots.includes(t.shot)));
  if (!all) list = list.filter((t, i) => list.findIndex(u => u.shot === t.shot) === i);
  const rows = Math.ceil(list.length / cols);
  const sheet = document.createElement('canvas');
  sheet.width = cols * cell; sheet.height = rows * (cell + 22);
  const g = sheet.getContext('2d');
  g.fillStyle = '#777'; g.fillRect(0, 0, sheet.width, sheet.height);
  list.forEach((t, i) => {
    const s = cell / Math.max(t.w, t.h);
    const w = Math.max(2, Math.round(t.w * s)), h = Math.max(2, Math.round(t.h * s));
    const bg = analysis[t.path];
    const c = draw(t.shot, w, h, bg, { widths: t.widths });
    const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 22);
    g.drawImage(c, x + (cell - w) / 2, y + (cell - h) / 2);
    g.fillStyle = '#fff'; g.font = '13px Inter, Arial';
    g.fillText(`${t.shot} ${t.w}×${t.h}`, x + 6, y + cell + 16);
  });
  const path = `tools/studio/out/${name}.jpg`;
  await save(path, await toBlob(sheet, 'JPG'));
  return path;
}

// Frames of the hero scroll animation (p from 0 to 1) side by side.
async function heroSheet(ps = [0, 0.2, 0.4, 0.6, 0.8, 1], w = 640, h = 360) {
  const t = targets.find(x => x.shot === 'hero-lottie');
  const bg = analysis[t.path];
  const sheet = document.createElement('canvas');
  sheet.width = w * 2; sheet.height = h * Math.ceil(ps.length / 2);
  const g = sheet.getContext('2d');
  ps.forEach((p, i) => {
    const { scene, camera } = heroFrame(stage, w / h, p);
    const c = stage.render(scene, camera, w, h, { background: backgroundCanvas(bg, w, h) });
    dispose(scene);
    g.drawImage(c, (i % 2) * w, Math.floor(i / 2) * h);
  });
  const path = 'tools/studio/out/hero-sheet.jpg';
  await save(path, await toBlob(sheet, 'JPG'));
  return path;
}

// Videos and the hero Lottie. `to` lets a preview go to tools/studio/out/ instead of the site.
async function renderAnimation(t, { to = t.path, ss = 1.5 } = {}) {
  const fn = ANIMATIONS[t.shot];
  const bg = analysis[t.path];
  const bgCache = {};
  const drawFrame = (p, w = t.w, h = t.h) => {
    const background = (bgCache[`${w}x${h}`] ??= backgroundCanvas(bg, w, h));
    const { scene, camera } = fn(stage, w / h, p);
    const c = stage.render(scene, camera, w, h, { background, ss });
    dispose(scene);
    return c;
  };
  const onProgress = (i, n) => { if (i % 10 === 0 || i === n) log(`${t.shot} ${i}/${n}`); };
  let blob;
  if (t.format === 'MP4') {
    blob = await encodeMp4({ w: t.w, h: t.h, duration: t.duration, drawFrame, onProgress });
  } else {
    const original = await (await fetch(`/original-assets/${t.path}`)).json();
    blob = await rebuildLottie({ original, drawFrame, onProgress });
  }
  await save(to, blob);
  log(`${to} : ${Math.round(blob.size / 1024)} Ko`);
  return { path: to, kb: Math.round(blob.size / 1024) };
}

// Portrait hero sequence for phones, packed like the desktop Lottie (one JSON, frames as data URIs).
// assets/halo-mobile.js draws these frames on a canvas as the visitor scrolls.
async function renderHeroMobile({ to = 'f/hero-mobile.json', frames = 60, w = 720, h = 1280, quality = 0.7 } = {}) {
  const hero = targets.find(t => t.shot === 'hero-lottie');
  const background = backgroundCanvas(analysis[hero.path], w, h);
  const out = { v: '5.7.4', fr: 15, ip: 0, op: frames, w, h, nm: 'hero-mobile', assets: [] };
  for (let i = 0; i < frames; i++) {
    const { scene, camera } = heroMobileFrame(stage, w / h, i / (frames - 1));
    const c = stage.render(scene, camera, w, h, { background, ss: 1.5 });
    dispose(scene);
    out.assets.push({ id: `image_${i}`, w, h, e: 1, p: c.toDataURL('image/webp', quality) });
    if (i % 10 === 0) log(`hero mobile ${i}/${frames}`);
    if (i === frames - 1) show(c);
    await new Promise(r => setTimeout(r, 0));
  }
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  await save(to, blob);
  return { to, kb: Math.round(blob.size / 1024) };
}

// Link preview image (WhatsApp, LinkedIn…): last hero frame + name and tagline in the site's fonts.
async function renderOg({ to = 'og-image.jpg', w = 1200, h = 630 } = {}) {
  const hero = targets.find(t => t.shot === 'hero-lottie');
  const { scene, camera } = ogFrame(stage, w / h);
  const c = stage.render(scene, camera, w, h, { background: backgroundCanvas(analysis[hero.path], w, h) });
  dispose(scene);
  await Promise.all([document.fonts.load('400 96px "Instrument Serif"'), document.fonts.load('500 32px Inter')]);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.font = '500 34px Inter';
  g.fillText('HALO', 64, 92);
  g.font = '400 92px "Instrument Serif"';
  g.fillText('Headphones', 60, h - 150);
  g.fillText('for deep focus', 60, h - 66);
  const blob = await toBlob(c, 'JPG');
  await save(to, blob);
  show(c);
  return { to, kb: Math.round(blob.size / 1024) };
}

async function renderAll(filter = () => true) {
  const list = targets.filter(t => (SHOTS[t.shot] || ANIMATIONS[t.shot]) && filter(t));
  let n = 0;
  for (const t of list) {
    if (ANIMATIONS[t.shot]) await renderAnimation(t);
    else await renderTarget(t);
    n++;
    log(`${n}/${list.length}  ${t.path}`);
    await new Promise(r => setTimeout(r, 0));
  }
  return n;
}

window.studio = { targets, analyze, preview, renderTarget, renderAnimation, renderAll, renderOg, renderHeroMobile, contactSheet, heroSheet, get analysis() { return analysis; }, stage, THREE };

const sel = document.getElementById('shot');
[...new Set(targets.map(t => t.shot))].filter(s => SHOTS[s]).forEach(s => sel.add(new Option(s, s)));
document.getElementById('btn-analyze').onclick = () => analyze();
document.getElementById('btn-preview').onclick = () => preview(sel.value);
document.getElementById('btn-all').onclick = async () => log(`terminé : ${await renderAll()} fichiers`);
log(`${targets.length} cibles, analyse ${Object.keys(analysis).length ? 'chargée' : 'à faire'}`);
