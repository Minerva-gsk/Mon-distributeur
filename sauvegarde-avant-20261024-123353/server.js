'use strict';
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { DatabaseSync } = require('node:sqlite');

process.on('unhandledRejection', e => console.error('Erreur non gérée :', e));
process.on('uncaughtException', e => console.error('Exception :', e));

fs.mkdirSync('uploads', { recursive: true });

/* ---------- Base de données ---------- */
const db = new DatabaseSync('musique.db');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT, email TEXT UNIQUE, salt TEXT, hash TEXT, liens TEXT,
  cree TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER,
  cree TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titre TEXT, artiste TEXT, genre TEXT, langue TEXT,
  date_sortie TEXT, isrc TEXT, explicite INTEGER DEFAULT 0,
  plateformes TEXT, offre TEXT, audio TEXT, pochette TEXT,
  statut TEXT DEFAULT 'En attente',
  user_id INTEGER, a_juger INTEGER DEFAULT 0,
  cree TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes (
  user_id INTEGER, release_id INTEGER,
  PRIMARY KEY (user_id, release_id));
CREATE TABLE IF NOT EXISTS ratings (
  user_id INTEGER, release_id INTEGER, note INTEGER,
  PRIMARY KEY (user_id, release_id));
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id INTEGER, user_id INTEGER, texte TEXT,
  cree TEXT DEFAULT CURRENT_TIMESTAMP);
