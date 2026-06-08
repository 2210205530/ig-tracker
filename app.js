'use strict';
/* ═══════════════════════════════════════════════
   FOLLOWLY v7 — Full App with 3 Features
   ═══════════════════════════════════════════════ */

/* ── Keys ──────────────────────────────────────── */
var SK='followly_snaps_v2',LK='followly_labels_v2',WK='followly_wl_v2',AK='followly_alert_v2';

/* ── Storage ───────────────────────────────────── */
function gs(){try{return JSON.parse(localStorage.getItem(SK)||'[]');}catch(e){return[];}}
function ss(s){localStorage.setItem(SK,JSON.stringify(s));}
function gl(){try{return JSON.parse(localStorage.getItem(LK)||'{}');}catch(e){return{};}}
function sl(l){localStorage.setItem(LK,JSON.stringify(l));}
function gwl(){try{return JSON.parse(localStorage.getItem(WK)||'[]');}catch(e){return[];}}
function swl(w){localStorage.setItem(WK,JSON.stringify(w));}

/* ── State ─────────────────────────────────────── */
var pF=null,pFo=null;
var browseMode='nfb',wlMode=false,currentUser='';
var sortState={nfb:'az',ydnfb:'az',browse:'az'};

/* Prune state */
var pruneQueue=[],pruneIdx=0,pruneKept=[],pruneYeet=[];
var streak=0,dragging=false,startX=0,startY=0,curX=0,curY=0;

/* Matrix state */
var matrixParticles=[],matrixFilter='all',matrixSnap=null;
var matrixDrag=null,matrixRAF=null;

/* ═══════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',function(){
  initCanvas();
  initNav();
  initBrowseFilters();
  var bs=document.getElementById('browse-search');
  if(bs) bs.addEventListener('input',renderBrowse);
  updateLabel();
  var ds=document.getElementById('dash-date');
  if(ds) ds.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase();
  renderDash();
  checkAlert();
  initMatrixFilters();
  addGraveyardDecorations();
});

/* ── Ambient canvas orbs ───────────────────────── */
function initCanvas(){
  var c=document.getElementById('orb-canvas');
  if(!c)return;
  var ctx=c.getContext('2d');
  var orbs=[
    {cx:.14,cy:.12,vx:.00011,vy:.00008,color:'rgba(244,114,182,0.12)',r:.36},
    {cx:.84,cy:.36,vx:-.0001,vy:.00011,color:'rgba(129,140,248,0.10)',r:.30},
    {cx:.44,cy:.80,vx:.00007,vy:-.00012,color:'rgba(45,212,191,0.07)',r:.26}
  ];
  var t=0;
  function resize(){c.width=window.innerWidth;c.height=window.innerHeight;}
  resize();window.addEventListener('resize',resize);
  function draw(){
    t++;c.width=c.width;
    orbs.forEach(function(o){
      o.cx+=Math.sin(t*o.vx*.8)*.0004;o.cy+=Math.cos(t*o.vy*.9)*.0003;
      o.cx=Math.max(.05,Math.min(.95,o.cx));o.cy=Math.max(.05,Math.min(.95,o.cy));
      var gx=o.cx*c.width,gy=o.cy*c.height,gr=o.r*Math.max(c.width,c.height);
      var g=ctx.createRadialGradient(gx,gy,0,gx,gy,gr);
      g.addColorStop(0,o.color);g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(gx,gy,gr,0,Math.PI*2);ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

/* ── Nav ───────────────────────────────────────── */
function initNav(){
  document.querySelectorAll('.nb').forEach(function(btn){
    btn.addEventListener('click',function(){switchTab(btn.dataset.tab);});
  });
}
function switchTab(name){
  document.querySelectorAll('.nb').forEach(function(b){b.classList.toggle('active',b.dataset.tab===name);});
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.id==='tab-'+name);});
  if(name==='dashboard')renderDash();
  if(name==='browse')renderBrowse();
  if(name==='history')renderHistory();
  if(name==='prune')initPrune();
  if(name==='graveyard')renderGraveyard();
  if(name==='matrix')initMatrix();
}
function goTab(n){switchTab(n);}

/* ── Alert ─────────────────────────────────────── */
function checkAlert(){
  var snaps=gs();if(snaps.length<2)return;
  var latest=snaps[0],prev=snaps[1];
  var lastSeen=localStorage.getItem(AK);
  if(lastSeen===String(latest.ts))return;
  var fSet=new Set(latest.followers),pF=new Set(prev.followers);
  var lostF=prev.followers.filter(function(u){return !fSet.has(u);});
  var newF=latest.followers.filter(function(u){return !pF.has(u);});
  var parts=[];
  if(newF.length) parts.push('+'+newF.length+' new follower'+(newF.length>1?'s':''));
  if(lostF.length) parts.push(lostF.length+' unfollow'+(lostF.length>1?'s':''));
  if(!parts.length)return;
  var b=document.getElementById('alert-banner'),t=document.getElementById('alert-text');
  if(b&&t){t.textContent='Since last snapshot: '+parts.join(' · ');b.style.display='block';
  var a=document.querySelector('.app');if(a)a.style.paddingTop='52px';
  localStorage.setItem(AK,String(latest.ts));}
}
function dismissAlert(){
  var b=document.getElementById('alert-banner');if(b)b.style.display='none';
  var a=document.querySelector('.app');if(a)a.style.paddingTop='';}

/* ═══════════════════════════════════════════════
   PARSER — ALL INSTAGRAM FORMATS
   ═══════════════════════════════════════════════ */
function parseIG(raw,type){
  var data;
  try{data=JSON.parse(raw);}catch(e){throw new Error('Invalid JSON file');}
  var arr=null;
  if(Array.isArray(data)){arr=data;}
  else if(data&&typeof data==='object'){
    var key=type==='followers'?'relationships_followers':'relationships_following';
    if(Array.isArray(data[key])){arr=data[key];}
    else{var keys=Object.keys(data);for(var i=0;i<keys.length;i++){if(Array.isArray(data[keys[i]])){arr=data[keys[i]];break;}}}
  }
  if(!arr)throw new Error('Unexpected file structure');
  var results=[];
  for(var i=0;i<arr.length;i++){
    var item=arr[i];if(!item)continue;
    if(item.string_list_data&&Array.isArray(item.string_list_data)){
      for(var j=0;j<item.string_list_data.length;j++){
        var e=item.string_list_data[j],v=e&&(e.value||e.href);
        if(v&&typeof v==='string'){
          if(v.indexOf('instagram.com/')!==-1)v=v.replace(/.*instagram\.com\//,'').replace(/\//g,'').trim();
          if(v)results.push(v);
        }
      }
    }else if(item.value&&typeof item.value==='string'&&item.value.trim()){results.push(item.value.trim());}
    else if(typeof item==='string'&&item.trim()){results.push(item.trim());}
  }
  var seen={},out=[];
  for(var k=0;k<results.length;k++){if(!seen[results[k]]){seen[results[k]]=true;out.push(results[k]);}}
  return out;
}

/* ── File upload ───────────────────────────────── */
function handleFile(type,input){
  var file=input.files&&input.files[0];if(!file)return;
  var dzId=type==='followers'?'dz-followers':'dz-following';
  var stId=type==='followers'?'st-f':'st-fo';
  var dz=document.getElementById(dzId),st=document.getElementById(stId);
  st.textContent='Reading…';st.className='dz-st';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var users=parseIG(e.target.result,type);
      if(!users.length)throw new Error('No usernames found — check file');
      if(type==='followers')pF=users;else pFo=users;
      st.textContent='✓  '+users.length.toLocaleString()+' loaded';st.className='dz-st ok';
      dz.classList.add('loaded');
    }catch(err){
      if(type==='followers')pF=null;else pFo=null;
      st.textContent='✗  '+err.message;st.className='dz-st err';dz.classList.remove('loaded');
    }
    refreshUpUI();
  };
  reader.onerror=function(){st.textContent='✗  Could not read file';st.className='dz-st err';};
  reader.readAsText(file,'UTF-8');
}
function refreshUpUI(){
  var ready=!!(pF&&pFo);
  var btn=document.getElementById('btn-save');if(btn)btn.disabled=!ready;
  var msg=document.getElementById('upload-msg');if(!msg)return;
  if(ready){msg.style.display='block';msg.className='umsg info';msg.textContent='Both files loaded — press Save Snapshot.';}
  else if(pF||pFo){msg.style.display='block';msg.className='umsg info';msg.textContent='Upload both files to continue.';}
  else msg.style.display='none';
}
function saveSnapshot(){
  if(!pF||!pFo)return;
  var snaps=gs();snaps.unshift({ts:Date.now(),followers:pF,following:pFo});
  if(snaps.length>50)snaps.length=50;ss(snaps);updateLabel();
  var msg=document.getElementById('upload-msg');
  if(msg){msg.style.display='block';msg.className='umsg success';msg.textContent='✓  Snapshot saved!';}
  var btn=document.getElementById('btn-save');if(btn)btn.disabled=true;
}
function clearUpload(){
  pF=null;pFo=null;
  ['followers','following'].forEach(function(t){
    var i=document.getElementById('inp-'+t.charAt(0));if(i)i.value='';
    var st=document.getElementById('st-'+t.charAt(0));if(st){st.textContent='';st.className='dz-st';}
    var dz=document.getElementById('dz-'+t);if(dz)dz.classList.remove('loaded');
  });
  var msg=document.getElementById('upload-msg');if(msg)msg.style.display='none';
  var btn=document.getElementById('btn-save');if(btn)btn.disabled=true;
}

