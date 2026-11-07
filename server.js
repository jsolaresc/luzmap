// LuzMap — mapeo de proyección liviano. Sin dependencias: solo Node.js.
// Uso: node server.js [puerto]
// Proyector:  http://localhost:8080/display
// Celular:    http://IP-DEL-PROYECTOR:8080
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10);
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const MEDIA = path.join(ROOT, 'media');
const STATE_FILE = path.join(ROOT, 'state.json');
if (!fs.existsSync(MEDIA)) fs.mkdirSync(MEDIA, { recursive: true });

const DEFAULT_STATE = { rev: 0, calib: true, blackout: false, sel: null, selPt: 0, zones: [] };
let state = DEFAULT_STATE;
try { state = Object.assign({}, DEFAULT_STATE, JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch (e) {}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(STATE_FILE + '.tmp', JSON.stringify(state), (err) => {
      if (!err) fs.rename(STATE_FILE + '.tmp', STATE_FILE, () => {});
    });
  }, 800);
}

const clients = new Set();
function broadcast(from) {
  const msg = 'data: ' + JSON.stringify({ from: from || '', state }) + '\n\n';
  for (const res of clients) { try { res.write(msg); } catch (e) {} }
}
setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch (e) {} } }, 15000);

function lanIPs() {
  const out = [];
  try {
    const ifs = os.networkInterfaces();
    for (const name in ifs) for (const a of ifs[name]) {
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
    }
  } catch (e) { /* Android 11+ en Termux puede bloquear esto */ }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska'
};

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function serveFile(req, res, file) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('No encontrado'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range) { // los videos necesitan Range para loop/seek
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      let start = m && m[1] ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (start >= st.size) { res.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); return res.end(); }
      end = Math.min(end, st.size - 1);
      res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes',
      'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'max-age=3600' });
    fs.createReadStream(file).pipe(res);
  });
}

function safeName(n) {
  n = path.basename(String(n || 'archivo')).replace(/[^\w.\-]+/g, '_').slice(-80);
  return n || 'archivo';
}

function readBody(req, limit, cb) {
  let size = 0; const chunks = [];
  req.on('data', (c) => { size += c.length; if (size > limit) { req.destroy(); return; } chunks.push(c); });
  req.on('end', () => cb(Buffer.concat(chunks)));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = decodeURIComponent(u.pathname);

  if (p === '/' || p === '/control') return serveFile(req, res, path.join(PUB, 'control.html'));
  if (p === '/display') return serveFile(req, res, path.join(PUB, 'display.html'));
  if (p.startsWith('/lib/')) return serveFile(req, res, path.join(PUB, safeName(p.slice(5))));

  if (p === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 1500\n');
    res.write('data: ' + JSON.stringify({ from: '', state }) + '\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (p === '/api/info') return sendJSON(res, 200, { ips: lanIPs(), port: PORT });
  if (p === '/api/state' && req.method === 'GET') return sendJSON(res, 200, state);
  if (p === '/api/state' && (req.method === 'POST' || req.method === 'PUT')) {
    return readBody(req, 2e6, (buf) => {
      try {
        const next = JSON.parse(buf.toString('utf8'));
        if (!next || !Array.isArray(next.zones)) throw new Error('estado inválido');
        state = Object.assign({}, DEFAULT_STATE, next, { rev: (state.rev || 0) + 1 });
        broadcast(u.searchParams.get('from'));
        saveSoon();
        sendJSON(res, 200, { ok: true, rev: state.rev });
      } catch (e) { sendJSON(res, 400, { error: e.message }); }
    });
  }

  if (p === '/api/media' && req.method === 'GET') {
    return fs.readdir(MEDIA, (err, files) => {
      const list = (files || []).filter((f) => !f.startsWith('.')).map((f) => {
        const ext = path.extname(f).toLowerCase();
        return { name: f, url: '/media/' + encodeURIComponent(f),
          kind: /\.(mp4|m4v|webm|mov|mkv)$/.test(ext) ? 'video' : 'image' };
      });
      sendJSON(res, 200, list);
    });
  }
  if (p === '/api/media' && req.method === 'DELETE') {
    const f = path.join(MEDIA, safeName(u.searchParams.get('name')));
    return fs.unlink(f, () => sendJSON(res, 200, { ok: true }));
  }
  if (p === '/api/upload' && req.method === 'POST') {
    let name = safeName(u.searchParams.get('name'));
    const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
    let i = 1;
    while (fs.existsSync(path.join(MEDIA, name))) name = base + '_' + (i++) + ext;
    const out = fs.createWriteStream(path.join(MEDIA, name));
    req.pipe(out);
    out.on('finish', () => sendJSON(res, 200, { ok: true, name, url: '/media/' + encodeURIComponent(name) }));
    out.on('error', (e) => sendJSON(res, 500, { error: e.message }));
    return;
  }
  if (p.startsWith('/media/')) return serveFile(req, res, path.join(MEDIA, safeName(p.slice(7))));

  res.writeHead(404); res.end('No encontrado');
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = lanIPs();
  console.log('\n  LuzMap funcionando\n');
  console.log('  Proyector:  http://localhost:' + PORT + '/display');
  if (ips.length) ips.forEach((ip) => console.log('  Celular:    http://' + ip + ':' + PORT));
  else console.log('  Celular:    http://<IP del proyector>:' + PORT + '   (la IP está en Ajustes > Wi-Fi del proyector)');
  console.log('');
});
