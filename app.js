'use strict';
/* ════════════════════════════════════════════════════════════
   FOLLOWLY — production application
   Storage keys unchanged (v2) so existing snapshots survive.
   Parser: title-field priority + /_u/ URL handling (verified
   against real Instagram exports).
   ════════════════════════════════════════════════════════════ */

/* ── Storage ─────────────────────────────────────────────── */
var SK='followly_snaps_v2',LK='followly_labels_v2',WK='followly_wl_v2',AK='followly_alert_v2';
function gs(){try{return JSON.parse(localStorage.getItem(SK)||'[]');}catch(e){return[];}}
function ss(s){localStorage.setItem(SK,JSON.stringify(s));}
function gl(){try{return JSON.parse(localStorage.getItem(LK)||'{}');}catch(e){return{};}}
function sl(l){localStorage.setItem(LK,JSON.stringify(l));}
function gwl(){try{return JSON.parse(localStorage.getItem(WK)||'[]');}catch(e){return[];}}
function swl(w){localStorage.setItem(WK,JSON.stringify(w));}

/* ── State ───────────────────────────────────────────────── */
var pF=null,pFo=null,pFTs=null,pFoTs=null;          /* pending upload */
var browseMode='nfb',wlMode=false,currentUser='';
var sortState={nfb:'az',ydnfb:'az',browse:'az'};
var DASH_CAP=120;
/* Prune */
var PQ=[],PI=0,PK=[],PY=[],PS=0,PDrag=false,PDX=0,PDY=0,PSX=0,PSY=0;
/* Matrix */
var MP=[],MFil='all',MSnap=null,MRAF=null,MDragN=null,MStars=null;

/* ════════════════════════════════════════════════════════════
   BOOT
   ════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',function(){
  initAmbient();
  initCursorGlow();
  initNav();
  initBrowseFilters();
  var bs=document.getElementById('browse-search');
  if(bs)bs.addEventListener('input',renderBrowse);
  updateSnapLabel();
  var ds=document.getElementById('dash-date');
  if(ds)ds.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase();
  renderDash();
  checkAlert();
});

/* ── Ambient orbs (clearRect — no GPU thrash) ────────────── */
function initAmbient(){
  var c=document.getElementById('orb-canvas');if(!c)return;
  var ctx=c.getContext('2d');
  var orbs=[
    {cx:.14,cy:.12,vx:.00009,vy:.00007,col:'rgba(244,114,182,0.11)',r:.34},
    {cx:.84,cy:.36,vx:-.00008,vy:.00009,col:'rgba(129,140,248,0.09)',r:.28},
    {cx:.44,cy:.80,vx:.00006,vy:-.0001,col:'rgba(45,212,191,0.065)',r:.24}
  ];
  var t=0,W=0,H=0;
  function rs(){W=window.innerWidth;H=window.innerHeight;c.width=W;c.height=H;}
  rs();window.addEventListener('resize',rs,{passive:true});
  (function draw(){
    t++;ctx.clearRect(0,0,W,H);
    for(var i=0;i<orbs.length;i++){
      var o=orbs[i];
      o.cx+=Math.sin(t*o.vx*.7)*.00035;o.cy+=Math.cos(t*o.vy*.8)*.00028;
      o.cx=Math.max(.05,Math.min(.95,o.cx));o.cy=Math.max(.05,Math.min(.95,o.cy));
      var gx=o.cx*W,gy=o.cy*H,gr=o.r*Math.max(W,H);
      var g=ctx.createRadialGradient(gx,gy,0,gx,gy,gr);
      g.addColorStop(0,o.col);g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(gx,gy,gr,0,Math.PI*2);ctx.fill();
    }
    requestAnimationFrame(draw);
  })();
}

/* ── Cursor glow (single transform, rAF-throttled) ───────── */
function initCursorGlow(){
  var glow=document.getElementById('cursor-glow');if(!glow)return;
  var x=0,y=0,raf=null;
  document.addEventListener('mousemove',function(e){
    x=e.clientX;y=e.clientY;
    if(!document.body.classList.contains('cursor-on'))document.body.classList.add('cursor-on');
    if(!raf)raf=requestAnimationFrame(function(){
      glow.style.transform='translate('+(x-260)+'px,'+(y-260)+'px)';
      raf=null;
    });
  },{passive:true});
}

