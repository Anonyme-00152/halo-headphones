// Applique le contenu de content/ (textes, textes alternatifs, meta, logos SVG) à index.htm.
// Usage : node build.js
//
// content/content.json  → les textes, à modifier librement
// content/logo-*.svg     → les logos, à remplacer par les tiens
// content/_map.json      → où chaque texte va dans la page (ne pas modifier)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PAGE = path.join(ROOT, 'index.htm');
const BACKUP = path.join(ROOT, 'index.original.htm');
const CONTENT_DIR = path.join(ROOT, 'content');

class BuildError extends Error {}

// Comment les retours à la ligne ("\n") d'un texte sont rendus selon l'endroit de la page.
const FILTERS = {
  br: lines => lines.join('<br>'),
  space: lines => lines.join(' '),
  'space-br': lines => lines.join(' <br>'),
  'br-first': ([first, ...rest]) => (rest.length ? `${first}<br>${rest.join(' ')}` : first),
  'nowrap-rest': ([first, ...rest]) =>
    rest.length ? `${first} <span style="white-space:pre">${rest.join(' ')}</span>` : first,
  'pre-split': ([first, ...rest]) =>
    `<span style="white-space:pre">${first}</span>` +
    (rest.length ? `<span style="white-space:normal"> ${rest.join(' ')}</span>` : ''),
};

const escText = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');

function escAttr(s, quote) {
  const r = escText(s).replace(/\n/g, ' ');
  return quote === '"' ? r.replace(/"/g, '&quot;') : r.replace(/'/g, '&#39;');
}

function lookup(content, key) {
  return key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), content);
}

function render(tpl, content, quote) {
  return tpl.replace(/\{\{([\w.]+)(?:\|([\w-]+))?\}\}/g, (_, key, filter = 'br') => {
    const value = lookup(content, key);
    if (typeof value !== 'string') {
      throw new BuildError(`texte manquant dans content.json : « ${key} »`);
    }
    if (quote) return escAttr(value, quote);
    if (!FILTERS[filter]) throw new BuildError(`filtre inconnu « ${filter} » dans _map.json`);
    return FILTERS[filter](value.split('\n').map(escText));
  });
}

function replaceOnce(html, re, fn, what) {
  let count = 0;
  const out = html.replace(re, (...args) => {
    count++;
    return fn(...args);
  });
  if (count !== 1) {
    throw new BuildError(`${what} : trouvé ${count} fois dans index.htm (attendu : 1)`);
  }
  return out;
}

function readSvg(file) {
  const raw = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  const start = raw.indexOf('<svg');
  const end = raw.lastIndexOf('</svg>');
  if (start < 0 || end < 0) throw new BuildError(`${file} ne contient pas de balise <svg>`);
  return raw.slice(start, end + '</svg>'.length);
}

function applyTarget(html, t, content) {
  switch (t.type) {
    case 'text':
      return replaceOnce(
        html,
        new RegExp(`(<(\\w+)\\b[^>]*\\bid='${t.id}'[^>]*>\\s*<span class='text-block-wrap-div'>)([\\s\\S]*?)(</span>\\s*</\\2>)`, 'g'),
        (_, open, tag, inner, close) => open + render(t.tpl, content) + close,
        `texte #${t.id}`
      );
    case 'attr':
      return replaceOnce(
        html,
        new RegExp(`<\\w+\\b[^>]*\\bid='${t.id}'[^>]*>`, 'g'),
        tagHtml =>
          replaceOnce(
            tagHtml,
            new RegExp(`(\\b${t.attr}=')([^']*)(')`, 'g'),
            (_, a, v, b) => a + render(t.tpl, content, "'") + b,
            `attribut ${t.attr} de #${t.id}`
          ),
        `élément #${t.id}`
      );
    case 'title':
      return replaceOnce(html, /<title>[\s\S]*?<\/title>/g, () => `<title>${render(t.tpl, content, '"')}</title>`, '<title>');
    case 'meta':
      return replaceOnce(
        html,
        new RegExp(`(<meta (?:property|name)="${t.name.replace(/[.:]/g, '\\$&')}" content=")([^"]*)(")`, 'g'),
        (_, a, v, b) => a + render(t.tpl, content, '"') + b,
        `<meta ${t.name}>`
      );
    case 'lang':
      return replaceOnce(html, /(<html lang=')([^']*)(')/g, (_, a, v, b) => a + render(t.tpl, content, "'") + b, '<html lang>');
    case 'svg': {
      const svg = readSvg(t.file);
      return replaceOnce(
        html,
        new RegExp(`(<span\\b[^>]*\\bid='${t.id}'[^>]*>\\s*)<svg[\\s\\S]*?</svg>`, 'g'),
        (_, open) => open + svg,
        `logo #${t.id}`
      );
    }
    default:
      throw new BuildError(`type de cible inconnu « ${t.type} » dans _map.json`);
  }
}

function leafKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    if (k.startsWith('_')) return [];
    const key = prefix + k;
    return v !== null && typeof v === 'object' ? leafKeys(v, key + '.') : [key];
  });
}

function readJson(file) {
  const text = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8');
  try {
    return JSON.parse(text);
  } catch (e) {
    const at = e.message.match(/line (\d+) column (\d+)/);
    const where = at ? `ligne ${at[1]}, colonne ${at[2]}` : e.message;
    throw new BuildError(`${file} n'est pas un JSON valide (${where}) : virgule, guillemet ou accolade oublié juste avant ?`);
  }
}

function build({ log = console.log } = {}) {
  const content = readJson('content.json');
  const targets = readJson('_map.json');
  const original = fs.readFileSync(PAGE, 'utf8');

  let html = original;
  for (const t of targets) html = applyTarget(html, t, content);

  const used = new Set(targets.flatMap(t => [...(t.tpl || '').matchAll(/\{\{([\w.]+)/g)].map(m => m[1])));
  const unused = leafKeys(content).filter(k => !used.has(k));
  for (const k of unused) log(`⚠ clé ignorée (elle n'existe pas dans la page) : « ${k} »`);

  const changed = html !== original;
  if (changed) {
    if (!fs.existsSync(BACKUP)) fs.copyFileSync(PAGE, BACKUP);
    fs.writeFileSync(PAGE, html);
  }
  return { changed, targets: targets.length, unused };
}

module.exports = { build, BuildError, CONTENT_DIR, FILTERS, render };

if (require.main === module) {
  try {
    const r = build();
    console.log(r.changed ? `✓ index.htm mis à jour (${r.targets} emplacements)` : '✓ index.htm déjà à jour');
  } catch (e) {
    console.error(`✗ ${e instanceof BuildError ? e.message : e.stack}`);
    process.exit(1);
  }
}