/* ═══════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════ */
function renderDash(){
  var snaps=gs();
  var empty=document.getElementById('dash-empty'),content=document.getElementById('dash-content');
  if(!empty||!content)return;
  if(!snaps.length){empty.style.display='flex';content.style.display='none';return;}
  empty.style.display='none';content.style.display='block';
  var lat=snaps[0],prev=snaps[1]||null;
  var fSet=new Set(lat.followers),folSet=new Set(lat.following);
  var nfb=lat.following.filter(function(u){return !fSet.has(u);});
  var ydnfb=lat.followers.filter(function(u){return !folSet.has(u);});
  set('kpi-f',fmt(lat.followers.length));set('kpi-fo',fmt(lat.following.length));
  set('kpi-nfb',fmt(nfb.length));set('kpi-ydnfb',fmt(ydnfb.length));
  var df=document.getElementById('kd-f'),dfo=document.getElementById('kd-fo');
  if(prev&&df&&dfo){
    var d1=lat.followers.length-prev.followers.length,d2=lat.following.length-prev.following.length;
    df.textContent=(d1>=0?'+':'')+d1+' since last';df.className='kd '+(d1>=0?'up':'down');
    dfo.textContent=(d2>=0?'+':'')+d2+' since last';dfo.className='kd '+(d2>=0?'up':'down');
  }else{if(df){df.textContent='First snapshot';df.className='kd';}if(dfo){dfo.textContent='';dfo.className='kd';}}
  var cw=document.getElementById('changes-s');
  if(prev&&cw){
    var pFS=new Set(prev.followers),pFOS=new Set(prev.following);
    var newF=lat.followers.filter(function(u){return !pFS.has(u);});
    var lostF=prev.followers.filter(function(u){return !fSet.has(u);});
    var newFol=lat.following.filter(function(u){return !pFOS.has(u);});
    var lostFol=prev.following.filter(function(u){return !folSet.has(u);});
    set('ch-since','vs '+fmtDate(prev.ts));cw.style.display='block';
    var cg=document.getElementById('cgrid');
    if(cg)cg.innerHTML=ccard('New followers',newF,'chip-gn')+ccard('Unfollowed you',lostF,'chip-rd')+ccard('You started following',newFol,'chip-vi')+ccard('You unfollowed',lostFol,'chip-pk');
  }else if(cw)cw.style.display='none';
  set('b-nfb',fmt(nfb.length)+' accounts');set('b-ydnfb',fmt(ydnfb.length)+' accounts');
  renderGrid('nfb');renderGrid('ydnfb');
}
function renderGrid(id){
  var snaps=gs();if(!snaps.length)return;
  var lat=snaps[0];
  var fSet=new Set(lat.followers),folSet=new Set(lat.following);
  var wl=gwl(),wlSet=new Set(wl);
  var list,el,sEl;
  if(id==='nfb'){
    list=lat.following.filter(function(u){return !fSet.has(u);});
    if(!wlMode)list=list.filter(function(u){return !wlSet.has(u);});
    el=document.getElementById('grid-nfb');sEl=document.getElementById('s-nfb');
  }else{
    list=lat.followers.filter(function(u){return !folSet.has(u);});
    el=document.getElementById('grid-ydnfb');sEl=document.getElementById('s-ydnfb');
  }
  var q=sEl?sEl.value.toLowerCase().trim():'';
  if(q)list=list.filter(function(u){return u.toLowerCase().indexOf(q)!==-1;});
  list=applySort(list,sortState[id]);
  if(!el)return;
  el.className='pgrid'+(wlMode&&id==='nfb'?' wl-mode':'');
  el.innerHTML=list.length?list.map(function(u,i){return pcard(u,i,wlSet.has(u));}).join(''):'<div class="gempty">None found</div>';
}
function reRenderAll(){renderGrid('nfb');renderGrid('ydnfb');renderBrowse();}

/* ═══════════════════════════════════════════════
   SORT
   ═══════════════════════════════════════════════ */
function setSort(g,d,btn){
  sortState[g]=d;
  document.querySelectorAll('.sp[data-g="'+g+'"]').forEach(function(b){b.classList.toggle('active',b.dataset.s===d);});
  if(g==='nfb')renderGrid('nfb');
  if(g==='ydnfb')renderGrid('ydnfb');
  if(g==='browse')renderBrowse();
}
function applySort(list,dir){
  var c=list.slice();
  if(dir==='az')c.sort(function(a,b){return a.toLowerCase()<b.toLowerCase()?-1:1;});
  if(dir==='za')c.sort(function(a,b){return a.toLowerCase()>b.toLowerCase()?-1:1;});
  return c;
}

/* ═══════════════════════════════════════════════
   FEATURE 1: SWIPE TO PRUNE
   ═══════════════════════════════════════════════ */
function initPrune(){
  var snaps=gs();
  var arena=document.getElementById('prune-arena');
  var done=document.getElementById('prune-done');
  if(!arena||!done)return;
  if(!snaps.length){arena.style.display='flex';done.style.display='none';
  var cs=document.getElementById('card-stack');if(cs)cs.innerHTML='<div style="font-family:var(--mono);font-size:12px;color:var(--t3);text-align:center">Upload a snapshot first.</div>';return;}
  var lat=snaps[0];
  var fSet=new Set(lat.followers);
  var wl=gwl(),wlSet=new Set(wl);
  pruneQueue=lat.following.filter(function(u){return !fSet.has(u)&&!wlSet.has(u);});
  pruneIdx=0;pruneKept=[];pruneYeet=[];streak=0;
  arena.style.display='flex';done.style.display='none';
  set('prune-kept','0 kept');set('prune-yeet','0 yeet');
  renderPruneCards();
}

function renderPruneCards(){
  var stack=document.getElementById('card-stack');
  var ctr=document.getElementById('streak-ctr');
  var progBar=document.getElementById('prune-bar');
  var progCount=document.getElementById('prune-count');
  if(!stack)return;
  if(pruneIdx>=pruneQueue.length){endPrune();return;}
  var pct=Math.round(pruneIdx/Math.max(1,pruneQueue.length)*100);
  if(progBar)progBar.style.width=pct+'%';
  if(progCount)progCount.textContent=pruneIdx+' / '+pruneQueue.length;
  if(ctr)ctr.style.display=streak>=3?'flex':'none';
  if(streak>=3)set('streak-num',String(streak));
  stack.innerHTML='';
  /* Back ghost cards */
  if(pruneIdx+2<pruneQueue.length){var b2=document.createElement('div');b2.className='hc-back2';stack.appendChild(b2);}
  if(pruneIdx+1<pruneQueue.length){var b1=document.createElement('div');b1.className='hc-back1';stack.appendChild(b1);}
  /* Main card */
  var u=pruneQueue[pruneIdx];
  var col=avCol(u);
  var card=document.createElement('div');
  card.className='holo-card';
  card.style.left='10px';card.style.top='10px';
  card.innerHTML=
    '<div class="hc-bg"></div>'+
    '<div class="hc-shimmer"></div>'+
    '<div class="hc-topline" style="background:linear-gradient(90deg,transparent,'+col+',rgba(180,120,255,.6),transparent)"></div>'+
    '<div class="hc-label-k">KEEP ♥</div>'+
    '<div class="hc-label-y">YEET ✕</div>'+
    '<div class="hc-av-wrap">'+
      '<div class="hc-av-ring"></div>'+
      '<div class="hc-av-ring2"></div>'+
      '<div class="hc-av" style="background:'+col+'22;border-color:'+col+'55">'+inits(u)+'</div>'+
    '</div>'+
    '<p class="hc-user">@'+esc(u)+'</p>'+
    '<p class="hc-days">Following since unknown</p>';
  stack.appendChild(card);
  /* Drag events */
  card.addEventListener('mousedown',onDragStart);
  card.addEventListener('touchstart',onDragStart,{passive:true});
}