`);
for (const sql of [
  'ALTER TABLE releases ADD COLUMN user_id INTEGER',
  'ALTER TABLE releases ADD COLUMN a_juger INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN liens TEXT'
]) { try { db.exec(sql); } catch (e) {} }
db.exec(`
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_releases_user ON releases(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_release ON comments(release_id);
`);
const purge = () => { try { db.exec("DELETE FROM sessions WHERE cree < datetime('now','-30 days')"); } catch (e) {} };
purge();
setInterval(purge, 3600000).unref();

/* ---------- Outils ---------- */
const CTRL = /[\u0000-\u001f\u007f]/g;
const clean = (v, max = 200) => String(v == null ? '' : v).replace(CTRL, '').trim().slice(0, max);
const bad = (res, m, code = 400) => res.status(code).json({ ok: false, erreur: m });
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
function checkPw(pw, salt, hash) {
  const a = Buffer.from(hashPw(pw, salt), 'hex');
  const b = Buffer.from(hash || '', 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const DUMMY_SALT = crypto.randomBytes(16).toString('hex');
const DUMMY_HASH = hashPw('dummy', DUMMY_SALT);

const FAIBLES = new Set(['12345678', '123456789', '1234567890', '87654321', 'password', 'password1',
  'motdepasse', 'motdepasse1', 'azertyuiop', 'azerty123', 'qwertyuiop', 'qwerty123',
  '11111111', '00000000', 'abcdefgh', 'iloveyou', 'musique123']);
function verifMdp(pw) {
  if (pw.length < 8 || pw.length > 100) return 'Mot de passe : 8 caractères minimum';
  if (FAIBLES.has(pw.toLowerCase())) return 'Mot de passe trop courant, choisis-en un autre';
  return '';
}

/* Verrouillage par compte après trop d'échecs */
const echecs = new Map();
const FENETRE = 15 * 60 * 1000;
function verrouille(email) {
  const f = echecs.get(email);
  return !!f && f.n >= 8 && Date.now() - f.t < FENETRE;
}
function echec(email) {
  const now = Date.now();
  if (echecs.size > 5000) echecs.clear();
  const f = echecs.get(email);
  if (!f || now - f.t > FENETRE) echecs.set(email, { n: 1, t: now });
  else { f.n++; f.t = now; }
}

/* ---------- Sessions ---------- */
function getCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map(c => c.trim())
    .find(c => c.startsWith(name + '='));
  if (!m) return null;
  try { return decodeURIComponent(m.slice(name.length + 1)); } catch (e) { return null; }
}
const cookieOpts = req =>
  'HttpOnly; SameSite=Lax; Path=/' + (req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '');
function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(sha(token), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token NOT IN ' +
    '(SELECT token FROM sessions WHERE user_id = ? ORDER BY cree DESC, rowid DESC LIMIT 10)').run(userId, userId);
  res.setHeader('Set-Cookie', 'sid=' + token + '; Max-Age=2592000; ' + cookieOpts(req));
}
function currentUser(req) {
  const t = getCookie(req, 'sid');
  if (!t) return null;
  return db.prepare(
    "SELECT u.id, u.nom, u.email, u.cree FROM sessions s JOIN users u ON u.id = s.user_id " +
    "WHERE s.token = ? AND s.cree > datetime('now','-30 days')").get(sha(t)) || null;
}
function requireAuth(req, res, next) {
  const u = currentUser(req);
  if (!u) return bad(res, 'Connexion requise', 401);
  req.user = u;
  next();
}

/* ---------- Envoi de fichiers ---------- */
const AUDIO_EXT = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg'];
const IMG_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) =>
    cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase())
});
const upload = multer({
  storage,
  limits: { fileSize: 80 * 1024 * 1024, files: 2, fields: 20, fieldSize: 4096 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const ok = file.fieldname === 'audio'
      ? file.mimetype.startsWith('audio/') && AUDIO_EXT.includes(ext)
      : file.fieldname === 'pochette' && file.mimetype.startsWith('image/') && IMG_EXT.includes(ext);
    cb(null, ok);
  }
});
const rm = f => { try { fs.unlinkSync(f.path); } catch (e) {} };
function sniffOk(file, kind) {
  let b;
  try {
    const fd = fs.openSync(file.path, 'r');
    b = Buffer.alloc(16);
    fs.readSync(fd, b, 0, 16, 0);
    fs.closeSync(fd);
  } catch (e) { return false; }
  const asc = (o, n) => b.toString('latin1', o, o + n);
  if (kind === 'audio') {
    return asc(0, 3) === 'ID3' || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)
      || asc(0, 4) === 'fLaC' || asc(0, 4) === 'OggS'
      || (asc(0, 4) === 'RIFF' && asc(8, 4) === 'WAVE') || asc(4, 4) === 'ftyp';
  }
  return (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)
    || (b[0] === 0x89 && asc(1, 3) === 'PNG')
    || (asc(0, 4) === 'RIFF' && asc(8, 4) === 'WEBP');
}

/* ---------- Limiteurs ---------- */
const mk = (windowMs, limit, erreur) => rateLimit({ windowMs, limit, message: { ok: false, erreur } });
const authLimiter = mk(15 * 60 * 1000, 20, 'Trop de tentatives, réessaie dans 15 minutes');
const registerLimiter = mk(60 * 60 * 1000, 5, 'Trop de créations de compte depuis cette connexion, réessaie plus tard');
const actionLimiter = mk(60 * 1000, 30, 'Doucement, réessaie dans une minute');
const uploadLimiter = mk(60 * 60 * 1000, 20, "Trop d'envois, réessaie plus tard");
const globalLimiter = mk(60 * 1000, 300, 'Trop de requêtes, ralentis un peu');

/* ---------- Application ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self' 'unsafe-inline'; " +
    "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; " +
    "base-uri 'none'; form-action 'self'; object-src 'none'");
  if (req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  }
  next();
});

/* Refuse les requêtes d'écriture venues d'un autre site */
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const o = req.headers.origin;
  if (!o) return next();
  let h = '';
  try { h = new URL(o).host; } catch (e) {}
  if (h && (h === req.headers.host || h === req.headers['x-forwarded-host'])) return next();
  return bad(res, 'Origine refusée', 403);
});

app.use('/api', globalLimiter);
app.use(express.json({ limit: '10kb' }));
app.use(express.static('public', { dotfiles: 'deny' }));
app.use('/uploads', requireAuth, express.static('uploads', {
  dotfiles: 'deny', index: false,
  setHeaders: res => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
  }
}));

/* ---------- Comptes ---------- */
app.post('/api/register', registerLimiter, authLimiter, (req, res) => {
  const b = req.body || {};
  const nom = clean(b.nom, 60);
  const email = clean(b.email, 120).toLowerCase();
  const pw = String(b.password || '');
  if (nom.length < 2) return bad(res, "Nom d'artiste : 2 à 60 caractères");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad(res, 'E-mail invalide');
  const m = verifMdp(pw);
  if (m) return bad(res, m);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return bad(res, 'Cet e-mail est déjà utilisé');
  const salt = crypto.randomBytes(16).toString('hex');
  let id;
  try {
    id = Number(db.prepare('INSERT INTO users (nom, email, salt, hash) VALUES (?, ?, ?, ?)')
      .run(nom, email, salt, hashPw(pw, salt)).lastInsertRowid);
  } catch (e) { return bad(res, 'Cet e-mail est déjà utilisé'); }
  startSession(req, res, id);
  res.json({ ok: true });
});

app.post('/api/login', authLimiter, (req, res) => {
  const b = req.body || {};
  const email = clean(b.email, 120).toLowerCase();
  const pw = String(b.password || '').slice(0, 100);
  if (verrouille(email)) return bad(res, "Trop d'échecs pour ce compte, réessaie dans 15 minutes", 429);
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = u ? checkPw(pw, u.salt, u.hash) : (checkPw(pw, DUMMY_SALT, DUMMY_HASH), false);
  if (!ok) { echec(email); return bad(res, 'E-mail ou mot de passe incorrect', 401); }
  echecs.delete(email);
  startSession(req, res, u.id);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  const t = getCookie(req, 'sid');
  if (t) db.prepare('DELETE FROM sessions WHERE token = ?').run(sha(t));
  res.setHeader('Set-Cookie', 'sid=; Max-Age=0; ' + cookieOpts(req));
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const u = currentUser(req);
  res.json(u ? { ok: true, nom: u.nom, email: u.email, depuis: u.cree } : { ok: false });
});

app.post('/api/compte/nom', requireAuth, actionLimiter, (req, res) => {
  const nom = clean((req.body || {}).nom, 60);
  if (nom.length < 2) return bad(res, "Nom d'artiste : 2 à 60 caractères");
  db.prepare('UPDATE users SET nom = ? WHERE id = ?').run(nom, req.user.id);
  res.json({ ok: true, nom });
});

app.post('/api/compte/mot-de-passe', requireAuth, authLimiter, (req, res) => {
  const b = req.body || {};
  const actuel = String(b.actuel || '').slice(0, 100);
  const nouveau = String(b.nouveau || '');
  const m = verifMdp(nouveau);
  if (m) return bad(res, m);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!u || !checkPw(actuel, u.salt, u.hash)) return bad(res, 'Mot de passe actuel incorrect', 401);
  const salt = crypto.randomBytes(16).toString('hex');
  db.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?').run(salt, hashPw(nouveau, salt), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  startSession(req, res, u.id);
  res.json({ ok: true });
});

app.get('/api/compte/stats', requireAuth, (req, res) => {
  const id = req.user.id;
  const st = db.prepare(`SELECT
    (SELECT COUNT(*) FROM releases WHERE user_id = ?) AS sorties,
    (SELECT COUNT(*) FROM likes l JOIN releases r ON r.id = l.release_id WHERE r.user_id = ?) AS likes,
    (SELECT COUNT(*) FROM comments c JOIN releases r ON r.id = c.release_id WHERE r.user_id = ?) AS commentaires,
    (SELECT AVG(n.note) FROM ratings n JOIN releases r ON r.id = n.release_id WHERE r.user_id = ?) AS moyenne`)
    .get(id, id, id, id);
  res.json({ ok: true, ...st });
});

/* ---------- Liens vers les plateformes ---------- */
const DOMS = {
  spotify: ['open.spotify.com', 'spotify.link'],
  apple: ['music.apple.com'],
  deezer: ['deezer.com', 'deezer.page.link'],
  youtube: ['youtube.com', 'youtu.be'],
  boomplay: ['boomplay.com'],
  audiomack: ['audiomack.com'],
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com']
};
const parseLiens = v => {
  try { const o = JSON.parse(v || '{}'); return o && typeof o === 'object' ? o : {}; }
  catch (e) { return {}; }
};
function cleanUrl(plat, v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (v.length > 300) return null;
  let u;
  try { u = new URL(v); } catch (e) { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  return DOMS[plat].some(d => h === d || h.endsWith('.' + d)) ? u.href : null;
}
app.get('/api/compte/liens', requireAuth, (req, res) => {
  const row = db.prepare('SELECT liens FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, liens: parseLiens(row && row.liens) });
});
app.post('/api/compte/liens', requireAuth, actionLimiter, (req, res) => {
  const inp = (req.body || {}).liens || {};
  const out = {};
  for (const plat of Object.keys(DOMS)) {
    const c = cleanUrl(plat, inp[plat]);
    if (c === null) return bad(res, 'Lien ' + plat + ' invalide : adresse https du site officiel requise');
    if (c) out[plat] = c;
  }
  db.prepare('UPDATE users SET liens = ? WHERE id = ?').run(JSON.stringify(out), req.user.id);
  res.json({ ok: true, liens: out });
});

/* ---------- Sorties ---------- */
const PLATS_OK = ['Spotify', 'Apple Music', 'Deezer', 'YouTube Music', 'Boomplay', 'Audiomack'];

app.get('/api/releases', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM releases WHERE user_id = ? ORDER BY id DESC').all(req.user.id));
});

app.post('/api/releases', requireAuth, uploadLimiter,
  upload.fields([{ name: 'audio', maxCount: 1 }, { name: 'pochette', maxCount: 1 }]),
  (req, res) => {
    const a = req.files && req.files.audio && req.files.audio[0];
    const c = req.files && req.files.pochette && req.files.pochette[0];
    const refuse = msg => { if (a) rm(a); if (c) rm(c); return bad(res, msg); };
    if (!a || !c) return refuse('Audio (mp3, wav, flac, m4a, ogg) et pochette (jpg, png, webp) requis');
    if (!sniffOk(a, 'audio') || !sniffOk(c, 'image')) return refuse('Fichier invalide ou corrompu');
    const b = req.body || {};
    const titre = clean(b.titre, 150);
    const artiste = clean(b.artiste, 100);
    if (!titre || !artiste) return refuse('Titre et artiste requis');
    const date = clean(b.date_sortie, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return refuse('Date de sortie invalide');
    const isrc = clean(b.isrc, 20).toUpperCase();
    if (isrc && !/^[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}$/.test(isrc)) return refuse('Code ISRC invalide');
    const n = db.prepare('SELECT COUNT(*) AS n FROM releases WHERE user_id = ?').get(req.user.id).n;
    if (n >= 100) return refuse('Limite de 100 sorties atteinte');
    const plats = [].concat(b.plateformes || []).map(p => clean(p, 30)).filter(p => PLATS_OK.includes(p)).join(', ');
    db.prepare(`INSERT INTO releases
      (titre,artiste,genre,langue,date_sortie,isrc,explicite,plateformes,offre,audio,pochette,user_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(titre, artiste, clean(b.genre, 40), clean(b.langue, 40), date, isrc, b.explicite ? 1 : 0,
           plats, clean(b.offre, 60), '/uploads/' + a.filename, '/uploads/' + c.filename, req.user.id);
    res.json({ ok: true });
  });

