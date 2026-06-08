/* ════════════════════════════════════════════════════
   FOLLOWLY — Full Application Logic
   ════════════════════════════════════════════════════ */
'use strict';

/* ── Storage ──────────────────────────────────────── */
var STORE = 'followly_final_v1';
function loadSnaps(){try{return JSON.parse(localStorage.getItem(STORE)||'[]');}catch(e){return[];}}
function saveSnaps(s){try{localStorage.setItem(STORE,JSON.stringify(s));}catch(e){alert('Storage full — delete old snapshots first.');}}

/* ── App state ────────────────────────────────────── */
var pendingFollowers = null;
var pendingFollowing = null;
var browseMode = 'nfb';

/* ═══════════════════════════════════════════════════
   BOOT — wait for DOM
   ═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function(){
  initCanvas();
  initNav();
  initBrowseFilters();
  initSearch();
  updateSnapLabel();
  setDashSubtitle();
  renderDashboard();
});

/* ── Canvas ambient orbs ──────────────────────────── */
function initCanvas(){
  var canvas = document.getElementById('orb-canvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var orbs = [
    {x:0.15,y:0.1, r:0.38,cx:0.15,cy:0.1, vx:0.00012,vy:0.00008, color:'rgba(244,114,182,0.13)'},
    {x:0.85,y:0.35,r:0.32,cx:0.85,cy:0.35,vx:-0.00009,vy:0.00011,color:'rgba(129,140,248,0.11)'},
    {x:0.45,y:0.82,r:0.28,cx:0.45,cy:0.82,vx:0.00007,vy:-0.00013,color:'rgba(45,212,191,0.09)'}
  ];
  var t=0;
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
  resize();
  window.addEventListener('resize',resize);
  function draw(){
    t++;
    canvas.width=canvas.width; // clear
    orbs.forEach(function(o){
      o.cx += Math.sin(t*o.vx*0.8)*0.0004;
      o.cy += Math.cos(t*o.vy*0.9)*0.0003;
      o.cx = Math.max(0.05,Math.min(0.95,o.cx));
      o.cy = Math.max(0.05,Math.min(0.95,o.cy));
      var gx = o.cx*canvas.width;
      var gy = o.cy*canvas.height;
      var gr = o.r*Math.max(canvas.width,canvas.height);
      var g  = ctx.createRadialGradient(gx,gy,0,gx,gy,gr);
      g.addColorStop(0,o.color);
      g.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=g;
      ctx.beginPath();
      ctx.arc(gx,gy,gr,0,Math.PI*2);
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

/* ── Nav ──────────────────────────────────────────── */
function initNav(){
  document.querySelectorAll('.nav-btn').forEach(function(btn){
    btn.addEventListener('click',function(){switchTab(btn.dataset.tab);});
  });
}

function switchTab(name){
  document.querySelectorAll('.nav-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.tab===name);
  });
  document.querySelectorAll('.tab').forEach(function(t){
    t.classList.toggle('active', t.id==='tab-'+name);
  });
  if(name==='dashboard') renderDashboard();
  if(name==='browse')    renderBrowse();
  if(name==='history')   renderHistory();
}

function goTab(name){switchTab(name);}

/* ── Browse filters ───────────────────────────────── */
function initBrowseFilters(){
  document.querySelectorAll('.filter-pill').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.filter-pill').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      browseMode = btn.dataset.mode;
      renderBrowse();
    });
  });
}

function initSearch(){
  var el = document.getElementById('browse-search');
  if(el) el.addEventListener('input', renderBrowse);
}

/* ═══════════════════════════════════════════════════
   FILE UPLOAD & PARSING
   ═══════════════════════════════════════════════════ */

/* Called by onchange on the file inputs in HTML */
function handleFile(type, input){
  var file = input.files && input.files[0];
  if(!file) return;

  var dzId = type==='followers' ? 'dz-followers' : 'dz-following';
  var stId = type==='followers' ? 'st-followers' : 'st-following';
  var dz   = document.getElementById(dzId);
  var st   = document.getElementById(stId);
  if(!dz || !st) return;

  st.textContent='Reading file…';
  st.className='drop-status';

  var reader = new FileReader();
  reader.onload = function(e){
    try{
      var users = parseInstagramExport(e.target.result, type);
      if(!users || users.length===0){
        throw new Error('No usernames found — make sure this is the correct file');
      }
      if(type==='followers') pendingFollowers=users;
      else                   pendingFollowing=users;
      st.textContent='✓  '+users.length.toLocaleString()+' accounts loaded';
      st.className='drop-status ok';
      dz.classList.add('loaded');
    }catch(err){
      if(type==='followers') pendingFollowers=null;
      else                   pendingFollowing=null;
      st.textContent='✗  '+err.message;
      st.className='drop-status err';
      dz.classList.remove('loaded');
    }
    refreshUploadUI();
  };
  reader.onerror=function(){
    st.textContent='✗  Could not read file';
    st.className='drop-status err';
    if(type==='followers') pendingFollowers=null;
    else pendingFollowing=null;
    refreshUploadUI();
  };
  reader.readAsText(file,'UTF-8');
}

