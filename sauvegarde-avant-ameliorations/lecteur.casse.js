(() => {
'use strict';
const I = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
  next: '<svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg>',
  prev: '<svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zM9.5 12l8.5 6V6z"/></svg>',
  rep: '<svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>',
  down: '<svg viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>'
};
const css = `
body{padding-bottom:150px!important}
.lp{display:flex;align-items:center;gap:12px;margin-top:10px}
.lp .lpb{flex:none;width:44px;height:44px;border-radius:50%;border:0;padding:0;display:flex;align-items:center;justify-content:center;color:#000;background:linear-gradient(135deg,#f5d77a,#d4af37 50%,#9c7a1c);box-shadow:0 2px 10px rgba(212,175,55,.3)}
.lp .lpb svg{width:22px;height:22px;fill:#000}
.lp .lps{flex:1;height:22px;display:flex;align-items:center;cursor:pointer;touch-action:none}
.lp .lps:before{content:"";display:block;width:100%;height:4px;border-radius:4px;background:#3a3a3a}
.lp .lps i{position:absolute;height:4px;border-radius:4px;background:#d4af37;width:0;pointer-events:none}
.lp .lps{position:relative}.lp .lps i{left:0}
.lp .lpt{flex:none;min-width:70px;text-align:right;font-size:12px;color:#b3b3b3;font-variant-numeric:tabular-nums}
.lp.on .lpt{color:#f0d77a}
#mp{position:fixed;left:8px;right:8px;bottom:62px;z-index:25;background:#1b1810;border:1px solid #3d3416;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.6);transition:transform .25s}
#mp.hid{transform:translateY(400%);visibility:hidden;pointer-events:none}
#mp .mpg{height:2px;background:#3a3a3a}#mp .mpg i{display:block;height:100%;width:0;background:#d4af37}
#mp .mpr{display:flex;align-items:center;gap:10px;padding:8px 10px}
#mp img,#fp img{object-fit:cover;background:#2a2a2a}
#mp img{width:44px;height:44px;border-radius:8px;flex:none}
#mp .mpt{flex:1;min-width:0}
#mp .mpt b,#mp .mpt small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mp .mpt b{font-size:14px;color:#fff}#mp .mpt small{font-size:12px;color:#b3b3b3}
.ib{background:none;border:0;color:#fff;padding:6px;display:flex;align-items:center;justify-content:center}
.ib svg{width:26px;height:26px;fill:currentColor}
.ib.big{width:68px;height:68px;border-radius:50%;color:#000;background:linear-gradient(135deg,#f5d77a,#d4af37 50%,#9c7a1c);box-shadow:0 6px 20px rgba(212,175,55,.4)}
.ib.big svg{width:34px;height:34px}
.ib.on{color:#d4af37}
#fp{position:fixed;inset:0;z-index:70;background:linear-gradient(#4a3a12,#0b0b0b 70%);display:flex;flex-direction:column;padding:16px 24px 28px;transform:translateY(100%);transition:transform .3s cubic-bezier(.2,.8,.2,1);visibility:hidden}
#fp.open{transform:none;visibility:visible}
#fp .fh{display:flex;justify-content:space-between;align-items:center;color:#f0d77a;font-family:Georgia,serif;letter-spacing:.5px}
#fp .fc{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:12px 0}
#fp img{width:min(78vw,52vh);height:min(78vw,52vh);border-radius:14px;box-shadow:0 20px 50px rgba(0,0,0,.6)}
#fp .ft b{display:block;font-size:22px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#fp .ft small{display:block;font-size:15px;color:#b3b3b3;margin-top:4px}
#fp input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:24px;background:transparent;margin:14px 0 0;padding:0}
#fp input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:4px;background:linear-gradient(90deg,#d4af37 var(--p,0%),#3a3a3a var(--p,0%))}
#fp input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#f5d77a;margin-top:-6px}
#fp input[type=range]::-moz-range-track{height:4px;border-radius:4px;background:#3a3a3a}
#fp input[type=range]::-moz-range-progress{height:4px;border-radius:4px;background:#d4af37}
#fp input[type=range]::-moz-range-thumb{width:16px;height:16px;border:0;border-radius:50%;background:#f5d77a}
#fp .tm{display:flex;justify-content:space-between;font-size:12px;color:#b3b3b3;font-variant-numeric:tabular-nums}
#fp .ctl{display:flex;align-items:center;justify-content:space-between;margin-top:14px}
#fp .ctl .ib svg{width:30px;height:30px}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

const au = new Audio(); au.preload = 'metadata';
let cur = '', repeat = false, drag = false;
const $ = s => document.querySelector(s);
const fmt = s => { if (!isFinite(s) || s < 0) return '0:00'; s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const host = document.createElement('div');
host.innerHTML = `
<div id="mp" class="hid"><div class="mpg"><i id="mpg"></i></div>
 <div class="mpr"><img id="mpi" alt=""><div class="mpt"><b id="mpn"></b><small id="mpa"></small></div>
  <button class="ib" id="mpp" type="button" aria-label="Lecture">${I.play}</button>
  <button class="ib" id="mpx" type="button" aria-label="Suivant">${I.next}</button></div></div>
<div id="fp" role="dialog" aria-label="En lecture">
 <div class="fh"><button class="ib" id="fcl" type="button" aria-label="Réduire">${I.down}</button><span>En lecture</span><span style="width:38px"></span></div>
 <div class="fc"><img id="fpi" alt=""></div>
 <div class="ft"><b id="fpn"></b><small id="fpa"></small></div>
 <input id="fs" type="range" min="0" max="1000" value="0" aria-label="Position">
 <div class="tm"><span id="fcur">0:00</span><span id="fdur">0:00</span></div>
 <div class="ctl">
  <button class="ib" id="frep" type="button" aria-label="Répéter">${I.rep}</button>
  <button class="ib" id="fprev" type="button" aria-label="Précédent">${I.prev}</button>
  <button class="ib big" id="fpp" type="button" aria-label="Lecture">${I.play}</button>
  <button class="ib" id="fnext" type="button" aria-label="Suivant">${I.next}</button>
  <span style="width:38px"></span>
 </div></div>`;
document.body.appendChild(host);

/* ---------- Transformation des <audio controls> en lecteur personnalisé ---------- */
function enhance() {
  let n = 0;
  document.querySelectorAll('audio:not([data-lp])').forEach(a => {
    if (!a.getAttribute('src')) return;
    a.dataset.lp = '1'; a.controls = false; a.preload = 'none'; a.style.display = 'none';
    const d = document.createElement('div');
    d.className = 'lp'; d.dataset.src = a.getAttribute('src');
    d.innerHTML = `<button class="lpb" type="button" aria-label="Lecture">${I.play}</button><div class="lps"><i></i></div><span class="lpt">0:00</span>`;
    a.after(d); n++;
  });
  if (n) sync();
}
const items = () => [...document.querySelectorAll('audio[data-lp]')].map(a => a.getAttribute('src'));
function meta(src) {
  const a = [...document.querySelectorAll('audio[data-lp]')].find(x => x.getAttribute('src') === src);
  const c = a && a.closest('.rel, .jc');
  const img = c && c.querySelector('img'), t = c && c.querySelector('b'), s = c && c.querySelector('small');
  return { title: t ? t.textContent : 'Morceau', artist: s ? s.textContent.split('·')[0].trim() : '', cover: img ? img.getAttribute('src') : '' };
}

/* ---------- Lecture ---------- */
function jouer(src) {
  if (src !== cur) { cur = src; au.src = src; majMeta(); }
  au.play().catch(() => {});
}
function majMeta() {
  const m = meta(cur);
  $('#mpn').textContent = $('#fpn').textContent = m.title;
  $('#mpa').textContent = $('#fpa').textContent = m.artist;
  $('#mpi').src = $('#fpi').src = m.cover;
  $('#mp').classList.remove('hid');
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: m.title, artist: m.artist, artwork: m.cover ? [{ src: new URL(m.cover, location.href).href, sizes: '512x512' }] : [] });
    } catch (e) {}
  }
}
function voisin(delta) {
  const l = items(); if (!l.length) return;
  let i = l.indexOf(cur); i = i < 0 ? 0 : (i + delta + l.length) % l.length;
  jouer(l[i]);
}
function toggle() { if (!cur) return; au.paused ? au.play().catch(() => {}) : au.pause(); }
function sync() {
  const p = !au.paused && !au.ended;
  const d = au.duration, t = au.currentTime, pct = d > 0 ? Math.min(100, t / d * 100) : 0;
  document.querySelectorAll('.lp').forEach(el => {
    const me = el.dataset.src === cur;
    el.classList.toggle('on', me);
    el.querySelector('.lpb').innerHTML = me && p ? I.pause : I.play;
    el.querySelector('i').style.width = me ? pct + '%' : '0';
    el.querySelector('.lpt').textContent = me ? fmt(t) + ' / ' + fmt(d) : '';
  });
  $('#mpp').innerHTML = $('#fpp').innerHTML = p ? I.pause : I.play;
  $('#mpg').style.width = pct + '%';
  if (!drag) { $('#fs').value = d > 0 ? Math.round(t / d * 1000) : 0; $('#fs').style.setProperty('--p', pct + '%'); $('#fcur').textContent = fmt(t); }
  $('#fdur').textContent = fmt(d);
}
['timeupdate', 'play', 'pause', 'ended', 'loadedmetadata', 'durationchange'].forEach(e => au.addEventListener(e, sync));
au.addEventListener('ended', () => { if (repeat) { au.currentTime = 0; au.play().catch(() => {}); } else voisin(1); });

/* ---------- Actions ---------- */
document.addEventListener('click', e => {
  const lp = e.target.closest('.lp');
  if (!lp) return;
  const src = lp.dataset.src;
  if (e.target.closest('.lps') && src === cur && au.duration > 0) {
    const r = lp.querySelector('.lps').getBoundingClientRect();
    au.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * au.duration; sync(); return;
  }
  if (e.target.closest('.lpb') || e.target.closest('.lps')) src === cur ? toggle() : jouer(src);
});
$('#mpp').onclick = toggle; $('#fpp').onclick = toggle;
$('#mpx').onclick = () => voisin(1); $('#fnext').onclick = () => voisin(1);
$('#fprev').onclick = () => { if (au.currentTime > 3) au.currentTime = 0; else voisin(-1); };
$('#frep').onclick = () => { repeat = !repeat; $('#frep').classList.toggle('on', repeat); };
$('#mp').addEventListener('click', e => { if (!e.target.closest('button')) $('#fp').classList.add('open'); });
$('#fcl').onclick = () => $('#fp').classList.remove('open');
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#fp').classList.remove('open'); });
const fs = $('#fs');
fs.addEventListener('input', () => { drag = true; const d = au.duration || 0; $('#fcur').textContent = fmt(fs.value / 1000 * d); fs.style.setProperty('--p', fs.value / 10 + '%'); });
fs.addEventListener('change', () => { if (au.duration > 0) au.currentTime = fs.value / 1000 * au.duration; drag = false; sync(); });

if ('mediaSession' in navigator) {
  const h = (n, f) => { try { navigator.mediaSession.setActionHandler(n, f); } catch (e) {} };
  h('play', () => au.play()); h('pause', () => au.pause());
  h('previoustrack', () => voisin(-1)); h('nexttrack', () => voisin(1));
  h('seekto', d => { if (d.seekTime != null) au.currentTime = d.seekTime; });
}

let tmr;
new MutationObserver(() => { clearTimeout(tmr); tmr = setTimeout(enhance, 30); }).observe(document.body, { childList: true, subtree: true });
enhance();
})();

document.addEventListener('click', e => {
  const img = e.target.closest('#list > div > img');
  if (!img) return;
  const a = img.closest('#list > div').querySelector('audio');
  if (!a) return;
  document.querySelectorAll('#list audio').forEach(x => { if (x !== a) x.pause(); });
  a.paused ? a.play() : a.pause();
});

(function(){
  const bar=document.createElement('div');
  bar.id='miniplayer';
  bar.innerHTML='<img id="mp-cover" alt=""><div id="mp-info"><b id="mp-title"></b><small id="mp-artist"></small></div><button id="mp-btn">▶</button><button id="mp-close">✕</button><div id="mp-bar"><span id="mp-cur">0:00</span><input type="range" id="mp-seek" min="0" max="1000" value="0"><span id="mp-dur">0:00</span></div>';
  document.body.appendChild(bar);
  const $=id=>document.getElementById(id);
  const fmt=s=>isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
  let cur=null,drag=false;
  const inList=e=>e.target.closest&&e.target.closest('#list');
  document.addEventListener('play',e=>{
    if(!inList(e))return;
    cur=e.target;
    const card=cur.closest('#list > div');
    $('mp-cover').src=card.querySelector('img').src;
    $('mp-title').textContent=card.querySelector('b').textContent;
    $('mp-artist').textContent=card.querySelector('small').textContent.split('·')[0].trim();
    $('mp-btn').textContent='❚❚';
    bar.classList.add('on');
  },true);
  document.addEventListener('pause',e=>{ if(e.target===cur) $('mp-btn').textContent='▶'; },true);
  document.addEventListener('ended',e=>{ if(e.target===cur){ $('mp-btn').textContent='▶'; $('mp-seek').value=0; } },true);
  document.addEventListener('timeupdate',e=>{
    if(e.target!==cur)return;
    if(!drag) $('mp-seek').value=(cur.currentTime/cur.duration*1000)||0;
    $('mp-cur').textContent=fmt(cur.currentTime);
    $('mp-dur').textContent=fmt(cur.duration);
  },true);
  $('mp-btn').onclick=()=>{ if(cur) cur.paused?cur.play():cur.pause(); };
  $('mp-close').onclick=()=>{ if(cur) cur.pause(); bar.classList.remove('on'); };
  $('mp-seek').addEventListener('input',e=>{ drag=true; if(cur&&cur.duration) cur.currentTime=e.target.value/1000*cur.duration; });
  $('mp-seek').addEventListener('change',()=>{ drag=false; });
})();

(function(){
  const set=()=>{const e=document.getElementById('mp-seek'); if(e) e.style.setProperty('--p',(e.value/10)+'%');};
  ['timeupdate','input','ended'].forEach(t=>document.addEventListener(t,set,true));
})();

(function(){
  const set=()=>{const e=document.getElementById('mp-seek'); if(e) e.style.setProperty('--p',(e.value/10)+'%');};
  ['timeupdate','input','ended'].forEach(t=>document.addEventListener(t,set,true));
})();

(function(){
  if(document.querySelector('link[href*="mini-lecteur"]')) return;
  const l=document.createElement('link');
  l.rel='stylesheet'; l.href='/mini-lecteur.css?v=1';
  document.head.appendChild(l);
})();