function onDragStart(e){
  dragging=true;
  var pt=e.touches?e.touches[0]:e;
  startX=pt.clientX;startY=pt.clientY;curX=0;curY=0;
  document.addEventListener('mousemove',onDragMove);
  document.addEventListener('touchmove',onDragMove,{passive:true});
  document.addEventListener('mouseup',onDragEnd);
  document.addEventListener('touchend',onDragEnd);
}
function onDragMove(e){
  if(!dragging)return;
  var pt=e.touches?e.touches[0]:e;
  curX=pt.clientX-startX;curY=pt.clientY-startY;
  var card=document.querySelector('.holo-card');
  var arena=document.getElementById('prune-arena');
  if(!card)return;
  var rot=curX*0.08;
  card.style.transform='translate('+curX+'px,'+curY+'px) rotate('+rot+'deg)';
  card.classList.toggle('show-keep',curX>30);
  card.classList.toggle('show-yeet',curX<-30);
  if(arena){
    arena.classList.toggle('dragging-left',curX<-30);
    arena.classList.toggle('dragging-right',curX>30);
  }
}
function onDragEnd(){
  if(!dragging)return;dragging=false;
  document.removeEventListener('mousemove',onDragMove);
  document.removeEventListener('touchmove',onDragMove);
  document.removeEventListener('mouseup',onDragEnd);
  document.removeEventListener('touchend',onDragEnd);
  var arena=document.getElementById('prune-arena');
  if(arena){arena.classList.remove('dragging-left','dragging-right');}
  if(Math.abs(curX)>80)swipeCard(curX>0?1:-1);
  else{var card=document.querySelector('.holo-card');if(card){card.style.transform='';card.classList.remove('show-keep','show-yeet');}}
}

function swipeCard(dir){
  var card=document.querySelector('.holo-card');
  if(!card||pruneIdx>=pruneQueue.length)return;
  var u=pruneQueue[pruneIdx];
  var flyX=dir>0?600:-600;
  var rot=dir>0?25:-25;
  card.style.transition='transform .35s cubic-bezier(.25,.46,.45,.94),opacity .35s';
  card.style.transform='translate('+flyX+'px,'+(-80)+'px) rotate('+rot+'deg)';
  card.style.opacity='0';
  if(dir>0){pruneKept.push(u);streak++;}
  else{pruneYeet.push(u);streak++;}
  set('prune-kept',pruneKept.length+' kept');set('prune-yeet',pruneYeet.length+' yeet');
  pruneIdx++;
  setTimeout(function(){renderPruneCards();},320);
}

function endPrune(){
  var arena=document.getElementById('prune-arena');
  var done=document.getElementById('prune-done');
  if(!arena||!done)return;
  arena.style.display='none';done.style.display='flex';
  set('pd-summary','Kept '+pruneKept.length+' · Added '+pruneYeet.length+' to yeet list');
  var yl=document.getElementById('yeet-list');
  if(yl)yl.innerHTML=pruneYeet.map(function(u){return '<div class="yeet-pill">@'+esc(u)+'</div>';}).join('');
}
function restartPrune(){pruneIdx=0;pruneKept=[];pruneYeet=[];streak=0;initPrune();}

/* ═══════════════════════════════════════════════
   FEATURE 2: DIGITAL GRAVEYARD
   ═══════════════════════════════════════════════ */
function addGraveyardDecorations(){
  /* Add floating bones/crows to sky */
  var sky=document.querySelector('.gy-sky');
  if(!sky)return;
  ['🦅','🦅'].forEach(function(){var el=document.createElement('div');el.className='gy-crow';el.textContent='🦅';sky.appendChild(el);});
  var gw=document.querySelector('.gy-ground-wrap');
  if(gw){['🦴','🦴','🦴'].forEach(function(){var el=document.createElement('div');el.className='gy-bone';el.textContent='🦴';gw.appendChild(el);});}
}

function renderGraveyard(){
  var snaps=gs();
  var empty=document.getElementById('gy-empty');
  var content=document.getElementById('gy-content');
  if(!empty||!content)return;
  if(snaps.length<2){empty.style.display='flex';content.style.display='none';return;}
  empty.style.display='none';content.style.display='block';

  /* Detect vanished accounts */
  var lat=snaps[0],prev=snaps[1];
  var latAll=new Set(lat.followers.concat(lat.following));
  var prevFollowers=new Set(prev.followers);
  /* Accounts that were in previous followers but completely gone (not in followers or following of latest) */
  var vanished=prev.followers.filter(function(u){return !latAll.has(u);});
  /* also check following */
  var prevFol=new Set(prev.following);
  prev.following.forEach(function(u){if(!latAll.has(u)&&!new Set(vanished).has(u))vanished.push(u);});

  /* Max lifespan for bar calc */
  var maxDays=847;

  set('gy-count-tag',fmt(vanished.length)+' lost souls');
  set('gy-count-text',vanished.length+' account'+(vanished.length!==1?'s':'')+' lost to the void');

  /* Tombstones */
  var tombsEl=document.getElementById('gy-tombs');
  if(tombsEl){
    var tombCount=Math.min(vanished.length,8);
    var tombHTML='';
    for(var i=0;i<tombCount;i++){
      var uname=vanished[i];
      var ht=40+Math.random()*30;
      tombHTML+='<div class="tomb" onclick="scrollToRecord(\''+escAttr(uname)+'\')" title="@'+escAttr(uname)+'">';
      tombHTML+='<div class="tomb-stone">';
      tombHTML+='<svg viewBox="0 0 38 '+(ht+8)+'" fill="none" xmlns="http://www.w3.org/2000/svg">';
      tombHTML+='<rect x="1" y="'+(ht-28)+'" width="36" height="36" fill="rgba(14,12,22,.9)" stroke="rgba(160,130,200,.35)" stroke-width="1"/>';
      tombHTML+='<rect x="9" y="1" width="20" height="'+(ht-20)+'" rx="10" fill="rgba(14,12,22,.9)" stroke="rgba(160,130,200,.35)" stroke-width="1"/>';
      tombHTML+='<text x="19" y="'+(ht-8)+'" text-anchor="middle" font-size="7" fill="rgba(160,130,200,.4)" font-family="monospace">✝</text>';
      tombHTML+='</svg>';
      tombHTML+='</div>';
      tombHTML+='<div class="tomb-label">@'+esc(uname.slice(0,8))+'</div>';
      tombHTML+='</div>';
    }
    tombsEl.innerHTML=tombHTML;
  }

  /* Record rows */
  var listEl=document.getElementById('gy-list');
  if(!listEl)return;
  if(!vanished.length){listEl.innerHTML='<div style="font-family:var(--mono);font-size:12px;color:rgba(160,130,210,.5);text-align:center;padding:2rem;">No vanished accounts detected between these two snapshots.</div>';return;}

  var statuses=['void','ghost','null'];
  listEl.innerHTML=vanished.map(function(u,i){
    var days=Math.floor(Math.random()*800+30);
    var pct=Math.min(100,Math.round(days/maxDays*100));
    var st=statuses[i%3];
    var stLbl=st==='void'?'VOID':st==='ghost'?'GHOST':'NULL';
    return '<div class="gy-entry" id="gy-rec-'+escAttr(u)+'" onclick="window.open(\'https://www.instagram.com/'+encodeURIComponent(u)+'/\',\'_blank\')">'+
      '<div class="gy-ghost-av">'+
        '<svg viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">'+
          '<ellipse cx="15" cy="13" rx="9" ry="9" stroke="rgba(180,130,255,.4)" stroke-width="1" fill="rgba(20,15,35,.8)"/>'+
          '<ellipse cx="11.5" cy="13" rx="2.5" ry="3" fill="rgba(180,130,255,.35)"/>'+
          '<ellipse cx="18.5" cy="13" rx="2.5" ry="3" fill="rgba(180,130,255,.35)"/>'+
          '<path d="M12 19 Q15 21.5 18 19" stroke="rgba(180,130,255,.3)" stroke-width="1" fill="none"/>'+
        '</svg>'+
        '<span class="gy-q">?</span>'+
      '</div>'+
      '<div class="gy-info">'+
        '<p class="gy-username">@'+esc(u)+'</p>'+
        '<p class="gy-meta">followed · '+days+' days · now gone</p>'+
      '</div>'+
      '<div class="gy-days-bar"><div class="gy-days-fill" style="width:'+pct+'%"></div></div>'+
      '<div class="gy-status '+st+'">'+stLbl+'</div>'+
    '</div>';
  }).join('');
}
function scrollToRecord(u){
  var el=document.getElementById('gy-rec-'+u);
  if(el)el.scrollIntoView({behavior:'smooth',block:'center'});
}

/* ═══════════════════════════════════════════════
   FEATURE 3: NETWORK MATRIX (Canvas Physics)
   ═══════════════════════════════════════════════ */
function initMatrixFilters(){
  document.querySelectorAll('.mf').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.mf').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      matrixFilter=btn.dataset.filter;
      applyMatrixFilter();
    });
  });
}

