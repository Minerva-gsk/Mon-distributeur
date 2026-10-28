(function(){
  const css=`
#nb{position:fixed;top:14px;right:68px;width:40px;height:40px;border:none;border-radius:50%;background:rgba(0,0,0,.45);color:#f0d36e;font-size:1.2rem;z-index:60}
#nb i{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#d4af37;color:#111;font:700 .7rem/18px sans-serif;display:none}
#nb i.on{display:block}
#np{position:fixed;right:10px;top:62px;width:min(320px,calc(100vw - 20px));max-height:55vh;overflow:auto;background:rgba(28,28,28,.88);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid rgba(212,175,55,.35);border-radius:14px;box-shadow:0 10px 25px rgba(0,0,0,.5);z-index:1000;display:none}
#np.on{display:block}
#np h4{margin:0;padding:12px 14px;color:#f0d36e;font-size:.95rem}
#np p{margin:0;padding:10px 14px;border-top:1px solid rgba(255,255,255,.07);color:#ddd;font-size:.88rem}
#np p.nl{background:rgba(212,175,55,.1)}
#np small{display:block;color:#999;margin-top:2px;font-size:.75rem}
#toast{position:fixed;left:50%;top:70px;transform:translate(-50%,-8px);padding:10px 18px;background:rgba(28,28,28,.95);border:1px solid rgba(212,175,55,.35);border-radius:999px;color:#f0d36e;font-size:.9rem;box-shadow:0 10px 25px rgba(0,0,0,.5);z-index:1100;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s}
#toast.on{opacity:1;transform:translate(-50%,0)}`;
  const st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  const b=document.createElement('button'); b.id='nb'; b.setAttribute('aria-label','Notifications'); b.innerHTML='🔔<i></i>';
  const p=document.createElement('div'); p.id='np'; p.setAttribute('role','dialog'); p.setAttribute('aria-label','Notifications');
  const t=document.createElement('div'); t.id='toast'; t.setAttribute('role','status');
  document.body.append(b,p,t);
  const bd=b.querySelector('i');
  const vus=new Set();
  const post=url=>typeof api==='function'?api(url):fetch(url,{method:'POST',credentials:'same-origin'});
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fmt=d=>{try{return new Date(String(d).replace(' ','T')+'Z').toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});}catch(e){return d;}};
  let tt;
  function toast(m){t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),2200);}
  const av=document.querySelector('[id*="avatar" i],[class*="avatar" i],#me,#moi');
  if(av&&!av.getAttribute('aria-label')){av.setAttribute('aria-label','Mon compte');if(!av.getAttribute('role'))av.setAttribute('role','button');}
  async function charger(){
    try{
      const r=await fetch('/api/notifications',{credentials:'same-origin'});
      if(!r.ok)return null;
      const d=await r.json(); if(!d.ok)return null;
      bd.textContent=d.nonLues>99?'99+':d.nonLues;
      bd.classList.toggle('on',d.nonLues>0);
      p.innerHTML='<h4>Notifications</h4>'+d.liste.map(n=>'<p class="'+(n.lu?'':'nl')+'">'+esc(n.texte)+'<small>'+fmt(n.date)+'</small></p>').join('');
      return d;
    }catch(e){return null;}
  }
  b.onclick=async()=>{
    if(p.classList.contains('on')){p.classList.remove('on');return;}
    const d=await charger();
    if(!d){toast('Notifications indisponibles');return;}
    if(!d.liste.length){toast('Aucune notification');return;}
    p.classList.add('on');
    if(d.nonLues>0){try{await post('/api/notifications/lues');}catch(e){} bd.classList.remove('on');}
  };
  document.addEventListener('click',e=>{
    if(!p.contains(e.target)&&!b.contains(e.target))p.classList.remove('on');
    const el=e.target.closest&&e.target.closest('#jlist .jh > img, #jlist .lp');
    if(!el)return;
    const btn=el.closest('.jc')&&el.closest('.jc').querySelector('[id^="lk"]');
    const id=btn&&btn.id.replace('lk','');
    if(!id||vus.has(id))return;
    vus.add(id);
    Promise.resolve(post('/api/releases/'+id+'/ecoute')).catch(()=>{});
  });
  charger(); setInterval(charger,20000);
})();
