'use strict';
const crypto = require('crypto');
const fs = require('fs');

/* ---------- Clé secrète du serveur (fichier .cle, créé une seule fois) ---------- */
function chargerCle(fichier = '.cle') {
  try {
    const k = Buffer.from(fs.readFileSync(fichier, 'utf8').trim(), 'hex');
    if (k.length === 32) return k;
  } catch (e) {}
  const k = crypto.randomBytes(32);
  fs.writeFileSync(fichier, k.toString('hex'), { mode: 0o600 });
  return k;
}

/* ---------- Chiffrement des secrets (AES-256-GCM) ---------- */
function chiffrer(cle, texte) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', cle, iv);
  const data = Buffer.concat([c.update(String(texte), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('hex')).join('.');
}
function dechiffrer(cle, valeur) {
  try {
    const [iv, tag, data] = String(valeur).split('.').map(h => Buffer.from(h, 'hex'));
    const d = crypto.createDecipheriv('aes-256-gcm', cle, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch (e) { return null; }
}

/* ---------- Comparaison à temps constant ---------- */
function egal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------- Base32 + TOTP (RFC 4648 / RFC 6238) ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = ((val << 8) | b) & 0xFFFFF;
    bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function b32dec(s) {
  let bits = 0, val = 0;
  const out = [];
  for (const c of String(s).toUpperCase()) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    val = ((val << 5) | i) & 0xFFFFF;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(secret, counter, digits = 6) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secret).update(b).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, '0');
}
const nouveauSecretTotp = () => b32enc(crypto.randomBytes(20));

/* Retourne le compteur validé (pour interdire le rejeu) ou null */
function verifierTotp(secretB32, code, dernier = 0, maintenant = Date.now()) {
  code = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return null;
  const sec = b32dec(secretB32);
  const c = Math.floor(maintenant / 30000);
  for (let d = -1; d <= 1; d++) {
    if (egal(hotp(sec, c + d), code) && c + d > dernier) return c + d;
  }
  return null;
}

/* ---------- Codes de récupération ---------- */
function codesRecuperation(n = 8) {
  return Array.from({ length: n }, () => {
    const h = crypto.randomBytes(5).toString('hex');
    return h.slice(0, 5) + '-' + h.slice(5);
  });
}
const normaliserRecup = c => String(c || '').trim().toLowerCase().replace(/\s/g, '');

module.exports = {
  chargerCle, chiffrer, dechiffrer, egal,
  b32enc, b32dec, hotp, nouveauSecretTotp, verifierTotp,
  codesRecuperation, normaliserRecup
};