function initMatrix(){
  var snaps=gs();
  var canvas=document.getElementById('matrix-canvas');
  if(!canvas)return;
  if(!snaps.length){
    var ctx2=canvas.getContext('2d');
    canvas.width=canvas.offsetWidth;canvas.height=canvas.offsetHeight||500;
    ctx2.fillStyle='rgba(120,200,255,.3)';ctx2.font='14px monospace';
    ctx2.textAlign='center';ctx2.fillText('Upload a snapshot to see the matrix',canvas.width/2,canvas.height/2);
    return;
  }
  matrixSnap=snaps[0];
  buildMatrixParticles();
  startMatrixLoop(canvas);
  addMatrixInteraction(canvas);
}

function getParticleColor(p){
  if(p.isGhost) return {fill:'rgba(248,113,113,.9)',glow:'rgba(248,113,113,.5)'};
  if(p.ageDays>=1000) return {fill:'rgba(59,130,246,.9)',glow:'rgba(59,130,246,.5)'};
  if(p.ageDays>=365)  return {fill:'rgba(129,140,248,.9)',glow:'rgba(129,140,248,.5)'};
  if(p.ageDays>=90)   return {fill:'rgba(56,189,248,.8)',glow:'rgba(56,189,248,.4)'};
  return {fill:'rgba(244,114,182,.85)',glow:'rgba(244,114,182,.4)'};
}

function getParticleSize(p){
  if(p.ageDays>=1000) return 6+Math.random()*3;
  if(p.ageDays>=365)  return 4+Math.random()*2;
  if(p.ageDays>=90)   return 3+Math.random()*2;
  return 2+Math.random()*1.5;
}

function buildMatrixParticles(){
  if(!matrixSnap)return;
  var canvas=document.getElementById('matrix-canvas');
  if(!canvas)return;
  var W=canvas.offsetWidth||800,H=canvas.offsetHeight||500;
  canvas.width=W;canvas.height=H;
  var followers=matrixSnap.followers;
  var fSet=new Set(matrixSnap.followers);
  var folSet=new Set(matrixSnap.following);
  /* Limit to 800 for performance, sample evenly */
  var sample=followers.length<=800?followers:sampleArr(followers,800);
  matrixParticles=sample.map(function(u){
    var ageDays=Math.floor(Math.random()*1200+1);
    var isGhost=folSet.has(u)&&!fSet.has(u);
    var p={
      u:u,ageDays:ageDays,isGhost:isGhost,
      x:Math.random()*W,y:Math.random()*H,
      vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,
      r:0,targetY:null,active:true,
      hovered:false
    };
    p.r=getParticleSize(p);
    return p;
  });
}

function sampleArr(arr,n){
  var step=Math.floor(arr.length/n),out=[];
  for(var i=0;i<arr.length&&out.length<n;i+=step)out.push(arr[i]);
  return out;
}

function applyMatrixFilter(){
  var canvas=document.getElementById('matrix-canvas');
  if(!canvas||!matrixParticles.length)return;
  var H=canvas.height;
  matrixParticles.forEach(function(p){
    if(matrixFilter==='all'){p.targetY=null;p.active=true;}
    else if(matrixFilter==='og'){p.active=p.ageDays>=1000;p.targetY=p.active?H*.7+Math.random()*60:null;}
    else if(matrixFilter==='veteran'){p.active=p.ageDays>=365&&p.ageDays<1000;p.targetY=p.active?H*.5+Math.random()*80:null;}
    else if(matrixFilter==='recent'){p.active=p.ageDays<30;p.targetY=p.active?H*.15+Math.random()*60:null;}
    else if(matrixFilter==='ghost'){p.active=p.isGhost;p.targetY=p.active?H*.4+Math.random()*100:null;}
  });
}

function startMatrixLoop(canvas){
  if(matrixRAF)cancelAnimationFrame(matrixRAF);
  var ctx=canvas.getContext('2d');
  function loop(){
    var W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    /* Draw connection lines for nearest neighbours (sparse) */
    for(var i=0;i<matrixParticles.length;i+=6){
      var p=matrixParticles[i];
      if(!p.active)continue;
      for(var j=i+1;j<Math.min(matrixParticles.length,i+20);j++){
        var q=matrixParticles[j];
        if(!q.active)continue;
        var dx=p.x-q.x,dy=p.y-q.y,dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<60){
          ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);
          ctx.strokeStyle='rgba(120,200,255,'+(0.06*(1-dist/60))+')';
          ctx.lineWidth=.5;ctx.stroke();
        }
      }
    }
    /* Draw particles */
    matrixParticles.forEach(function(p){
      /* Physics */
      if(matrixDrag&&matrixDrag.p===p){
        p.x=matrixDrag.x;p.y=matrixDrag.y;p.vx=0;p.vy=0;
      } else {
        if(p.targetY!==null){
          var dy=p.targetY-p.y;p.vy+=dy*.004;p.vy*=.85;
        } else {
          p.vy*=.995;p.vx*=.995;
        }
        p.x+=p.vx;p.y+=p.vy;
        /* Bounce off walls */
        if(p.x<p.r){p.x=p.r;p.vx=Math.abs(p.vx)*.7;}
        if(p.x>W-p.r){p.x=W-p.r;p.vx=-Math.abs(p.vx)*.7;}
        if(p.y<p.r){p.y=p.r;p.vy=Math.abs(p.vy)*.7;}
        if(p.y>H-p.r){p.y=H-p.r;p.vy=-Math.abs(p.vy)*.7;}
      }
      if(!p.active)return;
      var col=getParticleColor(p);
      var r=p.hovered?p.r*2.5:p.r;
      /* Glow */
      var grad=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*2.5);
      grad.addColorStop(0,col.glow);grad.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath();ctx.arc(p.x,p.y,r*2.5,0,Math.PI*2);
      ctx.fillStyle=grad;ctx.fill();
      /* Orb */
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);
      ctx.fillStyle=col.fill;ctx.fill();
      /* Shine */
      ctx.beginPath();ctx.arc(p.x-r*.3,p.y-r*.3,r*.35,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,.25)';ctx.fill();
    });
    matrixRAF=requestAnimationFrame(loop);
  }
  loop();
}

function addMatrixInteraction(canvas){
  var tip=document.getElementById('matrix-tip');
  function findParticle(x,y){
    var best=null,bestD=999;
    matrixParticles.forEach(function(p){
      if(!p.active)return;
      var d=Math.sqrt((p.x-x)*(p.x-x)+(p.y-y)*(p.y-y));
      if(d<Math.max(p.r+8,14)&&d<bestD){bestD=d;best=p;}
    });
    return best;
  }
  function getXY(e,c){
    var rect=c.getBoundingClientRect();
    var pt=e.touches?e.touches[0]:e;
    return{x:pt.clientX-rect.left,y:pt.clientY-rect.top};
  }
  canvas.addEventListener('mousemove',function(e){
    var xy=getXY(e,canvas);
    var p=findParticle(xy.x,xy.y);
    matrixParticles.forEach(function(q){q.hovered=false;});
    if(p){
      p.hovered=true;canvas.style.cursor='pointer';
      if(tip){
        tip.style.display='block';
        tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY-10)+'px';
        var ageLabel=p.ageDays>=1000?'OG':p.ageDays>=365?'Veteran':p.ageDays>=30?'Regular':'New';
        tip.innerHTML='<p>@'+esc(p.u)+'</p><p>'+ageLabel+' · '+p.ageDays+' days</p>';
      }
    } else {
      canvas.style.cursor='crosshair';
      if(tip)tip.style.display='none';
    }
    if(matrixDrag){matrixDrag.x=xy.x;matrixDrag.y=xy.y;}
  });
  canvas.addEventListener('mousedown',function(e){
    var xy=getXY(e,canvas);
    var p=findParticle(xy.x,xy.y);
    if(p)matrixDrag={p:p,x:xy.x,y:xy.y};
  });
  canvas.addEventListener('mouseup',function(e){
    if(matrixDrag){
      var xy=getXY(e,canvas);
      matrixDrag.p.vx=(xy.x-matrixDrag.x)*.1;
      matrixDrag.p.vy=(xy.y-matrixDrag.y)*.1;
      matrixDrag=null;
    }
  });
  canvas.addEventListener('click',function(e){
    var xy=getXY(e,canvas);
    var p=findParticle(xy.x,xy.y);
    if(p)window.open('https://www.instagram.com/'+encodeURIComponent(p.u)+'/','_blank');
  });
  canvas.addEventListener('mouseleave',function(){
    if(tip)tip.style.display='none';
    matrixParticles.forEach(function(p){p.hovered=false;});
    matrixDrag=null;
  });
}

/* ═══════════════════════════════════════════════
   WHITELIST & LABEL
   ═══════════════════════════════════════════════ */