/*
  parseInstagramExport — handles every known Instagram export format:

  FORMAT A (most common, 2023+):
    Array of objects: [{string_list_data:[{value:"username",timestamp:...}]}]

  FORMAT B (older, named key):
    {relationships_followers:[...]} or {relationships_following:[...]}
    where each item is same as Format A

  FORMAT C (very old / alternative):
    Flat array of strings: ["username1","username2",...]

  FORMAT D:
    Array of {value:"username"} objects

  FORMAT E (edge case — root object with any array value):
    Any object whose first array child contains items from above
*/
function parseInstagramExport(raw, type){
  var data;
  try{ data=JSON.parse(raw); }
  catch(e){ throw new Error('Invalid JSON — this does not appear to be an Instagram export file'); }

  // Unwrap root object
  var arr = null;
  if(Array.isArray(data)){
    arr=data;
  } else if(typeof data==='object' && data!==null){
    // Named keys first
    var key = type==='followers' ? 'relationships_followers' : 'relationships_following';
    if(Array.isArray(data[key])) arr=data[key];
    else {
      // Search any array value
      var keys=Object.keys(data);
      for(var i=0;i<keys.length;i++){
        if(Array.isArray(data[keys[i]])){arr=data[keys[i]];break;}
      }
    }
  }

  if(!arr) throw new Error('Unexpected file structure — check that you chose the correct file');

  var results=[];
  for(var i=0;i<arr.length;i++){
    var item=arr[i];
    if(!item) continue;

    // Format A / B — {string_list_data:[{value,timestamp},...]}
    if(item.string_list_data && Array.isArray(item.string_list_data)){
      for(var j=0;j<item.string_list_data.length;j++){
        var v=item.string_list_data[j] && item.string_list_data[j].value;
        if(v && typeof v==='string' && v.trim()) results.push(v.trim());
      }
    }
    // Format D — {value:"username"}
    else if(typeof item.value==='string' && item.value.trim()){
      results.push(item.value.trim());
    }
    // Format C — plain string
    else if(typeof item==='string' && item.trim()){
      results.push(item.trim());
    }
  }

  // Deduplicate while preserving order
  var seen={}, out=[];
  for(var k=0;k<results.length;k++){
    if(!seen[results[k]]){seen[results[k]]=true;out.push(results[k]);}
  }
  return out;
}

function refreshUploadUI(){
  var ready = !!(pendingFollowers && pendingFollowing);
  var btn = document.getElementById('btn-save');
  if(btn) btn.disabled = !ready;

  var msg = document.getElementById('upload-msg');
  if(!msg) return;

  if(ready){
    msg.style.display='block';
    msg.className='upload-msg info';
    msg.textContent='Both files loaded — press Save Snapshot to record this state.';
  } else if(pendingFollowers || pendingFollowing){
    msg.style.display='block';
    msg.className='upload-msg info';
    msg.textContent='Upload both files to continue.';
  } else {
    msg.style.display='none';
  }
}

function saveSnapshot(){
  if(!pendingFollowers || !pendingFollowing) return;
  var snaps=loadSnaps();
  snaps.unshift({ts:Date.now(),followers:pendingFollowers,following:pendingFollowing});
  if(snaps.length>50) snaps.length=50;
  saveSnaps(snaps);
  updateSnapLabel();

  var msg=document.getElementById('upload-msg');
  if(msg){msg.style.display='block';msg.className='upload-msg success';msg.textContent='✓  Snapshot saved — open Dashboard to review your stats.';}
  var btn=document.getElementById('btn-save');
  if(btn) btn.disabled=true;
}

function clearUpload(){
  pendingFollowers=null; pendingFollowing=null;
  ['followers','following'].forEach(function(t){
    var inp=document.getElementById('inp-'+t);
    if(inp) inp.value='';
    var st=document.getElementById('st-'+t);
    if(st){st.textContent='';st.className='drop-status';}
    var dz=document.getElementById('dz-'+t);
    if(dz) dz.classList.remove('loaded');
  });
  var msg=document.getElementById('upload-msg');
  if(msg) msg.style.display='none';
  var btn=document.getElementById('btn-save');
  if(btn) btn.disabled=true;
}