/* ── Nav ─────────────────────────────────────────────────── */
function initNav(){
  document.querySelectorAll('.nb').forEach(function(b){
    b.addEventListener('click',function(){switchTab(b.dataset.tab);});
  });
}
function switchTab(name){
  if(name!=='matrix'&&MRAF){cancelAnimationFrame(MRAF);MRAF=null;}
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

/* ── Alert banner ────────────────────────────────────────── */
function checkAlert(){
  var snaps=gs();if(snaps.length<2)return;
  var lat=snaps[0],prev=snaps[1];
  if(localStorage.getItem(AK)===String(lat.ts))return;
  var fSet=new Set(lat.followers),pfs=new Set(prev.followers);
  var lost=prev.followers.filter(function(u){return !fSet.has(u);});
  var fresh=lat.followers.filter(function(u){return !pfs.has(u);});
  var parts=[];
  if(fresh.length)parts.push('+'+fresh.length+' new follower'+(fresh.length>1?'s':''));
  if(lost.length)parts.push(lost.length+' unfollow'+(lost.length>1?'s':''));
  if(!parts.length)return;
  var b=document.getElementById('alert-banner'),t=document.getElementById('alert-text');
  if(b&&t){
    t.textContent='Since last snapshot: '+parts.join(' · ');
    b.style.display='block';
    var a=document.querySelector('.app');if(a)a.style.paddingTop='50px';
    localStorage.setItem(AK,String(lat.ts));
  }
}
function dismissAlert(){
  var b=document.getElementById('alert-banner');if(b)b.style.display='none';
  var a=document.querySelector('.app');if(a)a.style.paddingTop='';
}

/* ════════════════════════════════════════════════════════════
   PARSER — handles every known Instagram export format.
   Priority: title → string_list_data.value → href (/_u/ aware)
   → flat string → {value}. Verified against real exports.
   ════════════════════════════════════════════════════════════ */
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
  var results=[],ts={};
  for(var i=0;i<arr.length;i++){
    var item=arr[i];if(!item)continue;
    var v=null,stamp=null;
    if(item.title&&typeof item.title==='string'&&item.title.trim()){
      v=item.title.trim();
      if(item.string_list_data&&item.string_list_data[0]&&typeof item.string_list_data[0].timestamp==='number')stamp=item.string_list_data[0].timestamp;
    }
    else if(item.string_list_data&&Array.isArray(item.string_list_data)){
      for(var j=0;j<item.string_list_data.length;j++){
        var e=item.string_list_data[j];if(!e)continue;
        if(typeof e.timestamp==='number')stamp=e.timestamp;
        if(e.value&&typeof e.value==='string'&&e.value.trim()){v=e.value.trim();break;}
        if(e.href&&typeof e.href==='string'){
          var m1=e.href.match(/instagram\.com\/_u\/([^\/\?&#]+)/);
          if(m1&&m1[1]){v=m1[1].trim();break;}
          var m2=e.href.match(/instagram\.com\/([^\/\?&#]+)/);
          if(m2&&m2[1]&&m2[1]!=='_u'){v=m2[1].trim();break;}
        }
      }
    }
    else if(typeof item==='string'&&item.trim()){v=item.trim();}
    else if(item.value&&typeof item.value==='string'&&item.value.trim()){v=item.value.trim();}
    if(v){v=v.replace(/^@+/,'').trim();if(v){results.push(v);if(stamp&&!ts[v])ts[v]=stamp;}}
  }
  var seen={},out=[],outTs={};
  for(var k=0;k<results.length;k++){
    if(results[k]&&!seen[results[k]]){seen[results[k]]=true;out.push(results[k]);if(ts[results[k]]!==undefined)outTs[results[k]]=ts[results[k]];}
  }
  return{users:out,timestamps:outTs};
}

/* ── Upload ──────────────────────────────────────────────── */
function handleFile(type,input){
  var file=input.files&&input.files[0];if(!file)return;
  var isF=(type==='followers');
  var dz=document.getElementById(isF?'dz-followers':'dz-following');
  var st=document.getElementById(isF?'st-f':'st-fo');
  if(st){st.textContent='Reading…';st.className='dz-st';}
  var r=new FileReader();
  r.onload=function(ev){
    try{
      var p=parseIG(ev.target.result,type);
      if(!p.users.length)throw new Error('No usernames found — check the file');
      if(isF){pF=p.users;pFTs=p.timestamps;}else{pFo=p.users;pFoTs=p.timestamps;}
      if(st){st.textContent='✓  '+p.users.length.toLocaleString()+' accounts loaded';st.className='dz-st ok';}
      if(dz)dz.classList.add('loaded');
    }catch(err){
      if(isF){pF=null;pFTs=null;}else{pFo=null;pFoTs=null;}
      if(st){st.textContent='✗  '+err.message;st.className='dz-st err';}
      if(dz)dz.classList.remove('loaded');
    }
    refreshUpUI();
  };
  r.onerror=function(){if(st){st.textContent='✗  Could not read file';st.className='dz-st err';}};
  r.readAsText(file,'UTF-8');
}
function refreshUpUI(){
  var ready=!!(pF&&pFo);
  var btn=document.getElementById('btn-save');if(btn)btn.disabled=!ready;
  var msg=document.getElementById('upload-msg');if(!msg)return;
  if(ready){msg.style.display='block';msg.className='umsg info';msg.textContent='Both files loaded — press Save snapshot.';}
  else if(pF||pFo){msg.style.display='block';msg.className='umsg info';msg.textContent='Upload both files to continue.';}
  else msg.style.display='none';
}
function saveSnapshot(){
  if(!pF||!pFo)return;
  var snaps=gs();
  snaps.unshift({ts:Date.now(),followers:pF,following:pFo,_followerTimestamps:pFTs||{},_followingTimestamps:pFoTs||{}});
  if(snaps.length>50)snaps.length=50;
  ss(snaps);updateSnapLabel();
  var msg=document.getElementById('upload-msg');
  if(msg){msg.style.display='block';msg.className='umsg success';msg.textContent='✓  Snapshot saved — open Dashboard to see your stats.';}
  var btn=document.getElementById('btn-save');if(btn)btn.disabled=true;
}
function clearUpload(){
  pF=null;pFo=null;pFTs=null;pFoTs=null;
  ['f','fo'].forEach(function(s){
    var i=document.getElementById('inp-'+s);if(i)i.value='';
    var st=document.getElementById('st-'+s);if(st){st.textContent='';st.className='dz-st';}
  });
  var d1=document.getElementById('dz-followers');if(d1)d1.classList.remove('loaded');
  var d2=document.getElementById('dz-following');if(d2)d2.classList.remove('loaded');
  var msg=document.getElementById('upload-msg');if(msg)msg.style.display='none';
  var btn=document.getElementById('btn-save');if(btn)btn.disabled=true;
}

/* ════════════════════════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════════════════════════ */
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
  /* Animated count-up on KPI numbers */
  countUp('kpi-f',lat.followers.length);
  countUp('kpi-fo',lat.following.length);
  countUp('kpi-nfb',nfb.length);
  countUp('kpi-ydnfb',ydnfb.length);
  var df=document.getElementById('kd-f'),dfo=document.getElementById('kd-fo');
  if(prev&&df&&dfo){
    var d1=lat.followers.length-prev.followers.length,d2=lat.following.length-prev.following.length;
    df.textContent=(d1>=0?'+':'')+d1+' since last';df.className='kd '+(d1>=0?'up':'down');
    dfo.textContent=(d2>=0?'+':'')+d2+' since last';dfo.className='kd '+(d2>=0?'up':'down');
  }else{if(df){df.textContent='First snapshot';df.className='kd';}if(dfo){dfo.textContent='';dfo.className='kd';}}
  var cw=document.getElementById('changes-s');
  if(prev&&cw){
    var pfs=new Set(prev.followers),pfos=new Set(prev.following);
    var newF=lat.followers.filter(function(u){return !pfs.has(u);});
    var lostF=prev.followers.filter(function(u){return !fSet.has(u);});
    var newFol=lat.following.filter(function(u){return !pfos.has(u);});
    var lostFol=prev.following.filter(function(u){return !folSet.has(u);});
    set('ch-since','vs '+fmtDate(prev.ts));cw.style.display='block';
    var cg=document.getElementById('cgrid');
    if(cg)cg.innerHTML=mkCC('New followers',newF,'chip-gn')+mkCC('Unfollowed you',lostF,'chip-rd')+mkCC('You started following',newFol,'chip-vi')+mkCC('You unfollowed',lostFol,'chip-pk');
  }else if(cw)cw.style.display='none';
  set('b-nfb',fmt(nfb.length)+' accounts');set('b-ydnfb',fmt(ydnfb.length)+' accounts');
  renderGrid('nfb');renderGrid('ydnfb');
}

/* KPI number count-up animation */
function countUp(id,target){
  var el=document.getElementById(id);if(!el)return;
  var start=0,dur=900,t0=null;
  function step(ts){
    if(!t0)t0=ts;
    var p=Math.min((ts-t0)/dur,1);
    var eased=1-Math.pow(1-p,3); /* easeOutCubic */
    el.textContent=fmt(Math.round(start+(target-start)*eased));
    if(p<1)requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderGrid(id){
  var snaps=gs();if(!snaps.length)return;
  var lat=snaps[0];
  var fSet=new Set(lat.followers),folSet=new Set(lat.following);
  var wlSet=new Set(gwl());
  var list,el,sEl,tsMap;
  if(id==='nfb'){
    list=lat.following.filter(function(u){return !fSet.has(u);});
    if(!wlMode)list=list.filter(function(u){return !wlSet.has(u);});
    el=document.getElementById('grid-nfb');sEl=document.getElementById('s-nfb');
    tsMap=lat._followingTimestamps;
  }else{
    list=lat.followers.filter(function(u){return !folSet.has(u);});
    el=document.getElementById('grid-ydnfb');sEl=document.getElementById('s-ydnfb');
    tsMap=lat._followerTimestamps;
  }
  var q=sEl?sEl.value.toLowerCase().trim():'';
  if(q)list=list.filter(function(u){return u.toLowerCase().indexOf(q)!==-1;});
  list=applySort(list,sortState[id],tsMap);
  if(!el)return;
  el.className='pgrid'+(wlMode&&id==='nfb'?' wl-mode':'');
  el.innerHTML=list.length
    ?list.slice(0,DASH_CAP).map(function(u,i){return mkPC(u,i,wlSet.has(u));}).join('')+(list.length>DASH_CAP?'<div class="gempty" style="grid-column:1/-1">Showing '+DASH_CAP+' of '+fmt(list.length)+' — use Browse to see them all</div>':'')
    :'<div class="gempty">None found</div>';
}
function reRenderAll(){renderGrid('nfb');renderGrid('ydnfb');renderBrowse();}

/* ── Sort ────────────────────────────────────────────────── */
function setSort(g,d,btn){
  sortState[g]=d;
  document.querySelectorAll('.sp[data-g="'+g+'"]').forEach(function(b){b.classList.toggle('active',b.dataset.s===d);});
  if(g==='nfb')renderGrid('nfb');
  if(g==='ydnfb')renderGrid('ydnfb');
  if(g==='browse')renderBrowse();
}
function applySort(list,dir,tsMap){
  var c=list.slice();
  if(dir==='az')c.sort(function(a,b){return a.toLowerCase()<b.toLowerCase()?-1:1;});
  else if(dir==='za')c.sort(function(a,b){return a.toLowerCase()>b.toLowerCase()?-1:1;});
  else if(dir==='recent'||dir==='oldest'){
    tsMap=tsMap||{};
    c.sort(function(a,b){
      var ta=tsMap[a]||0,tb=tsMap[b]||0;
      return dir==='recent'?(tb-ta):(ta-tb);
    });
  }
  return c;
}

/* ════════════════════════════════════════════════════════════
   FEATURE 1 — SWIPE TO PRUNE
   ════════════════════════════════════════════════════════════ */
function initPrune(){
  var snaps=gs();
  var arena=document.getElementById('prune-arena'),done=document.getElementById('prune-done');
  if(!arena||!done)return;
  if(!snaps.length){
    arena.style.display='flex';done.style.display='none';
    var cs0=document.getElementById('card-stack');
    if(cs0)cs0.innerHTML='<p class="prune-empty">Upload a snapshot first.</p>';
    set('prune-count','');
    return;
  }
  var lat=snaps[0];
  var fSet=new Set(lat.followers),wlSet=new Set(gwl());
  PQ=lat.following.filter(function(u){return !fSet.has(u)&&!wlSet.has(u);});
  PI=0;PK=[];PY=[];PS=0;
  arena.style.display='flex';done.style.display='none';
  set('prune-kept','0 kept');set('prune-yeet','0 yeet');
  if(!PQ.length){
    var cs1=document.getElementById('card-stack');
    if(cs1)cs1.innerHTML='<p class="prune-empty">Nothing to prune — everyone follows you back.</p>';
    set('prune-count','');
    return;
  }
  buildPruneCards();
}
function buildPruneCards(){
  var stack=document.getElementById('card-stack');if(!stack)return;
  if(PI>=PQ.length){endPrune();return;}
  var pbar=document.getElementById('prune-bar'),pcnt=document.getElementById('prune-count'),sctr=document.getElementById('streak-ctr');
  if(pbar)pbar.style.width=Math.round(PI/Math.max(1,PQ.length)*100)+'%';
  if(pcnt)pcnt.textContent=PI+' / '+PQ.length;
  if(sctr)sctr.style.display=PS>=3?'flex':'none';
  if(PS>=3)set('streak-num',String(PS));
  stack.innerHTML='';
  for(var bi=2;bi>=1;bi--){
    if(PI+bi<PQ.length){var bg=document.createElement('div');bg.className='hc-back'+(bi===2?'2':'1');stack.appendChild(bg);}
  }
  var u=PQ[PI],col=avCol(u);
  var card=document.createElement('div');
  card.className='holo-card';
  card.innerHTML=
    '<div class="hc-shimmer"></div>'+
    '<div class="hc-topline" style="background:linear-gradient(90deg,transparent,'+col+',rgba(180,120,255,.6),transparent)"></div>'+
    '<div class="hc-label-k">KEEP ♥</div><div class="hc-label-y">YEET ✕</div>'+
    '<div class="hc-av-wrap"><div class="hc-av-ring"></div><div class="hc-av" style="color:'+col+';background:'+col+'18;border:1.5px solid '+col+'44">'+inits(u)+'</div></div>'+
    '<p class="hc-user">@'+esc(u)+'</p>'+
    '<p class="hc-days">Not following you back</p>'+
    '<a class="hc-iglink" href="'+igUrl(u)+'" target="_blank" rel="noopener" onmousedown="event.stopPropagation()" ontouchstart="event.stopPropagation()" onclick="event.stopPropagation()">View on Instagram ↗</a>';
  stack.appendChild(card);
  card.addEventListener('mousedown',pruneDown);
  card.addEventListener('touchstart',pruneDown,{passive:true});
}
function pruneDown(e){
  PDrag=true;
  var pt=e.touches?e.touches[0]:e;
  PSX=pt.clientX;PSY=pt.clientY;PDX=0;PDY=0;
  document.addEventListener('mousemove',pruneMove);
  document.addEventListener('touchmove',pruneMove,{passive:true});
  document.addEventListener('mouseup',pruneUp);
  document.addEventListener('touchend',pruneUp);
}
function pruneMove(e){
  if(!PDrag)return;
  var pt=e.touches?e.touches[0]:e;
  PDX=pt.clientX-PSX;PDY=pt.clientY-PSY;
  var card=document.querySelector('.holo-card');if(!card)return;
  card.style.transform='translate('+PDX+'px,'+PDY+'px) rotate('+(PDX*.07)+'deg)';
  card.classList.toggle('show-keep',PDX>30);
  card.classList.toggle('show-yeet',PDX<-30);
  var arena=document.getElementById('prune-arena');
  if(arena){arena.classList.toggle('dragging-right',PDX>30);arena.classList.toggle('dragging-left',PDX<-30);}
}
function pruneUp(){
  if(!PDrag)return;PDrag=false;
  document.removeEventListener('mousemove',pruneMove);
  document.removeEventListener('touchmove',pruneMove);
  document.removeEventListener('mouseup',pruneUp);
  document.removeEventListener('touchend',pruneUp);
  var arena=document.getElementById('prune-arena');
  if(arena)arena.classList.remove('dragging-right','dragging-left');
  if(Math.abs(PDX)>80){pruneSwipe(PDX>0?1:-1);}
  else{
    var card=document.querySelector('.holo-card');
    if(card){card.style.transition='transform .4s cubic-bezier(.16,1,.3,1)';card.style.transform='';card.classList.remove('show-keep','show-yeet');
      setTimeout(function(){if(card)card.style.transition='';},420);}
    PS=0;
  }
}
function pruneSwipe(dir){
  var card=document.querySelector('.holo-card');if(!card||PI>=PQ.length)return;
  var u=PQ[PI];
  card.style.transition='transform .38s cubic-bezier(.25,.46,.45,.94),opacity .35s';
  card.style.transform='translate('+(dir>0?700:-700)+'px,-80px) rotate('+(dir>0?28:-28)+'deg)';
  card.style.opacity='0';
  if(dir>0)PK.push(u);else PY.push(u);
  PS++;
  set('prune-kept',PK.length+' kept');set('prune-yeet',PY.length+' yeet');
  PI++;
  setTimeout(buildPruneCards,330);
}
function swipeCard(dir){pruneSwipe(dir);}
function endPrune(){
  var arena=document.getElementById('prune-arena'),done=document.getElementById('prune-done');
  if(!arena||!done)return;
  arena.style.display='none';done.style.display='flex';
  set('pd-summary','Kept '+PK.length+' · added '+PY.length+' to the Yeet List');
  var yl=document.getElementById('yeet-list');
  if(yl)yl.innerHTML=PY.length
    ?'<div class="yeet-list-wrap"><p class="yeet-list-title">Yeet List — unfollow these</p>'+PY.map(function(u){
        return '<div class="yeet-item"><a href="'+igUrl(u)+'" target="_blank" rel="noopener" style="color:var(--red);text-decoration:none">@'+esc(u)+' ↗</a></div>';
      }).join('')+'</div>'
    :'';
}
function restartPrune(){initPrune();}

/* ════════════════════════════════════════════════════════════
   FEATURE 2 — DIGITAL GRAVEYARD
   ════════════════════════════════════════════════════════════ */
function renderGraveyard(){
  var snaps=gs();
  var empty=document.getElementById('gy-empty'),content=document.getElementById('gy-content');
  if(!empty||!content)return;
  if(snaps.length<2){empty.style.display='flex';content.style.display='none';set('gy-count-text','Needs two snapshots');buildDecorTombs([]);return;}
  empty.style.display='none';content.style.display='block';
  var lat=snaps[0],prev=snaps[1];
  var latAll=new Set(lat.followers.concat(lat.following));
  var seen=new Set(),vanished=[];
  prev.followers.concat(prev.following).forEach(function(u){
    if(!seen.has(u)&&!latAll.has(u)){seen.add(u);vanished.push(u);}
  });
  set('gy-count-text',vanished.length+' account'+(vanished.length!==1?'s':'')+' lost between snapshots');
  buildDecorTombs(vanished);
  var listEl=document.getElementById('gy-list');if(!listEl)return;
  if(!vanished.length){
    listEl.innerHTML='<div class="gempty" style="background:rgba(120,80,180,.06);border-color:rgba(180,130,255,.15);color:rgba(180,130,255,.5)">No vanished accounts between these snapshots.</div>';
    return;
  }
  var sts=['void','ghost','null'],lbl={void:'VOID',ghost:'GHOST','null':'NULL'};
  listEl.innerHTML=vanished.map(function(u,i){
    var st=sts[i%3];
    return '<div class="gy-entry" style="animation-delay:'+(i*.06).toFixed(2)+'s;--fd:'+(5+Math.random()*7).toFixed(1)+'s" onclick="window.open(\''+igUrl(u)+'\',\'_blank\',\'noopener\')">'
      +'<div class="gy-tomb-icon">'+mkTombSVG(i)+'</div>'
      +'<div class="gy-info"><p class="gy-username">@'+esc(u)+'</p><p class="gy-meta">Was in your network — now gone</p></div>'
      +'<span class="gy-badge gy-badge-'+st+'">'+lbl[st]+'</span></div>';
  }).join('');
}
function buildDecorTombs(vanished){
  var el=document.getElementById('gy-tombs');if(!el)return;
  var n=Math.min(Math.max(vanished.length,5),8),html='';
  for(var i=0;i<n;i++){
    var h=42+Math.floor(Math.random()*26);
    var nm=vanished[i]?vanished[i].slice(0,6):'???';
    html+='<div class="tomb" style="animation-delay:'+(i*.35).toFixed(2)+'s" title="@'+esc(nm)+'">'
      +'<svg viewBox="0 0 38 '+(h+6)+'" fill="none" width="38" height="'+(h+6)+'">'
      +'<rect x="4" y="'+(h-22)+'" width="30" height="28" rx="2" fill="rgba(14,10,28,.92)" stroke="rgba(160,120,220,.3)" stroke-width="1"/>'
      +'<path d="M4 '+(h-22)+' L4 '+(h-22-Math.floor(h*.4))+' Q4 '+(h-22-Math.floor(h*.5))+' 19 '+(h-22-Math.floor(h*.5))+' Q34 '+(h-22-Math.floor(h*.5))+' 34 '+(h-22-Math.floor(h*.4))+' L34 '+(h-22)+' Z" fill="rgba(14,10,28,.92)" stroke="rgba(160,120,220,.3)" stroke-width="1"/>'
      +'<line x1="19" y1="'+(h-16)+'" x2="19" y2="'+(h-4)+'" stroke="rgba(180,140,240,.35)" stroke-width="1.5"/>'
      +'<line x1="13" y1="'+(h-11)+'" x2="25" y2="'+(h-11)+'" stroke="rgba(180,140,240,.35)" stroke-width="1.5"/>'
      +'</svg><div class="tomb-label">@'+esc(nm)+'</div></div>';
  }
  el.innerHTML=html;
}
function mkTombSVG(i){
  var v=[
    '<svg viewBox="0 0 30 38" fill="none"><rect x="3" y="16" width="24" height="20" rx="1" fill="rgba(14,10,28,.9)" stroke="rgba(160,120,220,.3)" stroke-width="1"/><path d="M3 16 L3 8 Q3 2 15 2 Q27 2 27 8 L27 16Z" fill="rgba(14,10,28,.9)" stroke="rgba(160,120,220,.3)" stroke-width="1"/><line x1="15" y1="6" x2="15" y2="14" stroke="rgba(180,140,240,.4)" stroke-width="1.2"/><line x1="11" y1="10" x2="19" y2="10" stroke="rgba(180,140,240,.4)" stroke-width="1.2"/><text x="15" y="32" text-anchor="middle" font-size="6" fill="rgba(160,120,220,.35)" font-family="monospace">RIP</text></svg>',
    '<svg viewBox="0 0 30 38" fill="none"><rect x="3" y="14" width="24" height="22" rx="2" fill="rgba(12,8,26,.9)" stroke="rgba(140,100,200,.28)" stroke-width="1"/><polygon points="15,2 27,14 3,14" fill="rgba(12,8,26,.9)" stroke="rgba(140,100,200,.28)" stroke-width="1"/><line x1="15" y1="18" x2="15" y2="26" stroke="rgba(160,120,220,.35)" stroke-width="1.2"/><line x1="11" y1="22" x2="19" y2="22" stroke="rgba(160,120,220,.35)" stroke-width="1.2"/></svg>',
    '<svg viewBox="0 0 30 38" fill="none"><rect x="2" y="10" width="26" height="26" rx="3" fill="rgba(10,8,24,.9)" stroke="rgba(120,80,200,.25)" stroke-width="1"/><rect x="2" y="10" width="26" height="5" rx="3" fill="rgba(10,8,24,.95)" stroke="rgba(120,80,200,.25)" stroke-width="1"/><line x1="15" y1="18" x2="15" y2="28" stroke="rgba(140,100,200,.3)" stroke-width="1.2"/><line x1="10" y1="23" x2="20" y2="23" stroke="rgba(140,100,200,.3)" stroke-width="1.2"/><text x="15" y="34" text-anchor="middle" font-size="5" fill="rgba(140,100,200,.3)" font-family="monospace">∅</text></svg>'
  ];
  return v[i%3];
}

/* ════════════════════════════════════════════════════════════
   FEATURE 3 — NETWORK PHYSICS MATRIX
   ════════════════════════════════════════════════════════════ */
var MCol={
  og:{fill:'rgba(59,130,246,.95)',glow:'rgba(59,130,246,.4)',r:7},
  veteran:{fill:'rgba(129,140,248,.9)',glow:'rgba(129,140,248,.35)',r:5},
  regular:{fill:'rgba(56,189,248,.8)',glow:'rgba(56,189,248,.3)',r:3.5},
  recent:{fill:'rgba(244,114,182,.85)',glow:'rgba(244,114,182,.35)',r:2.5},
  ghost:{fill:'rgba(248,113,113,.9)',glow:'rgba(248,113,113,.4)',r:4.5}
};
function mType(days,isGhost){
  if(isGhost)return'ghost';
  if(days>=1000)return'og';
  if(days>=365)return'veteran';
  if(days>=30)return'regular';
  return'recent';
}
function initMatrix(){
  if(MRAF){cancelAnimationFrame(MRAF);MRAF=null;}
  MStars=null;
  var snaps=gs();
  var canvas=document.getElementById('matrix-canvas');if(!canvas)return;
  canvas.width=canvas.offsetWidth;
  canvas.height=canvas.offsetHeight||520;
  if(!snaps.length){
    var c0=canvas.getContext('2d');
    c0.fillStyle='rgba(120,200,255,.3)';c0.font='14px monospace';c0.textAlign='center';
    c0.fillText('Upload a snapshot to see your network',canvas.width/2,canvas.height/2);
    return;
  }
  MSnap=snaps[0];
  document.querySelectorAll('.mf').forEach(function(b){
    b.onclick=function(){
      document.querySelectorAll('.mf').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');MFil=b.dataset.filter;applyMFilter();
    };
  });
  buildMP(canvas);
  startMLoop(canvas);
  bindMEvents(canvas);
}
function buildMP(canvas){
  var W=canvas.width,H=canvas.height;
  var followers=MSnap.followers;
  var fSet=new Set(MSnap.followers),folSet=new Set(MSnap.following);
  var tsMap=MSnap._followerTimestamps||{};
  var MAX=600;
  var list=followers.length<=MAX?followers:sampleArr(followers,MAX);
  var now=Date.now()/1000;
  MP=list.map(function(u){
    var isGhost=folSet.has(u)&&!fSet.has(u);
    var days=tsMap[u]?Math.floor((now-tsMap[u])/86400):Math.floor(Math.random()*1400+1);
    var type=mType(days,isGhost);
    var mc=MCol[type];
    return{u:u,days:days,type:type,r:mc.r,
      x:mc.r+Math.random()*(W-mc.r*2),y:mc.r+Math.random()*(H-mc.r*2),
      vx:(Math.random()-.5)*.35,vy:(Math.random()-.5)*.35,
      active:true,hov:false,ty:null};
  });
}
function sampleArr(arr,n){
  if(!arr.length)return[];
  var st=arr.length/n,o=[];
  for(var i=0;i<n;i++)o.push(arr[Math.floor(i*st)]);
  return o;
}
function applyMFilter(){
  var canvas=document.getElementById('matrix-canvas');
  var H=canvas?canvas.height:520;
  MP.forEach(function(p){
    if(MFil==='all'){p.active=true;p.ty=null;}
    else if(MFil==='og'){p.active=p.type==='og';p.ty=p.active?H*.72+Math.random()*40:null;}
    else if(MFil==='veteran'){p.active=p.type==='veteran';p.ty=p.active?H*.55+Math.random()*60:null;}
    else if(MFil==='recent'){p.active=p.type==='recent';p.ty=p.active?H*.1+Math.random()*60:null;}
    else if(MFil==='ghost'){p.active=p.type==='ghost';p.ty=p.active?H*.4+Math.random()*80:null;}
  });
}
function startMLoop(canvas){
  if(MRAF){cancelAnimationFrame(MRAF);MRAF=null;}
  var ctx=canvas.getContext('2d');
  var W=canvas.width,H=canvas.height;
  if(!MStars){
    MStars=[];
    for(var s=0;s<100;s++)MStars.push({x:Math.random()*W,y:Math.random()*H,r:Math.random()*.9+.2,o:Math.random()*.3+.07});
  }
  var last=0;
  function loop(ts){
    if(ts-last<18){MRAF=requestAnimationFrame(loop);return;}
    last=ts;
    ctx.clearRect(0,0,W,H);
    for(var s=0;s<MStars.length;s++){
      var st=MStars[s];
      ctx.beginPath();ctx.arc(st.x,st.y,st.r,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,'+st.o+')';ctx.fill();
    }
    var ogs=[];
    for(var i=0;i<MP.length;i++){if(MP[i].active&&MP[i].type==='og')ogs.push(MP[i]);}
    var lim=Math.min(ogs.length,45);
    ctx.lineWidth=.5;
    for(var a=0;a<lim;a++)for(var b=a+1;b<lim;b++){
      var dx=ogs[a].x-ogs[b].x,dy=ogs[a].y-ogs[b].y,d2=dx*dx+dy*dy;
      if(d2<4900){
        ctx.beginPath();ctx.moveTo(ogs[a].x,ogs[a].y);ctx.lineTo(ogs[b].x,ogs[b].y);
        ctx.strokeStyle='rgba(59,130,246,'+((1-Math.sqrt(d2)/70)*.22).toFixed(3)+')';ctx.stroke();
      }
    }
    for(var i=0;i<MP.length;i++){
      var p=MP[i];
      if(MDragN===p){p.vx=0;p.vy=0;}
      else{
        if(p.ty!==null){p.vy+=(p.ty-p.y)*.003;p.vy*=.88;}
        else{p.vx+=(Math.random()-.5)*.005;p.vy+=(Math.random()-.5)*.005;p.vx*=.994;p.vy*=.994;}
        p.x+=p.vx;p.y+=p.vy;
        if(p.x<p.r){p.x=p.r;p.vx=Math.abs(p.vx)*.6;}
        if(p.x>W-p.r){p.x=W-p.r;p.vx=-Math.abs(p.vx)*.6;}
        if(p.y<p.r){p.y=p.r;p.vy=Math.abs(p.vy)*.6;}
        if(p.y>H-p.r){p.y=H-p.r;p.vy=-Math.abs(p.vy)*.6;}
      }
      if(!p.active)continue;
      var mc=MCol[p.type];
      var r=p.hov?p.r*2.2:p.r;
      var gr=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*3);
      gr.addColorStop(0,mc.glow);gr.addColorStop(1,'rgba(0,0,0,0)');
      ctx.beginPath();ctx.arc(p.x,p.y,r*3,0,Math.PI*2);ctx.fillStyle=gr;ctx.fill();
      ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fillStyle=mc.fill;ctx.fill();
      ctx.beginPath();ctx.arc(p.x-r*.28,p.y-r*.28,r*.3,0,Math.PI*2);ctx.fillStyle='rgba(255,255,255,.2)';ctx.fill();
    }
    MRAF=requestAnimationFrame(loop);
  }
  MRAF=requestAnimationFrame(loop);
}
function bindMEvents(canvas){
  var tip=document.getElementById('matrix-tip');
  var lastMov=0;
  function findP(x,y){
    var best=null,bd=9999;
    for(var i=0;i<MP.length;i++){
      var p=MP[i];if(!p.active)continue;
      var d=Math.sqrt((p.x-x)*(p.x-x)+(p.y-y)*(p.y-y));
      if(d<Math.max(p.r*2,12)&&d<bd){bd=d;best=p;}
    }
    return best;
  }
  function xy(e){
    var rc=canvas.getBoundingClientRect();
    var pt=e.touches?e.touches[0]:e;
    return{x:pt.clientX-rc.left,y:pt.clientY-rc.top,cx:pt.clientX,cy:pt.clientY};
  }
  canvas.addEventListener('mousemove',function(e){
    var now=Date.now();if(now-lastMov<20)return;lastMov=now;
    var c=xy(e);
    if(MDragN){MDragN.x=c.x;MDragN.y=c.y;return;}
    var p=findP(c.x,c.y);
    for(var i=0;i<MP.length;i++)MP[i].hov=false;
    if(p){
      p.hov=true;canvas.style.cursor='pointer';
      if(tip){
        tip.style.display='block';tip.style.left=(c.cx+14)+'px';tip.style.top=(c.cy-10)+'px';
        var lbl={og:'OG Follower',veteran:'Veteran',regular:'Regular',recent:'New Follower',ghost:'Not Following Back'}[p.type]||p.type;
        tip.innerHTML='<p style="font-family:monospace;font-size:12px;color:#93c5fd">@'+esc(p.u)+'</p><p style="font-family:monospace;font-size:10px;color:rgba(96,165,250,.6);margin-top:3px">'+lbl+'</p>';
      }
    }else{canvas.style.cursor='crosshair';if(tip)tip.style.display='none';}
  });
  canvas.addEventListener('mousedown',function(e){var c=xy(e);var p=findP(c.x,c.y);if(p){MDragN=p;canvas.style.cursor='grabbing';}});
  canvas.addEventListener('mouseup',function(e){
    if(MDragN){var c=xy(e);MDragN.vx=(c.x-MDragN.x)*.12;MDragN.vy=(c.y-MDragN.y)*.12;MDragN=null;canvas.style.cursor='crosshair';}
  });
  canvas.addEventListener('click',function(e){
    var c=xy(e);var p=findP(c.x,c.y);
    if(p)window.open(igUrl(p.u),'_blank','noopener');
  });
  canvas.addEventListener('mouseleave',function(){MDragN=null;for(var i=0;i<MP.length;i++)MP[i].hov=false;if(tip)tip.style.display='none';canvas.style.cursor='crosshair';});
  canvas.addEventListener('touchstart',function(e){var c=xy(e);var p=findP(c.x,c.y);if(p)MDragN=p;},{passive:true});
  canvas.addEventListener('touchmove',function(e){if(!MDragN)return;var c=xy(e);MDragN.x=c.x;MDragN.y=c.y;},{passive:true});
  canvas.addEventListener('touchend',function(){MDragN=null;});
}

/* ════════════════════════════════════════════════════════════
   LABEL MODAL · WHITELIST
   ════════════════════════════════════════════════════════════ */
function openLabelModal(u){
  currentUser=u;
  var labels=gl(),wl=gwl();
  var m=document.getElementById('label-modal');if(!m)return;
  var av=document.getElementById('m-av'),un=document.getElementById('m-un');
  var ig=document.getElementById('m-iglink'),wb=document.getElementById('wl-mbtn');
  var col=avCol(u);
  if(av){av.style.background=col+'22';av.style.color=col;av.style.borderColor=col+'55';av.textContent=inits(u);}
  if(un)un.textContent='@'+u;
  if(ig)ig.href=igUrl(u);
  if(wb)wb.textContent=wl.indexOf(u)!==-1?'Remove from whitelist':'Add to whitelist';
  document.querySelectorAll('.lo').forEach(function(b){b.classList.toggle('active',b.dataset.l===(labels[u]||''));});
  m.style.display='flex';
}
function applyLabel(l){
  var labels=gl();
  if(l==='')delete labels[currentUser];else labels[currentUser]=l;
  sl(labels);
  document.querySelectorAll('.lo').forEach(function(b){b.classList.toggle('active',b.dataset.l===l);});
}
function closeModal(e){
  var m=document.getElementById('label-modal');
  if(e&&e.target!==m)return;
  if(m)m.style.display='none';
  reRenderAll();
}
function toggleWL(u){
  var wl=gwl(),idx=wl.indexOf(u);
  if(idx===-1)wl.push(u);else wl.splice(idx,1);
  swl(wl);
  var b=document.getElementById('wl-mbtn');
  if(b)b.textContent=idx===-1?'Remove from whitelist':'Add to whitelist';
  renderGrid('nfb');
}
function toggleWLMode(){
  wlMode=!wlMode;
  var b=document.getElementById('wl-toggle');if(b)b.classList.toggle('active',wlMode);
  renderGrid('nfb');
}

/* ════════════════════════════════════════════════════════════
   BROWSE · HISTORY
   ════════════════════════════════════════════════════════════ */
function initBrowseFilters(){
  document.querySelectorAll('.fp').forEach(function(b){
    b.addEventListener('click',function(){
      document.querySelectorAll('.fp').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');browseMode=b.dataset.mode;renderBrowse();
    });
  });
}
function renderBrowse(){
  var snaps=gs(),grid=document.getElementById('browse-grid'),sub=document.getElementById('browse-sub');
  if(!grid)return;
  if(!snaps.length){grid.innerHTML='<div class="gempty">No snapshots yet — upload your data first</div>';if(sub)sub.textContent='';return;}
  var lat=snaps[0];
  var fSet=new Set(lat.followers),folSet=new Set(lat.following),wlSet=new Set(gwl());
  var q=((document.getElementById('browse-search')||{}).value||'').toLowerCase().trim();
  var list;
  if(browseMode==='nfb')list=lat.following.filter(function(u){return !fSet.has(u)&&!wlSet.has(u);});
  else if(browseMode==='ydnfb')list=lat.followers.filter(function(u){return !folSet.has(u);});
  else if(browseMode==='followers')list=lat.followers.slice();
  else if(browseMode==='following')list=lat.following.slice();
  else list=gwl().slice();
  if(q)list=list.filter(function(u){return u.toLowerCase().indexOf(q)!==-1;});
  list=applySort(list,sortState['browse']);
  if(sub)sub.textContent=fmt(list.length)+' ACCOUNTS';
  grid.innerHTML=list.length
    ?list.slice(0,120).map(function(u,i){return mkPC(u,i,wlSet.has(u));}).join('')+(list.length>120?'<div class="gempty" style="grid-column:1/-1">Showing 120 of '+fmt(list.length)+' — search to narrow down</div>':'')
    :'<div class="gempty">No accounts found</div>';
}
function renderHistory(){
  var snaps=gs(),el=document.getElementById('hist-list');if(!el)return;
  if(!snaps.length){el.innerHTML='<div class="gempty" style="display:block;text-align:center;padding:3rem">No snapshots yet</div>';return;}
  el.innerHTML=snaps.map(function(s,i){
    var badge=i===0?'<span class="hlatest">Latest</span>':'<button class="hdel" onclick="delSnap('+i+')" aria-label="Delete">✕</button>';
    return '<div class="hcard" style="animation-delay:'+(i*.05)+'s"><span class="hnum">#'+(snaps.length-i)+'</span><div class="hinfo"><p class="htime">'+fmtDateFull(s.ts)+'</p><p class="hmeta">'+fmt(s.followers.length)+' followers · '+fmt(s.following.length)+' following</p></div>'+badge+'</div>';
  }).join('');
}
function delSnap(i){if(!confirm('Delete this snapshot?'))return;var s=gs();s.splice(i,1);ss(s);updateSnapLabel();renderHistory();}
function clearAllSnaps(){if(!confirm('Delete ALL snapshots permanently?'))return;localStorage.removeItem(SK);updateSnapLabel();renderHistory();renderDash();}

/* ════════════════════════════════════════════════════════════
   CARD BUILDERS
   ════════════════════════════════════════════════════════════ */
function mkPC(u,idx,isWL){
  idx=idx||0;
  var col=avCol(u);
  var labels=gl(),label=labels[u]||'';
  var inWL=gwl().indexOf(u)!==-1;
  var delay=Math.min(idx*20,500);
  var badge=label?'<span class="plabel '+label+'">'+label+'</span>':inWL?'<span class="plabel whitelist">whitelisted</span>':'';
  var aura='background:conic-gradient(from 0deg,'+col+',rgba(129,140,248,.5),'+col+')';
  return '<div class="pcard'+(inWL?' whitelisted':'')+'" style="animation-delay:'+delay+'ms">'
    +'<div class="wl-check" onclick="toggleWL(\''+escA(u)+'\')">'+( inWL?'★':'☆')+'</div>'
    +'<div class="avwrap" onclick="openLabelModal(\''+escA(u)+'\')" style="cursor:pointer">'
      +'<div class="av-aura" style="'+aura+'"></div>'
      +'<div class="av" style="background:'+col+'18;color:'+col+'">'+inits(u)+'</div>'
    +'</div>'
    +badge
    +'<p class="pun" onclick="openLabelModal(\''+escA(u)+'\')">@'+esc(u)+'</p>'
    +'<a class="pvbtn" href="'+igUrl(u)+'" target="_blank" rel="noopener noreferrer">View on Instagram ↗</a>'
    +'</div>';
}
function mkCC(title,users,chip){
  var rows=users.length
    ?users.slice(0,6).map(function(u){
      var col=avCol(u);
      return '<a class="mrow" href="'+igUrl(u)+'" target="_blank" rel="noopener noreferrer">'
        +'<div class="mav" style="background:'+col+'18;color:'+col+'">'+inits(u)+'</div>'
        +'<span class="mname">@'+esc(u)+'</span><span class="marr">↗</span></a>';
    }).join('')+(users.length>6?'<p class="mmore">+'+( users.length-6)+' more</p>':'')
    :'<p class="mempty">No changes</p>';
  return '<div class="ccard"><div class="cch"><span class="cct">'+esc(title)+'</span><span class="chip '+chip+'">'+users.length+'</span></div><div class="mlist">'+rows+'</div></div>';
}

/* ════════════════════════════════════════════════════════════
   UTILITIES
   ════════════════════════════════════════════════════════════ */
var AC=['#7c6dfa','#f472b6','#2dd4bf','#f59e0b','#34d399','#60a5fa','#a78bfa','#fb7185','#38bdf8','#4ade80','#e879f9','#fbbf24'];
function avCol(u){var h=0;for(var i=0;i<u.length;i++)h=(h*31+u.charCodeAt(i))>>>0;return AC[h%AC.length];}
function inits(u){
  var c=u.replace(/^[^a-zA-Z0-9]+/,'').replace(/[^a-zA-Z0-9]/g,'');
  return(c.slice(0,2).toUpperCase())||u.slice(0,2).toUpperCase()||'??';
}
function cleanU(u){
  u=String(u==null?'':u).trim();
  var m=u.match(/instagram\.com\/(?:_u\/)?([^\/?#]+)/i);
  if(m)u=m[1];
  return u.replace(/^@+/,'').trim();
}
function igUrl(u){return 'https://www.instagram.com/'+encodeURIComponent(cleanU(u))+'/';}
function updateSnapLabel(){var n=gs().length;var el=document.getElementById('snap-label');if(el)el.textContent=n+(n===1?' snapshot':' snapshots');}
function set(id,v){var el=document.getElementById(id);if(el)el.textContent=v;}
function fmt(n){return Number(n).toLocaleString();}
function fmtDate(ts){return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fmtDateFull(ts){return new Date(ts).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escA(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