function toggleWLMode(){wlMode=!wlMode;var b=document.getElementById('wl-toggle');if(b)b.classList.toggle('active',wlMode);renderGrid('nfb');}
function toggleWL(u){
  var wl=gwl(),idx=wl.indexOf(u);
  if(idx===-1)wl.push(u);else wl.splice(idx,1);
  swl(wl);renderGrid('nfb');
  var btn=document.getElementById('wl-mbtn');
  if(btn)btn.textContent=idx===-1?'Remove from whitelist':'Add to whitelist';
}
function openLabelModal(u){
  currentUser=u;
  var labels=gl(),wl=gwl();
  var m=document.getElementById('label-modal');if(!m)return;
  var av=document.getElementById('m-av'),un=document.getElementById('m-un');
  var iglink=document.getElementById('m-iglink'),wlbtn=document.getElementById('wl-mbtn');
  var col=avCol(u);
  if(av){av.style.background=col;av.textContent=inits(u);}
  if(un)un.textContent='@'+u;
  if(iglink)iglink.href='https://www.instagram.com/'+encodeURIComponent(u)+'/';
  if(wlbtn)wlbtn.textContent=wl.indexOf(u)!==-1?'Remove from whitelist':'Add to whitelist';
  var cur=labels[u]||'';
  document.querySelectorAll('.lo').forEach(function(b){b.classList.toggle('active',b.dataset.l===cur);});
  m.style.display='flex';
}
function applyLabel(l){
  var labels=gl();
  if(l==='')delete labels[currentUser];else labels[currentUser]=l;
  sl(labels);
  document.querySelectorAll('.lo').forEach(function(b){b.classList.toggle('active',b.dataset.l===l);});
}
function closeModal(e){
  if(e&&e.target!==document.getElementById('label-modal'))return;
  document.getElementById('label-modal').style.display='none';reRenderAll();
}

/* ═══════════════════════════════════════════════
   BROWSE
   ═══════════════════════════════════════════════ */
function initBrowseFilters(){
  document.querySelectorAll('.fp').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.fp').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');browseMode=btn.dataset.mode;renderBrowse();
    });
  });
}
function renderBrowse(){
  var snaps=gs();
  var grid=document.getElementById('browse-grid'),sub=document.getElementById('browse-sub');
  if(!grid)return;
  if(!snaps.length){grid.innerHTML='<div class="gempty">No snapshots yet</div>';if(sub)sub.textContent='';return;}
  var lat=snaps[0],fSet=new Set(lat.followers),folSet=new Set(lat.following);
  var wl=gwl(),wlSet=new Set(wl);
  var q=((document.getElementById('browse-search')||{}).value||'').toLowerCase().trim();
  var list;
  if(browseMode==='nfb')list=lat.following.filter(function(u){return !fSet.has(u)&&!wlSet.has(u);});
  else if(browseMode==='ydnfb')list=lat.followers.filter(function(u){return !folSet.has(u);});
  else if(browseMode==='followers')list=lat.followers.slice();
  else if(browseMode==='following')list=lat.following.slice();
  else list=wl.slice();
  if(q)list=list.filter(function(u){return u.toLowerCase().indexOf(q)!==-1;});
  list=applySort(list,sortState['browse']);
  if(sub)sub.textContent=fmt(list.length)+' ACCOUNTS';
  grid.innerHTML=list.length
    ?list.slice(0,120).map(function(u,i){return pcard(u,i,wlSet.has(u));}).join('')+(list.length>120?'<div class="gempty" style="grid-column:1/-1">Showing 120 of '+fmt(list.length)+' — search to narrow down</div>':'')
    :'<div class="gempty">No accounts found</div>';
}

/* ═══════════════════════════════════════════════
   HISTORY
   ═══════════════════════════════════════════════ */
function renderHistory(){
  var snaps=gs(),el=document.getElementById('hist-list');if(!el)return;
  if(!snaps.length){el.innerHTML='<div class="gempty" style="display:block;text-align:center;padding:3rem">No snapshots saved yet</div>';return;}
  el.innerHTML=snaps.map(function(s,i){
    var badge=i===0?'<span class="hlatest">Latest</span>':'<button class="hdel" onclick="delSnap('+i+')">✕</button>';
    return '<div class="hcard"><span class="hnum">#'+(snaps.length-i)+'</span><div class="hinfo"><p class="htime">'+fmtDateFull(s.ts)+'</p><p class="hmeta">'+fmt(s.followers.length)+' followers · '+fmt(s.following.length)+' following</p></div>'+badge+'</div>';
  }).join('');
}
function delSnap(i){if(!confirm('Delete this snapshot?'))return;var s=gs();s.splice(i,1);ss(s);updateLabel();renderHistory();}
function clearAllSnaps(){if(!confirm('Delete ALL snapshots?'))return;localStorage.removeItem(SK);updateLabel();renderHistory();renderDash();}

/* ═══════════════════════════════════════════════
   PROFILE CARD
   ═══════════════════════════════════════════════ */
function pcard(u,idx,isWL){
  idx=idx||0;
  var col=avCol(u),init=inits(u);
  var labels=gl(),label=labels[u]||'';
  var wl=gwl(),inWL=wl.indexOf(u)!==-1;
  var delay=Math.min(idx*22,500);
  var labelBadge=label?'<span class="plabel '+label+'">'+label+'</span>':inWL?'<span class="plabel whitelist">whitelisted</span>':'';
  var auraStyle='background:conic-gradient(from 0deg,'+col+',rgba(129,140,248,.6),'+col+')';
  return '<div class="pcard'+(inWL?' whitelisted':'')+'" style="animation-delay:'+delay+'ms" onclick="openLabelModal(\''+escAttr(u)+'\')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\')openLabelModal(\''+escAttr(u)+'\')">'
    +'<div class="wl-check" onclick="event.stopPropagation();toggleWL(\''+escAttr(u)+'\')">'+(inWL?'★':'☆')+'</div>'
    +'<div class="avwrap"><div class="av-aura" style="'+auraStyle+'"></div><div class="av" style="background:'+col+'22">'+init+'</div></div>'
    +labelBadge
    +'<p class="pun">@'+esc(u)+'</p>'
    +'<a class="pvbtn" href="https://www.instagram.com/'+encodeURIComponent(u)+'/" target="_blank" rel="noopener" onclick="event.stopPropagation()">View on Instagram ↗</a>'
    +'</div>';
}

/* ── Change card ───────────────────────────────── */
function ccard(title,users,chip){
  var rows=users.length
    ?users.slice(0,6).map(function(u){
      var col=avCol(u);
      return '<a class="mrow" href="https://www.instagram.com/'+encodeURIComponent(u)+'/" target="_blank" rel="noopener">'
        +'<div class="mav" style="background:'+col+'22;color:'+col+'">'+inits(u)+'</div>'
        +'<span class="mname">@'+esc(u)+'</span><span class="marr">↗</span></a>';
    }).join('')+(users.length>6?'<p class="mmore">+'+( users.length-6)+' more</p>':'')
    :'<p class="mempty">No changes</p>';
  return '<div class="ccard"><div class="cch"><span class="cct">'+esc(title)+'</span><span class="chip '+chip+'">'+users.length+'</span></div><div class="mlist">'+rows+'</div></div>';
}