/* ---------- Page « À juger » ---------- */
const idOf = req => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : 0; };
const visible = (id, uid) =>
  db.prepare('SELECT id, user_id FROM releases WHERE id = ? AND (a_juger = 1 OR user_id = ?)').get(id, uid);

app.post('/api/releases/:id/juger', requireAuth, actionLimiter, (req, res) => {
  const rel = db.prepare('SELECT id, user_id, a_juger FROM releases WHERE id = ?').get(idOf(req));
  if (!rel || rel.user_id !== req.user.id) return bad(res, 'Morceau introuvable');
  const v = rel.a_juger ? 0 : 1;
  db.prepare('UPDATE releases SET a_juger = ? WHERE id = ?').run(v, rel.id);
  res.json({ ok: true, a_juger: v });
});

app.get('/api/juger', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT r.id, r.titre, r.artiste, r.genre, r.pochette, r.audio, r.user_id,
      (SELECT COUNT(*) FROM likes l WHERE l.release_id = r.id) AS likes,
      (SELECT COUNT(*) FROM likes l WHERE l.release_id = r.id AND l.user_id = ?) AS aime,
      (SELECT AVG(note) FROM ratings n WHERE n.release_id = r.id) AS moyenne,
      (SELECT COUNT(*) FROM ratings n WHERE n.release_id = r.id) AS nb_notes,
      (SELECT note FROM ratings n WHERE n.release_id = r.id AND n.user_id = ?) AS ma_note,
      (SELECT COUNT(*) FROM comments c WHERE c.release_id = r.id) AS nb_coms,
      (SELECT liens FROM users u WHERE u.id = r.user_id) AS liens
    FROM releases r WHERE r.user_id IS NOT NULL AND r.a_juger = 1 ORDER BY r.id DESC LIMIT 100`)
    .all(req.user.id, req.user.id);
  res.json(rows.map(({ user_id, ...x }) =>
    ({ ...x, liens: parseLiens(x.liens), aime: x.aime > 0, mien: user_id === req.user.id })));
});

app.post('/api/releases/:id/like', requireAuth, actionLimiter, (req, res) => {
  const rel = visible(idOf(req), req.user.id);
  if (!rel) return bad(res, 'Morceau introuvable');
  const has = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND release_id = ?').get(req.user.id, rel.id);
  if (has) db.prepare('DELETE FROM likes WHERE user_id = ? AND release_id = ?').run(req.user.id, rel.id);
  else db.prepare('INSERT INTO likes (user_id, release_id) VALUES (?, ?)').run(req.user.id, rel.id);
  const n = db.prepare('SELECT COUNT(*) AS n FROM likes WHERE release_id = ?').get(rel.id).n;
  res.json({ ok: true, aime: !has, likes: n });
});

app.post('/api/releases/:id/note', requireAuth, actionLimiter, (req, res) => {
  const rel = visible(idOf(req), req.user.id);
  if (!rel) return bad(res, 'Morceau introuvable');
  const note = Number((req.body || {}).note);
  if (!Number.isInteger(note) || note < 1 || note > 5) return bad(res, 'Note de 1 à 5');
  db.prepare(`INSERT INTO ratings (user_id, release_id, note) VALUES (?, ?, ?)
    ON CONFLICT(user_id, release_id) DO UPDATE SET note = excluded.note`).run(req.user.id, rel.id, note);
  const st = db.prepare('SELECT AVG(note) AS m, COUNT(*) AS n FROM ratings WHERE release_id = ?').get(rel.id);
  res.json({ ok: true, ma_note: note, moyenne: st.m, nb_notes: st.n });
});

app.get('/api/releases/:id/comments', requireAuth, (req, res) => {
  const rel = visible(idOf(req), req.user.id);
  if (!rel) return res.json([]);
  res.json(db.prepare(`SELECT c.id, c.texte, c.cree, u.nom FROM comments c
    JOIN users u ON u.id = c.user_id WHERE c.release_id = ? ORDER BY c.id DESC LIMIT 50`).all(rel.id));
});

app.post('/api/releases/:id/comments', requireAuth, actionLimiter, (req, res) => {
  const rel = visible(idOf(req), req.user.id);
  if (!rel) return bad(res, 'Morceau introuvable');
  const texte = clean((req.body || {}).texte, 300);
  if (!texte) return bad(res, 'Commentaire vide');
  db.prepare('INSERT INTO comments (release_id, user_id, texte) VALUES (?, ?, ?)').run(rel.id, req.user.id, texte);
  const n = db.prepare('SELECT COUNT(*) AS n FROM comments WHERE release_id = ?').get(rel.id).n;
  res.json({ ok: true, nb_coms: n });
});

/* ---------- Erreurs ---------- */
app.use('/api', (req, res) => bad(res, 'Introuvable', 404));
app.use((err, req, res, next) => {
  const limite = err && typeof err.code === 'string' && err.code.startsWith('LIMIT_');
  if (!limite) console.error(err);
  if (res.headersSent) return next(err);
  bad(res, err && err.code === 'LIMIT_FILE_SIZE' ? 'Fichier trop volumineux (80 Mo maximum)' : 'Requête invalide');
});

app.listen(3000, '127.0.0.1', () => console.log('Serveur sur http://localhost:3000 (accès local uniquement)'));