/* ═══════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════ */
function renderDashboard(){
  var snaps   = loadSnaps();
  var empty   = document.getElementById('dash-empty');
  var content = document.getElementById('dash-content');
  if(!empty||!content) return;

  if(!snaps.length){
    empty.style.display='flex';
    content.style.display='none';
    return;
  }

  empty.style.display='none';
  content.style.display='block';

  var latest = snaps[0];
  var prev   = snaps[1]||null;
  var fSet   = new Set(latest.followers);
  var folSet = new Set(latest.following);

  // Derived lists
  var notFollowingBack  = latest.following.filter(function(u){return !fSet.has(u);});   // you follow, they don't follow back
  var youDontFollowBack = latest.followers.filter(function(u){return !folSet.has(u);}); // they follow you, you don't follow back

  // KPIs
  set('kpi-followers',   fmt(latest.followers.length));
  set('kpi-following',   fmt(latest.following.length));
  set('kpi-nfb',         fmt(notFollowingBack.length));
  set('kpi-unfollowed',  fmt(youDontFollowBack.length));

  // Deltas
  var dF  = document.getElementById('delta-followers');
  var dFo = document.getElementById('delta-following');
  if(prev && dF && dFo){
    var df  = latest.followers.length - prev.followers.length;
    var dfo = latest.following.length - prev.following.length;
    dF.textContent  = (df>=0?'+':'')+df+' since last snapshot';
    dF.className    = 'kpi-delta '+(df>=0?'up':'down');
    dFo.textContent = (dfo>=0?'+':'')+dfo+' since last snapshot';
    dFo.className   = 'kpi-delta '+(dfo>=0?'up':'down');
  } else {
    if(dF){dF.textContent='First snapshot';dF.className='kpi-delta';}
    if(dFo){dFo.textContent='';dFo.className='kpi-delta';}
  }

  // Changes section
  var cWrap = document.getElementById('changes-wrap');
  if(prev && cWrap){
    var pF   = new Set(prev.followers);
    var pFol = new Set(prev.following);
    var newF    = latest.followers.filter(function(u){return !pF.has(u);});
    var lostF   = prev.followers.filter(function(u){return !fSet.has(u);});
    var newFol  = latest.following.filter(function(u){return !pFol.has(u);});
    var lostFol = prev.following.filter(function(u){return !folSet.has(u);});
    set('changes-since','vs '+fmtDate(prev.ts));
    cWrap.style.display='block';
    var cg=document.getElementById('change-grid');
    if(cg) cg.innerHTML=
      changeCard('New followers',         newF,    'chip-green')+
      changeCard('Unfollowed you',        lostF,   'chip-red')+
      changeCard('You started following', newFol,  'chip-indigo')+
      changeCard('You unfollowed',        lostFol, 'chip-pink');
  } else if(cWrap){
    cWrap.style.display='none';
  }

  // Profile grids
  set('badge-nfb',fmt(notFollowingBack.length)+' accounts');
  var g1=document.getElementById('grid-nfb');
  if(g1) g1.innerHTML = notFollowingBack.length
    ? notFollowingBack.map(profileCard).join('')
    : '<div class="grid-empty">Everyone you follow follows you back</div>';

  set('badge-unfollowed',fmt(youDontFollowBack.length)+' accounts');
  var g2=document.getElementById('grid-unfollowed');
  if(g2) g2.innerHTML = youDontFollowBack.length
    ? youDontFollowBack.map(profileCard).join('')
    : '<div class="grid-empty">You follow everyone back</div>';
}

/* ── Change card ──────────────────────────────────── */
function changeCard(title, users, chipCls){
  var rows = users.length
    ? users.slice(0,6).map(miniRow).join('')+(users.length>6?'<p class="mini-more">+'+( users.length-6)+' more</p>':'')
    : '<p class="mini-empty">No changes</p>';
  return '<div class="change-card">'+
    '<div class="change-card-head">'+
      '<span class="change-card-title">'+esc(title)+'</span>'+
      '<span class="chip '+chipCls+'">'+users.length+'</span>'+
    '</div>'+
    '<div class="mini-list">'+rows+'</div>'+
  '</div>';
}

/* ── Mini profile row (inside change cards) ───────── */
function miniRow(username){
  var init = initials(username);
  var url  = igUrl(username);
  return '<a class="mini-row" href="'+url+'" target="_blank" rel="noopener noreferrer">'+
    '<div class="mini-av">'+init+'</div>'+
    '<span class="mini-name">@'+esc(username)+'</span>'+
    '<span class="mini-arrow">↗</span>'+
  '</a>';
}