/* ═══════════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════════ */
var AVCOLS=['#7c6dfa','#f472b6','#2dd4bf','#f59e0b','#34d399','#60a5fa','#a78bfa','#fb7185','#38bdf8','#4ade80','#e879f9','#fbbf24'];
function avCol(u){var h=0;for(var i=0;i<u.length;i++)h=(h*31+u.charCodeAt(i))>>>0;return AVCOLS[h%AVCOLS.length];}
function inits(u){var c=u.replace(/[^a-zA-Z0-9]/g,'');return c.slice(0,2).toUpperCase()||'??';}
function updateLabel(){var n=gs().length;var el=document.getElementById('snap-label');if(el)el.textContent=n+(n===1?' snapshot':' snapshots');}
function set(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
function fmt(n){return Number(n).toLocaleString();}
function fmtDate(ts){return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fmtDateFull(ts){return new Date(ts).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}

/* ═══════════════════════════════════════════════════════════
   FEATURE 1 — SWIPE TO PRUNE
   ═══════════════════════════════════════════════════════════ */
var pruneList = [];
var pruneIdx  = 0;
var pruneKept = [];
var pruneYeet = [];
var pruneStreak = 0;
var isDragging = false;
var dragStartX = 0;
var dragStartY = 0;
var dragCurX   = 0;
var dragCurY   = 0;
var activeCard = null;

function initPrune() {
  var snaps = loadSnaps();
  if (!snaps.length) { showPruneEmpty(); return; }
  var latest = snaps[0];
  var fSet = new Set(latest.followers);
  pruneList = latest.following.filter(function(u) { return !fSet.has(u); });
  pruneIdx  = 0; pruneKept = []; pruneYeet = []; pruneStreak = 0;
  if (!pruneList.length) { showPruneEmpty(); return; }
  document.getElementById('prune-done').style.display  = 'none';
  document.getElementById('prune-arena').style.display = 'flex';
  renderPruneCards();
  updatePruneStats();
}

function showPruneEmpty() {
  var arena = document.getElementById('prune-arena');
  arena.innerHTML = '<p class="prune-empty">No accounts to prune — everyone you follow follows you back, or upload a snapshot first.</p>';
  arena.style.display = 'flex';
}

function renderPruneCards() {
  var stack = document.getElementById('card-stack');
  if (!stack) return;
  stack.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    var idx = pruneIdx + i;
    if (idx >= pruneList.length) break;
    var u   = pruneList[idx];
    var col = avatarColor(u);
    var init = initials(u);
    var card = document.createElement('div');
    card.className = 'prune-card ' + (i === 0 ? 'top-card' : i === 1 ? 'card-2' : 'card-3');
    card.dataset.username = u;
    card.innerHTML =
      '<div class="drag-label drag-label-keep">KEEP ♥</div>' +
      '<div class="drag-label drag-label-yeet">YEET ✕</div>' +
      '<div class="card-av-wrap">' +
        '<div class="card-av-orbit"></div>' +
        '<div class="card-av" style="background:' + col.bg + '22;border-color:' + col.bg + '55;color:' + col.bg + '">' + init + '</div>' +
      '</div>' +
      '<p class="card-username">@' + esc(u) + '</p>' +
      '<p class="card-days">' + getFollowAge(u, pruneList) + '</p>';
    if (i === 0) {
      card.addEventListener('mousedown', onDragStart);
      card.addEventListener('touchstart', onTouchStart, { passive: true });
    }
    stack.appendChild(card);
  }
  updatePruneCount();
  updatePruneBar();
}

function getFollowAge(username, list) {
  var snaps = loadSnaps();
  if (!snaps.length) return 'unknown age';
  var ts = null;
  var latest = snaps[0];
  if (latest._followingTimestamps && latest._followingTimestamps[username]) {
    var days = Math.floor((Date.now() - latest._followingTimestamps[username] * 1000) / 86400000);
    return 'followed ' + days + ' days ago';
  }
  return 'in your following list';
}

/* ── Drag physics ──────────────────────────────── */
function onDragStart(e) {
  isDragging = true;
  dragStartX = e.clientX; dragStartY = e.clientY;
  activeCard = e.currentTarget;
  activeCard.style.transition = 'none';
  window.addEventListener('mousemove', onDragMove);
  window.addEventListener('mouseup',   onDragEnd);
}
function onTouchStart(e) {
  isDragging = true;
  dragStartX = e.touches[0].clientX; dragStartY = e.touches[0].clientY;
  activeCard = e.currentTarget;
  activeCard.style.transition = 'none';
  window.addEventListener('touchmove', onTouchMove, { passive: true });
  window.addEventListener('touchend',  onTouchEnd);
}
function onTouchMove(e) { onDragMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }
function onTouchEnd()   { onDragEnd({}); }

function onDragMove(e) {
  if (!isDragging || !activeCard) return;
  var dx = e.clientX - dragStartX;
  var dy = e.clientY - dragStartY;
  var rot = dx * 0.08;
  activeCard.style.transform = 'translate(' + dx + 'px,' + dy + 'px) rotate(' + rot + 'deg)';
  /* Show labels */
  var keepLabel = activeCard.querySelector('.drag-label-keep');
  var yeetLabel = activeCard.querySelector('.drag-label-yeet');
  if (dx > 20) { keepLabel.style.opacity = Math.min((dx - 20) / 80, 1); yeetLabel.style.opacity = 0; }
  else if (dx < -20) { yeetLabel.style.opacity = Math.min((-dx - 20) / 80, 1); keepLabel.style.opacity = 0; }
  else { keepLabel.style.opacity = 0; yeetLabel.style.opacity = 0; }
  /* Color glow */
  if (dx > 40) { activeCard.style.boxShadow = '0 0 40px rgba(74,222,128,' + Math.min((dx-40)/100,.4) + ')'; }
  else if (dx < -40) { activeCard.style.boxShadow = '0 0 40px rgba(248,113,113,' + Math.min((-dx-40)/100,.4) + ')'; }
  else { activeCard.style.boxShadow = ''; }
}

function onDragEnd(e) {
  if (!isDragging || !activeCard) return;
  isDragging = false;
  window.removeEventListener('mousemove', onDragMove);
  window.removeEventListener('mouseup',   onDragEnd);
  window.removeEventListener('touchmove', onTouchMove);
  window.removeEventListener('touchend',  onTouchEnd);
  var dx = (e.clientX || dragStartX) - dragStartX;
  var threshold = 90;
  if (dx > threshold) { commitSwipe(1); }
  else if (dx < -threshold) { commitSwipe(-1); }
  else {
    /* Snap back with spring */
    activeCard.style.transition = 'transform .4s cubic-bezier(.16,1,.3,1),box-shadow .3s';
    activeCard.style.transform  = '';
    activeCard.style.boxShadow  = '';
    activeCard.querySelector('.drag-label-keep').style.opacity = 0;
    activeCard.querySelector('.drag-label-yeet').style.opacity = 0;
    pruneStreak = 0;
    updateStreakUI();
    activeCard = null;
  }
}

function swipeCard(dir) {
  /* Button-triggered swipe */
  var stack = document.getElementById('card-stack');
  if (!stack) return;
  activeCard = stack.querySelector('.top-card');
  if (!activeCard) return;
  activeCard.style.transition = 'none';
  commitSwipe(dir);
}

function commitSwipe(dir) {
  /* dir: 1=keep, -1=yeet */
  var username = activeCard.dataset.username;
  var flyX = dir === 1 ? 600 : -600;
  var flyRot = dir === 1 ? 25 : -25;
  activeCard.style.transition = 'transform .45s cubic-bezier(.16,1,.3,1),opacity .4s,box-shadow .3s';
  activeCard.style.transform  = 'translate(' + flyX + 'px,-60px) rotate(' + flyRot + 'deg)';
  activeCard.style.opacity    = '0';
  activeCard.style.boxShadow  = '';

  if (dir === 1) { pruneKept.push(username); } else { pruneYeet.push(username); }
  pruneStreak++;
  updateStreakUI();
  updatePruneStats();

  setTimeout(function() {
    pruneIdx++;
    if (pruneIdx >= pruneList.length) { showDone(); } else { renderPruneCards(); }
    activeCard = null;
  }, 380);
}

function updateStreakUI() {
  var ctr = document.getElementById('streak-ctr');
  var num = document.getElementById('streak-num');
  if (!ctr || !num) return;
  if (pruneStreak >= 3) {
    ctr.style.display = 'flex';
    num.textContent   = pruneStreak;
    /* Re-trigger animation */
    ctr.style.animation = 'none';
    ctr.offsetHeight;
    ctr.style.animation = 'streakPop .3s cubic-bezier(.16,1,.3,1)';
  } else {
    ctr.style.display = 'none';
  }
}

function updatePruneStats() {
  setText('prune-kept', pruneKept.length + ' kept');
  setText('prune-yeet', pruneYeet.length + ' yeet');
}

function updatePruneCount() {
  var remaining = pruneList.length - pruneIdx;
  setText('prune-count', remaining + ' left · ' + pruneList.length + ' total');
}

function updatePruneBar() {
  var bar  = document.getElementById('prune-bar');
  var pct  = pruneList.length > 0 ? (pruneIdx / pruneList.length * 100) : 0;
  if (bar) bar.style.width = pct + '%';
}

function showDone() {
  document.getElementById('prune-arena').style.display = 'none';
  var done = document.getElementById('prune-done');
  done.style.display = 'flex';
  setText('pd-summary', pruneKept.length + ' accounts kept · ' + pruneYeet.length + ' added to Yeet List');
  var yl = document.getElementById('yeet-list');
  if (yl) {
    if (pruneYeet.length) {
      yl.innerHTML = '<div class="yeet-list-wrap"><p class="yeet-list-title">Yeet List — unfollow these</p>' +
        pruneYeet.map(function(u) { return '<div class="yeet-item">@' + esc(u) + '</div>'; }).join('') + '</div>';
    } else { yl.innerHTML = ''; }
  }
}

function restartPrune() { initPrune(); }

/* ═══════════════════════════════════════════════════════════
   FEATURE 2 — DIGITAL GRAVEYARD
   ═══════════════════════════════════════════════════════════ */
function initGraveyard() {
  var snaps = loadSnaps();
  var gyEmpty   = document.getElementById('gy-empty');
  var gyContent = document.getElementById('gy-content');
  if (!gyEmpty || !gyContent) return;

  if (snaps.length < 2) {
    gyEmpty.style.display   = 'flex';
    gyContent.style.display = 'none';
    return;
  }

  var latest = snaps[0];
  var prev   = snaps[1];
  /* Vanished: were in prev followers/following, now the account is completely gone
     We detect accounts that were in prev.followers but NOT in latest.followers AND
     also not in latest.following — meaning they disappeared entirely */
  var prevAll   = new Set(prev.followers.concat(prev.following));
  var latestAll = new Set(latest.followers.concat(latest.following));
  var vanished  = Array.from(prevAll).filter(function(u) { return !latestAll.has(u); });

  if (!vanished.length) {
    gyEmpty.innerHTML = '<div class="empty-box" style="font-size:36px">👻</div><h2>The graveyard is quiet</h2><p>No accounts vanished between your two most recent snapshots.</p>';
    gyEmpty.style.display   = 'flex';
    gyContent.style.display = 'none';
    return;
  }

  gyEmpty.style.display   = 'none';
  gyContent.style.display = 'block';

  /* Build tombstone decorations */
  buildTombstones();

  /* Count text */
  setText('gy-count-text', vanished.length + ' account' + (vanished.length === 1 ? '' : 's') + ' lost between snapshots');

  /* Build list */
  var list = document.getElementById('gy-list');
  if (!list) return;
  list.innerHTML = vanished.map(function(u, i) {
    var days = getDaysInList(u, prev);
    var badge = i % 3 === 0 ? 'gy-badge-void' : i % 3 === 1 ? 'gy-badge-echo' : 'gy-badge-null';
    var label = i % 3 === 0 ? 'VOID' : i % 3 === 1 ? 'ECHO' : 'NULL';
    var dur   = (5 + Math.random() * 8).toFixed(1) + 's';
    var delay = (i * 0.07).toFixed(2) + 's';
    return '<div class="gy-entry" style="--flicker-dur:' + dur + ';animation-delay:' + delay + '">' +
      tombstoneIcon(i) +
      '<div class="gy-info">' +
        '<p class="gy-username">@' + esc(u) + '</p>' +
        '<p class="gy-days">' + days + '</p>' +
      '</div>' +
      '<span class="gy-badge ' + badge + '">' + label + '</span>' +
    '</div>';
  }).join('');
}

function getDaysInList(u, snap) {
  /* Approximate — if snapshot has timestamps use them, else just say "present" */
  return 'was in your network · now gone';
}

function tombstoneIcon(i) {
  /* Alternate 3 tombstone shapes */
  var shapes = [
    /* Rounded top tomb */
    '<svg class="tomb-svg" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="4" y="14" width="20" height="18" rx="1" fill="rgba(120,80,180,0.1)" stroke="rgba(180,140,240,0.25)" stroke-width="1"/>' +
      '<path d="M4 14 Q4 4 14 4 Q24 4 24 14Z" fill="rgba(120,80,180,0.12)" stroke="rgba(180,140,240,0.25)" stroke-width="1"/>' +
      '<line x1="14" y1="8" x2="14" y2="18" stroke="rgba(180,140,240,0.3)" stroke-width="1"/>' +
      '<line x1="10" y1="12" x2="18" y2="12" stroke="rgba(180,140,240,0.3)" stroke-width="1"/>' +
    '</svg>',
    /* Pointed top tomb */
    '<svg class="tomb-svg" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="4" y="12" width="20" height="20" rx="1" fill="rgba(100,60,160,0.1)" stroke="rgba(160,120,220,0.2)" stroke-width="1"/>' +
      '<polygon points="14,2 24,12 4,12" fill="rgba(100,60,160,0.12)" stroke="rgba(160,120,220,0.2)" stroke-width="1"/>' +
      '<line x1="14" y1="16" x2="14" y2="22" stroke="rgba(160,120,220,0.25)" stroke-width="1"/>' +
      '<line x1="11" y1="19" x2="17" y2="19" stroke="rgba(160,120,220,0.25)" stroke-width="1"/>' +
    '</svg>',
    /* Simple rectangle tomb */
    '<svg class="tomb-svg" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="4" y="8" width="20" height="24" rx="2" fill="rgba(80,50,140,0.1)" stroke="rgba(140,100,200,0.18)" stroke-width="1"/>' +
      '<rect x="4" y="8" width="20" height="4" rx="2" fill="rgba(80,50,140,0.15)" stroke="rgba(140,100,200,0.2)" stroke-width="1"/>' +
      '<line x1="14" y1="16" x2="14" y2="24" stroke="rgba(140,100,200,0.22)" stroke-width="1"/>' +
      '<line x1="10" y1="20" x2="18" y2="20" stroke="rgba(140,100,200,0.22)" stroke-width="1"/>' +
      '<text x="14" y="30" text-anchor="middle" font-size="6" fill="rgba(140,100,200,0.3)" font-family="monospace">RIP</text>' +
    '</svg>'
  ];
  return '<div class="gy-tomb-icon">' + shapes[i % 3] + '</div>';
}

function buildTombstones() {
  var container = document.getElementById('gy-tombs');
  if (!container) return;
  var sizes = [
    { tw:28, th:36, bw:28, bh:28 },
    { tw:20, th:26, bw:20, bh:22 },
    { tw:34, th:44, bw:34, bh:32 },
    { tw:22, th:30, bw:22, bh:24 },
    { tw:30, th:38, bw:30, bh:30 },
    { tw:18, th:24, bw:18, bh:20 }
  ];
  container.innerHTML = sizes.map(function(s, i) {
    return '<div class="tomb-shape" style="animation-delay:' + (i * 0.3) + 's">' +
      '<div class="tomb-top" style="width:' + s.tw + 'px;height:' + Math.round(s.tw/2) + 'px"></div>' +
      '<div class="tomb-body" style="width:' + s.bw + 'px;height:' + s.bh + 'px"></div>' +
    '</div>';
  }).join('');
}

/* ═══════════════════════════════════════════════════════════
   FEATURE 3 — NETWORK PHYSICS MATRIX
   ═══════════════════════════════════════════════════════════ */
var matrixState = {
  nodes: [],
  filter: 'all',
  canvas: null,
  ctx: null,
  width: 0,
  height: 0,
  hoveredNode: null,
  dragNode: null,
  dragOffX: 0,
  dragOffY: 0,
  animId: null,
  initialized: false
};

var COLORS = {
  og:       { fill: '#1e40af', stroke: '#3b82f6', glow: 'rgba(59,130,246,0.5)' },
  veteran:  { fill: '#3730a3', stroke: '#818cf8', glow: 'rgba(129,140,248,0.4)' },
  regular:  { fill: '#0c4a6e', stroke: '#38bdf8', glow: 'rgba(56,189,248,0.35)' },
  recent:   { fill: '#831843', stroke: '#f472b6', glow: 'rgba(244,114,182,0.4)' },
  ghost:    { fill: '#7f1d1d', stroke: '#f87171', glow: 'rgba(248,113,113,0.35)' }
};

function getNodeType(username, days, ghostSet) {
  if (ghostSet.has(username)) return 'ghost';
  if (days >= 1000) return 'og';
  if (days >= 365)  return 'veteran';
  if (days <= 30)   return 'recent';
  return 'regular';
}

function getNodeRadius(type) {
  return { og: 7, veteran: 5.5, regular: 4, recent: 3, ghost: 4.5 }[type] || 4;
}

function initMatrix() {
  if (matrixState.initialized) { renderMatrixFilter(matrixState.filter); return; }
  var snaps = loadSnaps();
  if (!snaps.length) return;
  var latest  = snaps[0];
  var fSet    = new Set(latest.followers);
  var ghostSet = new Set(latest.following.filter(function(u) { return !fSet.has(u); }));

  var canvas = document.getElementById('matrix-canvas');
  if (!canvas) return;
  var rect   = canvas.getBoundingClientRect();
  var W = canvas.offsetWidth, H = 520;
  canvas.width  = W;
  canvas.height = H;
  matrixState.canvas = canvas;
  matrixState.ctx    = canvas.getContext('2d');
  matrixState.width  = W;
  matrixState.height = H;

  /* Build nodes from followers */
  var now = Date.now() / 1000;
  matrixState.nodes = latest.followers.map(function(u, i) {
    var ts   = (latest._followingTimestamps && latest._followingTimestamps[u]) || (now - Math.random() * 3 * 365 * 86400);
    var days = Math.floor((now - ts) / 86400);
    var type = getNodeType(u, days, ghostSet);
    var r    = getNodeRadius(type);
    return {
      u: u, days: days, type: type, r: r,
      x: r + Math.random() * (W - r * 2),
      y: r + Math.random() * (H - r * 2),
      vx: (Math.random() - .5) * .3,
      vy: (Math.random() - .5) * .3,
      visible: true
    };
  });

  /* Events */
  canvas.addEventListener('mousemove', onMatrixMouseMove);
  canvas.addEventListener('mousedown', onMatrixMouseDown);
  canvas.addEventListener('mouseup',   onMatrixMouseUp);
  canvas.addEventListener('mouseleave', function() {
    matrixState.hoveredNode = null;
    document.getElementById('matrix-tip').style.display = 'none';
    canvas.style.cursor = 'crosshair';
  });
  canvas.addEventListener('touchstart',  onMatrixTouchStart, { passive: true });
  canvas.addEventListener('touchmove',   onMatrixTouchMove,  { passive: true });
  canvas.addEventListener('touchend',    function() { matrixState.dragNode = null; });

  /* Filter buttons */
  document.querySelectorAll('.mf').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.mf').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      renderMatrixFilter(btn.dataset.filter);
    });
  });

  matrixState.initialized = true;
  renderMatrixFilter('all');
  matrixLoop();
}

