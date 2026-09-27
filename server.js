// Serveur statique local pour la copie de nota.uprock.pro (aucune dépendance).
// Usage : node server.js  [PORT=8090 par défaut]
//
// - Réapplique content/ à index.htm à chaque sauvegarde (voir build.js).
// - Recharge le navigateur tout seul quand le contenu ou une image/vidéo change.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { build, BuildError, CONTENT_DIR } = require('./build');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8090;

const MIME = {
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Injecté dans les pages servies (pas dans les fichiers) : rechargement auto + bandeau d'erreur.
const LIVE_RELOAD = `<script>(()=>{const es=new EventSource('/__livereload');es.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='reload')return location.reload();let b=document.getElementById('__build_error');if(!b){b=document.createElement('div');b.id='__build_error';b.style.cssText='position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:12px 16px;background:#b00020;color:#fff;font:14px/1.4 system-ui,sans-serif;white-space:pre-wrap';document.body.appendChild(b)}b.textContent='Erreur dans content/ : '+m.message}})()</script>`;

const clients = new Set();
function notify(message) {
  for (const res of clients) res.write(`data: ${JSON.stringify(message)}\n\n`);
}

function rebuild() {
  try {
    if (build().changed) console.log('✓ content/ appliqué à index.htm');
    return true;
  } catch (e) {
    const message = e instanceof BuildError ? e.message : e.stack;
    console.error(`✗ ${message}`);
    notify({ type: 'error', message });
    return false;
  }
}

function watch(dir, onChange) {
  let timer;
  try {
    fs.watch(dir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 200);
    });
  } catch (e) {
    console.warn(`(pas de surveillance de ${path.basename(dir)}/ : ${e.message})`);
  }
}

rebuild();
watch(CONTENT_DIR, () => rebuild() && notify({ type: 'reload' }));
for (const dir of ['thumb', 'd', 'f']) watch(path.join(ROOT, dir), () => notify({ type: 'reload' }));

function resolvePath(urlPath) {
  let p;
  try {
    p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (p === '/' || p === '') p = '/index.htm';
  const full = path.normalize(path.join(ROOT, p));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

// Utilisé par tools/studio : enregistre un rendu. Local uniquement, et seulement pour remplacer
// un visuel existant ou écrire un aperçu dans tools/studio/out/.
const STUDIO_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg', '.mp4', '.json']);
function studioSave(req, res) {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const rel = new URL(req.url, 'http://x').searchParams.get('path') || '';
  const file = path.normalize(path.join(ROOT, rel));
  const preview = file.startsWith(path.join(ROOT, 'tools', 'studio', 'out') + path.sep);
  const ok = local && file.startsWith(ROOT + path.sep) && STUDIO_EXT.has(path.extname(file).toLowerCase()) &&
    (preview || fs.existsSync(file));
  if (!ok) return res.writeHead(403, { 'Content-Type': 'text/plain' }).end('refusé');
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    const buf = Buffer.concat(chunks);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buf);
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, bytes: buf.length }));
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/__studio/save')) return studioSave(req, res);
  if (req.url === '/__livereload') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': ok\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  const file = resolvePath(req.url);
  if (!file) {
    res.writeHead(400).end('Bad request');
    return;
  }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      console.log(`404 ${req.url}`);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }

    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache',
    };

    if (ext === '.htm' || ext === '.html') {
      fs.readFile(file, 'utf8', (err, html) => {
        if (err) return res.writeHead(500).end(String(err));
        // Pas de rechargement auto pour le studio : il écrit lui-même dans les dossiers surveillés.
        const reload = file.startsWith(path.join(ROOT, 'tools') + path.sep) ? '' : LIVE_RELOAD;
        const i = html.lastIndexOf('</body>');
        const body = i < 0 ? html + reload : html.slice(0, i) + reload + html.slice(i);
        res.writeHead(200, { ...headers, 'Content-Length': Buffer.byteLength(body) });
        res.end(req.method === 'HEAD' ? undefined : body);
      });
      return;
    }

    // Les vidéos pilotées au scroll ont besoin des requêtes Range pour pouvoir "seek".
    const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range) {
      let start = range[1] === '' ? stat.size - Number(range[2]) : Number(range[1]);
      let end = range[1] !== '' && range[2] !== '' ? Number(range[2]) : stat.size - 1;
      end = Math.min(end, stat.size - 1);
      if (start < 0 || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Content-Length': end - start + 1,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, { ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

server.on('error', e => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`✗ Le port ${PORT} est déjà utilisé : le site tourne sûrement déjà dans une autre fenêtre.`);
  console.error(`  Ferme-la, ou lance sur un autre port :  set PORT=8091 && node server.js`);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Site en local       : http://localhost:${PORT}/`);
  console.log(`Checklist visuels   : http://localhost:${PORT}/checklist-visuels.html`);
  console.log('Textes              : content/content.json (sauvegarde = page rechargée)');
});