/* ── Profile card (grid) ──────────────────────────── */
function profileCard(username, idx){
  if(typeof idx==='undefined') idx=0;
  var init  = initials(username);
  var url   = igUrl(username);
  var delay = Math.min((typeof idx==='number'?idx:0)*25, 600);
  return '<div class="profile-card" style="animation-delay:'+delay+'ms" '+
    'onclick="openProfile(\''+escAttr(username)+'\')" role="button" tabindex="0" '+
    'onkeydown="if(event.key===\'Enter\'||event.key===\' \')openProfile(\''+escAttr(username)+'\')" '+
    'aria-label="Open '+escAttr(username)+' on Instagram">'+
    '<div class="pc-avatar-wrap">'+
      '<div class="pc-aura"></div>'+
      '<div class="pc-avatar">'+init+'</div>'+
    '</div>'+
    '<p class="pc-username">@'+esc(username)+'</p>'+
    '<a class="pc-view-btn" href="'+url+'" target="_blank" rel="noopener noreferrer" '+
      'onclick="event.stopPropagation()" aria-label="Open @'+escAttr(username)+' on Instagram">'+
      'View on Instagram ↗'+
    '</a>'+
  '</div>';
}

function openProfile(username){
  window.open(igUrl(username),'_blank','noopener,noreferrer');
}

/* ═══════════════════════════════════════════════════
   BROWSE
   ═══════════════════════════════════════════════════ */
function renderBrowse(){
  var snaps = loadSnaps();
  var grid  = document.getElementById('browse-grid');
  var sub   = document.getElementById('browse-subtitle');
  if(!grid) return;

  if(!snaps.length){
    grid.innerHTML='<div class="grid-empty">No snapshots yet — upload your data first</div>';
    if(sub) sub.textContent='';
    return;
  }

  var latest = snaps[0];
  var fSet   = new Set(latest.followers);
  var folSet = new Set(latest.following);
  var q      = (document.getElementById('browse-search')||{}).value||'';
  q=q.toLowerCase().trim();

  var list;
  if     (browseMode==='nfb')      list=latest.following.filter(function(u){return !fSet.has(u);});
  else if(browseMode==='ydnfb')    list=latest.followers.filter(function(u){return !folSet.has(u);});
  else if(browseMode==='followers')list=latest.followers.slice();
  else                             list=latest.following.slice();

  if(q) list=list.filter(function(u){return u.toLowerCase().indexOf(q)!==-1;});

  if(sub) sub.textContent=fmt(list.length)+' ACCOUNTS';

  if(!list.length){grid.innerHTML='<div class="grid-empty">No accounts found</div>';return;}

  var shown=list.slice(0,120);
  grid.innerHTML=shown.map(profileCard).join('')+
    (list.length>120?'<div class="grid-empty" style="grid-column:1/-1">Showing 120 of '+fmt(list.length)+' — use search to narrow down</div>':'');
}

/* ═══════════════════════════════════════════════════
   HISTORY
   ═══════════════════════════════════════════════════ */
function renderHistory(){
  var snaps=loadSnaps();
  var list =document.getElementById('history-list');
  if(!list) return;
  if(!snaps.length){
    list.innerHTML='<div class="grid-empty" style="display:block;text-align:center;padding:3rem">No snapshots saved yet</div>';
    return;
  }
  list.innerHTML=snaps.map(function(s,i){
    var badge = i===0
      ? '<span class="hc-latest">Latest</span>'
      : '<button class="hc-del" onclick="deleteSnapshot('+i+')" aria-label="Delete snapshot">✕</button>';
    return '<div class="history-card">'+
      '<span class="hc-num">#'+(snaps.length-i)+'</span>'+
      '<div class="hc-info">'+
        '<p class="hc-time">'+fmtDateFull(s.ts)+'</p>'+
        '<p class="hc-meta">'+fmt(s.followers.length)+' followers · '+fmt(s.following.length)+' following</p>'+
      '</div>'+
      badge+
    '</div>';
  }).join('');
}

function deleteSnapshot(i){
  if(!confirm('Delete this snapshot? This cannot be undone.')) return;
  var snaps=loadSnaps();
  snaps.splice(i,1);
  saveSnaps(snaps);
  updateSnapLabel();
  renderHistory();
}

function clearAllSnapshots(){
  if(!confirm('Delete ALL snapshots permanently? This cannot be undone.')) return;
  localStorage.removeItem(STORE);
  updateSnapLabel();
  renderHistory();
  renderDashboard();
}

/* ═══════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════ */
function updateSnapLabel(){
  var n=loadSnaps().length;
  var el=document.getElementById('snap-count-label');
  if(el) el.textContent=n+(n===1?' snapshot saved':' snapshots saved');
}

function setDashSubtitle(){
  var el=document.getElementById('dash-subtitle');
  if(el) el.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase();
}

function set(id,val){var el=document.getElementById(id);if(el)el.textContent=val;}
function fmt(n){return Number(n).toLocaleString();}
function fmtDate(ts){return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fmtDateFull(ts){return new Date(ts).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});}

function igUrl(u){return 'https://www.instagram.com/'+encodeURIComponent(u)+'/';}

function initials(username){
  var clean=username.replace(/[^a-zA-Z0-9]/g,'');
  return clean.slice(0,2).toUpperCase()||'??';
}

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s){
  return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