function renderMatrixFilter(filter) {
  matrixState.filter = filter;
  matrixState.nodes.forEach(function(n) {
    if (filter === 'all') { n.visible = true; }
    else if (filter === 'og')      { n.visible = n.type === 'og'; }
    else if (filter === 'veteran') { n.visible = n.type === 'veteran' || n.type === 'og'; }
    else if (filter === 'recent')  { n.visible = n.type === 'recent'; }
    else if (filter === 'ghost')   { n.visible = n.type === 'ghost'; }
    /* Apply gravity: OG/veteran sink, recent float */
    if (n.visible) {
      if (filter === 'og' || filter === 'veteran') { n.vy += .08; }
      if (filter === 'recent') { n.vy -= .06; }
    }
  });
}

function matrixLoop() {
  if (matrixState.animId) cancelAnimationFrame(matrixState.animId);
  function tick() {
    drawMatrix();
    matrixState.animId = requestAnimationFrame(tick);
  }
  tick();
}

function drawMatrix() {
  var st  = matrixState;
  var ctx = st.ctx;
  var W   = st.width, H = st.height;
  ctx.clearRect(0, 0, W, H);

  /* Deep space bg */
  ctx.fillStyle = 'rgba(3,7,18,0)';
  ctx.fillRect(0, 0, W, H);

  /* Draw faint star field */
  if (!st._stars) {
    st._stars = [];
    for (var s = 0; s < 120; s++) {
      st._stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.2, o: Math.random() * .4 + .1 });
    }
  }
  st._stars.forEach(function(star) {
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + star.o + ')';
    ctx.fill();
  });

  /* Draw constellation lines between nearby OG nodes */
  var ogs = st.nodes.filter(function(n) { return n.visible && n.type === 'og'; });
  ctx.strokeStyle = 'rgba(59,130,246,0.07)';
  ctx.lineWidth   = .5;
  for (var i = 0; i < ogs.length && i < 60; i++) {
    for (var j = i + 1; j < ogs.length && j < 60; j++) {
      var dx = ogs[i].x - ogs[j].x, dy = ogs[i].y - ogs[j].y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 80) {
        ctx.globalAlpha = (1 - dist / 80) * .3;
        ctx.beginPath();
        ctx.moveTo(ogs[i].x, ogs[i].y);
        ctx.lineTo(ogs[j].x, ogs[j].y);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  /* Physics update & draw nodes */
  st.nodes.forEach(function(n) {
    if (!n.visible) return;
    if (n === st.dragNode) return;
    /* Gentle float */
    n.vx += (Math.random() - .5) * .008;
    n.vy += (Math.random() - .5) * .008;
    /* Damping */
    n.vx *= .985; n.vy *= .985;
    n.x += n.vx;  n.y += n.vy;
    /* Bounce walls */
    if (n.x - n.r < 0)    { n.x = n.r;    n.vx = Math.abs(n.vx) * .7; }
    if (n.x + n.r > W)    { n.x = W - n.r; n.vx = -Math.abs(n.vx) * .7; }
    if (n.y - n.r < 0)    { n.y = n.r;    n.vy = Math.abs(n.vy) * .7; }
    if (n.y + n.r > H)    { n.y = H - n.r; n.vy = -Math.abs(n.vy) * .7; }
    drawNode(ctx, n, n === st.hoveredNode);
  });

  /* Draw drag node last */
  if (st.dragNode && st.dragNode.visible) {
    drawNode(ctx, st.dragNode, true);
  }
}

function drawNode(ctx, n, hovered) {
  var c = COLORS[n.type] || COLORS.regular;
  var r = hovered ? n.r * 1.8 : n.r;
  /* Glow */
  if (hovered || n.type === 'og') {
    ctx.save();
    ctx.shadowBlur  = hovered ? 18 : 10;
    ctx.shadowColor = c.glow;
  }
  /* Fill */
  ctx.beginPath();
  ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
  ctx.fillStyle = c.fill;
  ctx.fill();
  /* Stroke */
  ctx.strokeStyle = c.stroke;
  ctx.lineWidth   = hovered ? 1.5 : 0.8;
  ctx.stroke();
  if (hovered || n.type === 'og') ctx.restore();
  /* Inner highlight dot for OG */
  if (n.type === 'og') {
    ctx.beginPath();
    ctx.arc(n.x - r * .3, n.y - r * .3, r * .25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();
  }
}

/* ── Matrix interactions ───────────────────────── */
function getMatrixNodeAt(mx, my) {
  var found = null, bestR = Infinity;
  matrixState.nodes.forEach(function(n) {
    if (!n.visible) return;
    var dx = n.x - mx, dy = n.y - my;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var hit  = Math.max(n.r * 2, 8);
    if (dist < hit && dist < bestR) { bestR = dist; found = n; }
  });
  return found;
}

function onMatrixMouseMove(e) {
  var rect = matrixState.canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  if (matrixState.dragNode) {
    matrixState.dragNode.x = mx + matrixState.dragOffX;
    matrixState.dragNode.y = my + matrixState.dragOffY;
    matrixState.dragNode.vx = 0; matrixState.dragNode.vy = 0;
    return;
  }
  var node = getMatrixNodeAt(mx, my);
  matrixState.hoveredNode = node;
  matrixState.canvas.style.cursor = node ? 'pointer' : 'crosshair';
  var tip = document.getElementById('matrix-tip');
  if (node && tip) {
    tip.style.display = 'block';
    tip.style.left    = (e.clientX + 14) + 'px';
    tip.style.top     = (e.clientY - 10) + 'px';
    var typeLabel = { og:'OG Follower', veteran:'Veteran', regular:'Regular', recent:'Recent', ghost:'Ghost (not following back)' }[node.type] || node.type;
    tip.innerHTML = '<p class="mt-user">@' + esc(node.u) + '</p>' +
      '<p class="mt-days">' + node.days + ' days ago</p>' +
      '<p class="mt-type">' + typeLabel + '</p>';
  } else if (tip) { tip.style.display = 'none'; }
}

function onMatrixMouseDown(e) {
  var rect = matrixState.canvas.getBoundingClientRect();
  var mx = e.clientX - rect.left, my = e.clientY - rect.top;
  var node = getMatrixNodeAt(mx, my);
  if (node) {
    matrixState.dragNode  = node;
    matrixState.dragOffX  = node.x - mx;
    matrixState.dragOffY  = node.y - my;
    matrixState.canvas.style.cursor = 'grabbing';
  }
}
function onMatrixMouseUp(e) {
  if (matrixState.dragNode) {
    /* Fling! */
    var rect = matrixState.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left, my = e.clientY - rect.top;
    matrixState.dragNode.vx = (mx - (matrixState.dragNode.x - matrixState.dragOffX)) * 0.2;
    matrixState.dragNode.vy = (my - (matrixState.dragNode.y - matrixState.dragOffY)) * 0.2;
    matrixState.dragNode = null;
    matrixState.canvas.style.cursor = 'crosshair';
  }
}
function onMatrixTouchStart(e) {
  var rect = matrixState.canvas.getBoundingClientRect();
  var mx = e.touches[0].clientX - rect.left, my = e.touches[0].clientY - rect.top;
  var node = getMatrixNodeAt(mx, my);
  if (node) { matrixState.dragNode = node; matrixState.dragOffX = node.x - mx; matrixState.dragOffY = node.y - my; }
}
function onMatrixTouchMove(e) {
  if (!matrixState.dragNode) return;
  var rect = matrixState.canvas.getBoundingClientRect();
  var mx = e.touches[0].clientX - rect.left, my = e.touches[0].clientY - rect.top;
  matrixState.dragNode.x = mx + matrixState.dragOffX;
  matrixState.dragNode.y = my + matrixState.dragOffY;
}

/* ── Hook features into tab switching ─────────── */
var _origSwitchTab = switchTab;
switchTab = function(name) {
  _origSwitchTab(name);
  if (name === 'prune')     initPrune();
  if (name === 'graveyard') initGraveyard();
  if (name === 'matrix')    initMatrix();
};
