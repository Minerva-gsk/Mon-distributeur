(function(){
  if(window.__mg) return; window.__mg=1;
  var st=document.createElement('style');
  st.textContent=`
.mg-b{display:none;margin-left:6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#d4af37;color:#111;font:700 .7rem/18px sans-serif;vertical-align:middle}
.mg-b.on{display:inline-block}
#mg{position:fixed;left:0;right:0;top:0;height:100%;display:none;flex-direction:column;background:#0c0c0c;z-index:2000;color:#fff}
#mg.on{display:flex}
#mg header{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:linear-gradient(#2a220e,#141414)}
#mg header h3{flex:1;margin:0;font-size:1.15rem;color:#f0d36e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#mg header button{border:none;background:transparent;color:#f0d36e;font-size:1.4rem;padding:4px 8px}
#mg-body{flex:1;overflow:auto;-webkit-overflow-scrolling:touch}
#mg-body.chat{display:flex;flex-direction:column;overflow:hidden}
#mg-q{display:block;width:calc(100% - 32px);margin:12px 16px;padding:12px 14px;border:1px solid #3a3a3a;border-radius:999px;background:#2a2a2a;color:#fff;font-size:1rem;box-sizing:border-box}
.mg-it{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.06);cursor:pointer}
.mg-av{flex:0 0 44px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#f0d36e,#a8801f);color:#111;font-weight:700}
.mg-tx{flex:1;min-width:0}
.mg-tx b{display:block;font-size:1rem}
.mg-tx small{display:block;color:#a9a9a9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mg-n{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#d4af37;color:#111;font:700 .75rem/20px sans-serif;text-align:center}
.mg-vide{padding:24px 16px;color:#888;text-align:center}
#mg-msgs{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.mg-m{max-width:78%;padding:9px 13px;border-radius:16px;font-size:.95rem;line-height:1.35;overflow-wrap:anywhere;white-space:pre-wrap}
.mg-m.moi{align-self:flex-end;background:linear-gradient(135deg,#f0d36e,#d4af37);color:#111;border-bottom-right-radius:4px}
.mg-m.lui{align-self:flex-start;background:#2a2a2a;border-bottom-left-radius:4px}
.mg-m small{display:block;font-size:.68rem;opacity:.65;margin-top:2px}
#mg-f{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.08);background:#141414}
#mg-t{flex:1;padding:11px 14px;border:1px solid #3a3a3a;border-radius:999px;background:#2a2a2a;color:#fff;font-size:1rem}
#mg-f button{padding:0 18px;border:none;border-radius:999px;background:linear-gradient(135deg,#f0d36e,#d4af37);color:#111;font-weight:700}`;
  document.head.appendChild(st);
  var p=document.createElement('div');
  p.id='mg'; p.setAttribute('role','dialog'); p.setAttribute('aria-label','Messages');
  p.innerHTML='<header><button id="mg-back" aria-label="Retour" style="display:none">←</button><h3 id="mg-h">Messages</h3><button id="mg-x" aria-label="Fermer">✕</button></header><div id="mg-body"></div>';
  document.body.appendChild(p);
  var $=function(s){return document.querySelector(s)};
  var E=function(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
  var ini=function(n){return E(String(n||'?').trim().charAt(0).toUpperCase())};
  function hr(d){try{var x=new Date(String(d).replace(' ','T')+'Z'),n=new Date();return x.toDateString()===n.toDateString()?x.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):x.toLocaleDateString('fr-FR',{day:'numeric',month:'short'});}catch(e){return ''}}
  function get(u){return fetch(u,{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null})}
  function post(u,b){return typeof api==='function'?api(u,b):fetch(u,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(function(r){return r.json()})}
  var vue='liste',cur=0,last=0,timer=null;
  function stop(){clearInterval(timer);timer=null}
  function nonlus(){get('/api/messages/non-lus').then(function(d){if(!d||!d.ok)return;document.querySelectorAll('.mg-b').forEach(function(s){s.textContent=d.n>99?'99+':d.n;s.classList.toggle('on',d.n>0)})})}
  function ligne(id,nom,txt,n){return '<div class="mg-it" data-u="'+id+'" data-n="'+E(nom)+'"><div class="mg-av">'+ini(nom)+'</div><div class="mg-tx"><b>'+E(nom)+'</b>'+(txt?'<small>'+txt+'</small>':'')+'</div>'+(n?'<span class="mg-n">'+n+'</span>':'')+'</div>'}
  function charger(force){
    get('/api/messages/conversations').then(function(d){
      if(vue!=='liste'||!d||!d.ok||(!force&&$('#mg-q').value))return;
      $('#mg-l').innerHTML=d.liste.length?d.liste.map(function(c){return ligne(c.uid,c.nom,(c.moi?'Toi : ':'')+E(c.texte),c.nonlus)}).join(''):'<p class="mg-vide">Aucune conversation. Cherche un artiste pour écrire.</p>';
    });
  }
  function rech(){
    var v=$('#mg-q').value.trim();
    if(v.length<2){charger(true);return;}
    get('/api/messages/recherche?q='+encodeURIComponent(v)).then(function(d){
      if(vue!=='liste'||!d||!d.ok)return;
      $('#mg-l').innerHTML=d.liste.length?d.liste.map(function(c){return ligne(c.id,c.nom,'',0)}).join(''):'<p class="mg-vide">Aucun artiste trouvé.</p>';
    });
  }
  function showList(){
    stop();vue='liste';cur=0;
    $('#mg-back').style.display='none';$('#mg-h').textContent='Messages';
    $('#mg-body').className='';
    $('#mg-body').innerHTML='<input id="mg-q" type="search" placeholder="Chercher un artiste…" autocomplete="off"><div id="mg-l"></div>';
    var t;$('#mg-q').oninput=function(){clearTimeout(t);t=setTimeout(rech,250)};
    charger(true);
    timer=setInterval(function(){charger(false)},5000);
    nonlus();
  }
  function showChat(uid,nom){
    stop();vue='chat';cur=uid;last=0;
    $('#mg-back').style.display='';$('#mg-h').textContent=nom;
    $('#mg-body').className='chat';
    $('#mg-body').innerHTML='<div id="mg-msgs"></div><form id="mg-f"><input id="mg-t" maxlength="1000" placeholder="Écris un message…" autocomplete="off"><button>Envoyer</button></form>';
    function maj(first){
      get('/api/messages/'+uid+'?apres='+last).then(function(d){
        if(vue!=='chat'||cur!==uid||!d||!d.ok||!d.liste.length)return;
        var box=$('#mg-msgs'),bas=first===true||box.scrollHeight-box.scrollTop-box.clientHeight<80;
        box.insertAdjacentHTML('beforeend',d.liste.map(function(m){last=Math.max(last,m.id);return '<div class="mg-m '+(m.moi?'moi':'lui')+'">'+E(m.texte)+'<small>'+hr(m.date)+'</small></div>'}).join(''));
        if(bas)box.scrollTop=box.scrollHeight;
        nonlus();
      });
    }
    $('#mg-f').onsubmit=function(e){
      e.preventDefault();
      var i=$('#mg-t'),v=i.value.trim();if(!v)return;
      i.value='';
      post('/api/messages/'+uid,{texte:v}).then(function(d){
        if(!d||!d.ok){i.value=v;alert((d&&d.erreur)||'Message non envoyé');return;}
        maj();
      });
    };
    maj(true);
    timer=setInterval(maj,3000);
  }
  function ajuster(){if(window.visualViewport){p.style.height=window.visualViewport.height+'px';p.style.top=window.visualViewport.offsetTop+'px';}}
  if(window.visualViewport){visualViewport.addEventListener('resize',ajuster);visualViewport.addEventListener('scroll',ajuster);}
  function ouvrir(){p.classList.add('on');ajuster();showList();}
  function fermer(){stop();p.classList.remove('on');nonlus();}
  p.addEventListener('click',function(e){var it=e.target.closest('.mg-it');if(it)showChat(Number(it.dataset.u),it.dataset.n);});
  $('#mg-back').onclick=showList;
  $('#mg-x').onclick=fermer;
  document.querySelectorAll('#com .sw, #juger .sw').forEach(function(sw){
    if(sw.querySelector('.mg-open'))return;
    var b=document.createElement('button');
    b.type='button';b.className='mg-open';b.innerHTML='Messages<span class="mg-b"></span>';
    var j=sw.querySelector('[data-sw="juger"]');
    if(j)j.after(b);else sw.appendChild(b);
    b.onclick=function(e){e.stopPropagation();ouvrir();};
  });
  nonlus();setInterval(nonlus,10000);
})();
