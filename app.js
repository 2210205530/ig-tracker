'use strict';
/* ═══════════════════════════════════════════════
   FOLLOWLY v6 — Full Application
   Features: Upload fix, Sort, Labels, Dashboard
   search, Whitelist, Change alerts on load
   ═══════════════════════════════════════════════ */

/* ── Storage keys ──────────────────────────────── */
var SNAPS_KEY    = 'followly_snaps_v1';
var LABELS_KEY   = 'followly_labels_v1';
var WL_KEY       = 'followly_whitelist_v1';
var ALERT_KEY    = 'followly_last_seen_v1';

/* ── Storage helpers ───────────────────────────── */
function loadSnaps(){try{return JSON.parse(localStorage.getItem(SNAPS_KEY)||'[]');}catch(e){return[];}}
function saveSnaps(s){localStorage.setItem(SNAPS_KEY,JSON.stringify(s));}
function loadLabels(){try{return JSON.parse(localStorage.getItem(LABELS_KEY)||'{}');}catch(e){return{};}}
function saveLabels(l){localStorage.setItem(LABELS_KEY,JSON.stringify(l));}
function loadWhitelist(){try{return JSON.parse(localStorage.getItem(WL_KEY)||'[]');}catch(e){return[];}}
function saveWhitelist(w){localStorage.setItem(WL_KEY,JSON.stringify(w));}

/* ── App state ─────────────────────────────────── */
var pendingFollowers = null;
var pendingFollowing = null;
var browseMode  = 'nfb';
var wlMode      = false;  // whitelist edit mode on dashboard
var sortState   = {nfb:'az', ydnfb:'az', browse:'az'};
var currentModalUser = '';

/* ══════════════════════════════════════════════
   BOOT
   ══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function(){
  initCanvas();
  initNav();
  initBrowseFilters();

  var bs = document.getElementById('browse-search');
  if(bs) bs.addEventListener('input', renderBrowse);

  updateSnapLabel();
  setDashSubtitle();
  renderDashboard();
  checkChangeAlert();
});

/* ── Canvas orbs ───────────────────────────────── */
function initCanvas(){
  var canvas = document.getElementById('orb-canvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');
  var orbs = [
    {cx:.15,cy:.10,vx:.00012,vy:.00008,color:'rgba(244,114,182,0.13)',r:.38},
    {cx:.85,cy:.35,vx:-.00009,vy:.00011,color:'rgba(129,140,248,0.11)',r:.32},
    {cx:.45,cy:.82,vx:.00007,vy:-.00013,color:'rgba(45,212,191,0.08)',r:.28}
  ];
  var t=0;
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
  resize();
  window.addEventListener('resize',resize);
  function draw(){
    t++;
    canvas.width=canvas.width;
    orbs.forEach(function(o){
      o.cx+=Math.sin(t*o.vx*.8)*.0004;
      o.cy+=Math.cos(t*o.vy*.9)*.0003;
      o.cx=Math.max(.05,Math.min(.95,o.cx));
      o.cy=Math.max(.05,Math.min(.95,o.cy));
      var gx=o.cx*canvas.width,gy=o.cy*canvas.height;
      var gr=o.r*Math.max(canvas.width,canvas.height);
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
  document.querySelectorAll('.nav-btn').forEach(function(btn){
    btn.addEventListener('click',function(){switchTab(btn.dataset.tab);});
  });
}
function switchTab(name){
  document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.toggle('active',b.dataset.tab===name);});
  document.querySelectorAll('.tab').forEach(function(t){t.classList.toggle('active',t.id==='tab-'+name);});
  if(name==='dashboard') renderDashboard();
  if(name==='browse')    renderBrowse();
  if(name==='history')   renderHistory();
}
function goTab(name){switchTab(name);}

/* ── Browse filters ────────────────────────────── */
function initBrowseFilters(){
  document.querySelectorAll('.filter-pill').forEach(function(btn){
    btn.addEventListener('click',function(){
      document.querySelectorAll('.filter-pill').forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      browseMode=btn.dataset.mode;
      renderBrowse();
    });
  });
}

/* ══════════════════════════════════════════════
   CHANGE ALERT ON LOAD
   ══════════════════════════════════════════════ */
function checkChangeAlert(){
  var snaps = loadSnaps();
  if(snaps.length < 2) return;
  var latest   = snaps[0];
  var prev     = snaps[1];
  var lastSeen = localStorage.getItem(ALERT_KEY);
  // Only show if we haven't shown for this latest snapshot yet
  if(lastSeen === String(latest.ts)) return;

  var fSet  = new Set(latest.followers);
  var pF    = new Set(prev.followers);
  var lostF = prev.followers.filter(function(u){return !fSet.has(u);});
  var newF  = latest.followers.filter(function(u){return !pF.has(u);});

  var parts = [];
  if(newF.length)  parts.push('+'+newF.length+' new follower'+(newF.length>1?'s':''));
  if(lostF.length) parts.push(lostF.length+' unfollow'+(lostF.length>1?'s':''));

  if(!parts.length) return;

  var banner = document.getElementById('alert-banner');
  var text   = document.getElementById('alert-text');
  if(banner && text){
    text.textContent = 'Since your last snapshot: '+parts.join(' · ')+'. Open Dashboard to review.';
    banner.style.display='block';
    // Push content down
    var layout = document.querySelector('.app-layout');
    if(layout) layout.style.paddingTop='52px';
    localStorage.setItem(ALERT_KEY, String(latest.ts));
  }
}
function dismissAlert(){
  var banner = document.getElementById('alert-banner');
  if(banner) banner.style.display='none';
  var layout = document.querySelector('.app-layout');
  if(layout) layout.style.paddingTop='';
}

/* ══════════════════════════════════════════════
   INSTAGRAM JSON PARSER
   Handles ALL known export formats
   ══════════════════════════════════════════════ */
function parseIG(raw, type){
  var data;
  try{ data=JSON.parse(raw); }
  catch(e){ throw new Error('Invalid JSON — this does not appear to be an Instagram export file'); }

  /* Unwrap root object into array */
  var arr=null;
  if(Array.isArray(data)){
    arr=data;
  } else if(data && typeof data==='object'){
    /* Try named relationship keys first */
    var key = type==='followers' ? 'relationships_followers' : 'relationships_following';
    if(Array.isArray(data[key])){
      arr=data[key];
    } else {
      /* Search first array-valued key */
      var keys=Object.keys(data);
      for(var i=0;i<keys.length;i++){
        if(Array.isArray(data[keys[i]])){arr=data[keys[i]];break;}
      }
    }
  }
  if(!arr) throw new Error('Unexpected file structure — check you chose the correct file');

  var results=[];
  for(var i=0;i<arr.length;i++){
    var item=arr[i];
    if(!item) continue;
    /* Format A/B: {title:"", string_list_data:[{href,value,timestamp}]} */
    if(item.string_list_data && Array.isArray(item.string_list_data)){
      for(var j=0;j<item.string_list_data.length;j++){
        var entry=item.string_list_data[j];
        var v=entry && (entry.value||entry.href);
        if(v && typeof v==='string'){
          /* If href, extract username from URL */
          if(v.indexOf('instagram.com/')!==-1){
            v=v.replace(/.*instagram\.com\//,'').replace(/\//g,'').trim();
          }
          if(v) results.push(v);
        }
      }
    }
    /* Format D: {value:"username"} */
    else if(item.value && typeof item.value==='string' && item.value.trim()){
      results.push(item.value.trim());
    }
    /* Format C: plain string */
    else if(typeof item==='string' && item.trim()){
      results.push(item.trim());
    }
  }

  /* Deduplicate */
  var seen={},out=[];
  for(var k=0;k<results.length;k++){
    if(!seen[results[k]]){seen[results[k]]=true;out.push(results[k]);}
  }
  return out;
}

/* ══════════════════════════════════════════════
   FILE UPLOAD
   ══════════════════════════════════════════════ */
function handleFile(type, input){
  var file=input.files&&input.files[0];
  if(!file) return;
  var dz=document.getElementById('dz-'+type);
  var st=document.getElementById('st-'+type);
  st.textContent='Reading…';st.className='drop-status';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var users=parseIG(e.target.result,type);
      if(!users||!users.length) throw new Error('No usernames found — make sure you selected the correct file');
      if(type==='followers') pendingFollowers=users;
      else pendingFollowing=users;
      st.textContent='✓  '+users.length.toLocaleString()+' accounts loaded';
      st.className='drop-status ok';
      dz.classList.add('loaded');
    }catch(err){
      if(type==='followers') pendingFollowers=null;
      else pendingFollowing=null;
      st.textContent='✗  '+err.message;
      st.className='drop-status err';
      dz.classList.remove('loaded');
    }
    refreshUploadUI();
  };
  reader.onerror=function(){
    st.textContent='✗  Could not read file';
    st.className='drop-status err';
    refreshUploadUI();
  };
  reader.readAsText(file,'UTF-8');
}

function refreshUploadUI(){
  var ready=!!(pendingFollowers&&pendingFollowing);
  var btn=document.getElementById('btn-save');
  if(btn) btn.disabled=!ready;
  var msg=document.getElementById('upload-msg');
  if(!msg) return;
  if(ready){
    msg.style.display='block';msg.className='upload-msg info';
    msg.textContent='Both files loaded — press Save Snapshot to record this state.';
  } else if(pendingFollowers||pendingFollowing){
    msg.style.display='block';msg.className='upload-msg info';
    msg.textContent='Upload both files to continue.';
  } else { msg.style.display='none'; }
}

function saveSnapshot(){
  if(!pendingFollowers||!pendingFollowing) return;
  var snaps=loadSnaps();
  snaps.unshift({ts:Date.now(),followers:pendingFollowers,following:pendingFollowing});
  if(snaps.length>50) snaps.length=50;
  saveSnaps(snaps);
  updateSnapLabel();
  var msg=document.getElementById('upload-msg');
  if(msg){msg.style.display='block';msg.className='upload-msg success';msg.textContent='✓  Snapshot saved — open Dashboard to see your stats.';}
  var btn=document.getElementById('btn-save');
  if(btn) btn.disabled=true;
}

function clearUpload(){
  pendingFollowers=null;pendingFollowing=null;
  ['followers','following'].forEach(function(t){
    var inp=document.getElementById('inp-'+t);if(inp)inp.value='';
    var st=document.getElementById('st-'+t);if(st){st.textContent='';st.className='drop-status';}
    var dz=document.getElementById('dz-'+t);if(dz)dz.classList.remove('loaded');
  });
  var msg=document.getElementById('upload-msg');if(msg)msg.style.display='none';
  var btn=document.getElementById('btn-save');if(btn)btn.disabled=true;
}

/* ══════════════════════════════════════════════
   SORT
   ══════════════════════════════════════════════ */
function setSort(grid, dir, btn){
  sortState[grid]=dir;
  /* Update pill active state */
  document.querySelectorAll('.sort-pill[data-grid="'+grid+'"]').forEach(function(b){
    b.classList.toggle('active', b.dataset.sort===dir);
  });
  if(grid==='nfb')    renderGrid('nfb');
  if(grid==='ydnfb')  renderGrid('ydnfb');
  if(grid==='browse') renderBrowse();
}

function applySort(list, dir){
  var copy=list.slice();
  if(dir==='az') copy.sort(function(a,b){return a.toLowerCase()<b.toLowerCase()?-1:1;});
  if(dir==='za') copy.sort(function(a,b){return a.toLowerCase()>b.toLowerCase()?-1:1;});
  return copy;
}

/* ══════════════════════════════════════════════
   DASHBOARD
   ══════════════════════════════════════════════ */
function renderDashboard(){
  var snaps=loadSnaps();
  var empty=document.getElementById('dash-empty');
  var content=document.getElementById('dash-content');
  if(!empty||!content) return;
  if(!snaps.length){empty.style.display='flex';content.style.display='none';return;}
  empty.style.display='none';content.style.display='block';

  var latest=snaps[0],prev=snaps[1]||null;
  var fSet=new Set(latest.followers),folSet=new Set(latest.following);
  var nfb  =latest.following.filter(function(u){return !fSet.has(u);});
  var ydnfb=latest.followers.filter(function(u){return !folSet.has(u);});

  set('kpi-followers',  fmt(latest.followers.length));
  set('kpi-following',  fmt(latest.following.length));
  set('kpi-nfb',        fmt(nfb.length));
  set('kpi-ydnfb',      fmt(ydnfb.length));

  /* Deltas */
  var dF=document.getElementById('delta-followers'),dFo=document.getElementById('delta-following');
  if(prev&&dF&&dFo){
    var df=latest.followers.length-prev.followers.length;
    var dfo=latest.following.length-prev.following.length;
    dF.textContent=(df>=0?'+':'')+df+' since last';dF.className='kpi-delta '+(df>=0?'up':'down');
    dFo.textContent=(dfo>=0?'+':'')+dfo+' since last';dFo.className='kpi-delta '+(dfo>=0?'up':'down');
  } else {
    if(dF){dF.textContent='First snapshot';dF.className='kpi-delta';}
    if(dFo){dFo.textContent='';dFo.className='kpi-delta';}
  }

  /* Changes */
  var cw=document.getElementById('changes-wrap');
  if(prev&&cw){
    var pF=new Set(prev.followers),pFol=new Set(prev.following);
    var newF=latest.followers.filter(function(u){return !pF.has(u);});
    var lostF=prev.followers.filter(function(u){return !fSet.has(u);});
    var newFol=latest.following.filter(function(u){return !pFol.has(u);});
    var lostFol=prev.following.filter(function(u){return !folSet.has(u);});
    set('changes-since','vs '+fmtDate(prev.ts));
    cw.style.display='block';
    var cg=document.getElementById('change-grid');
    if(cg) cg.innerHTML=
      changeCard('New followers',newF,'chip-green')+
      changeCard('Unfollowed you',lostF,'chip-red')+
      changeCard('You started following',newFol,'chip-indigo')+
      changeCard('You unfollowed',lostFol,'chip-pink');
  } else if(cw){cw.style.display='none';}

  renderGrid('nfb');
  renderGrid('ydnfb');
}

function renderGrid(gridId){
  var snaps=loadSnaps();
  if(!snaps.length) return;
  var latest=snaps[0];
  var fSet=new Set(latest.followers),folSet=new Set(latest.following);
  var wl=loadWhitelist();
  var wlSet=new Set(wl);

  var list, badgeId, gridEl, searchId;
  if(gridId==='nfb'){
    list=latest.following.filter(function(u){return !fSet.has(u);});
    /* Filter out whitelisted unless in wl mode */
    if(!wlMode) list=list.filter(function(u){return !wlSet.has(u);});
    badgeId='badge-nfb';gridEl='grid-nfb';searchId='search-nfb';
  } else {
    list=latest.followers.filter(function(u){return !folSet.has(u);});
    badgeId='badge-ydnfb';gridEl='grid-ydnfb';searchId='search-ydnfb';
  }

  /* Search filter */
  var sq=document.getElementById(searchId);
  var q=sq?sq.value.toLowerCase().trim():'';
  if(q) list=list.filter(function(u){return u.toLowerCase().indexOf(q)!==-1;});

  /* Sort */
  list=applySort(list, sortState[gridId]);

  set(badgeId, fmt(list.length)+' accounts');

  var el=document.getElementById(gridEl);
  if(!el) return;

  if(!list.length){
    el.innerHTML='<div class="grid-empty">None found</div>';return;
  }

  el.className='profile-grid'+(wlMode&&gridId==='nfb'?' wl-mode':'');
  el.innerHTML=list.map(function(u,i){return profileCard(u,i,wlSet.has(u));}).join('');
}

/* ══════════════════════════════════════════════
   WHITELIST MODE
   ══════════════════════════════════════════════ */
function toggleWhitelistMode(){
  wlMode=!wlMode;
  var btn=document.getElementById('wl-toggle');
  if(btn) btn.classList.toggle('active',wlMode);
  renderGrid('nfb');
}

function toggleWhitelist(username){
  var wl=loadWhitelist();
  var idx=wl.indexOf(username);
  if(idx===-1) wl.push(username);
  else wl.splice(idx,1);
  saveWhitelist(wl);
  renderGrid('nfb');
  /* Update modal button text */
  var btnText=document.getElementById('wl-modal-btn-text');
  if(btnText) btnText.textContent=idx===-1?'Remove from whitelist':'Add to whitelist';
}

/* ══════════════════════════════════════════════
   LABEL MODAL
   ══════════════════════════════════════════════ */
function openLabelModal(username){
  currentModalUser=username;
  var labels=loadLabels();
  var wl=loadWhitelist();
  var modal=document.getElementById('label-modal');
  var av=document.getElementById('modal-avatar');
  var un=document.getElementById('modal-username');
  var igLink=document.getElementById('modal-ig-link');
  var wlBtn=document.getElementById('wl-modal-btn-text');
  if(!modal) return;

  /* Set avatar */
  var col=avatarColor(username);
  av.style.background=col.bg;
  av.textContent=initials(username);

  un.textContent='@'+username;
  igLink.href='https://www.instagram.com/'+encodeURIComponent(username)+'/';
  wlBtn.textContent=wl.indexOf(username)!==-1?'Remove from whitelist':'Add to whitelist';

  /* Highlight current label */
  var cur=labels[username]||'';
  document.querySelectorAll('.label-opt').forEach(function(b){
    b.classList.toggle('active',b.dataset.label===cur);
  });

  modal.style.display='flex';
}

function closeLabelModal(e){
  if(e&&e.target!==document.getElementById('label-modal')) return;
  document.getElementById('label-modal').style.display='none';
  /* Re-render grids to reflect any changes */
  renderGrid('nfb');renderGrid('ydnfb');renderBrowse();
}

function applyLabel(label){
  var labels=loadLabels();
  if(label==='') delete labels[currentModalUser];
  else labels[currentModalUser]=label;
  saveLabels(labels);
  /* Update active state */
  document.querySelectorAll('.label-opt').forEach(function(b){
    b.classList.toggle('active',b.dataset.label===label);
  });
}

/* ══════════════════════════════════════════════
   BROWSE
   ══════════════════════════════════════════════ */
function renderBrowse(){
  var snaps=loadSnaps();
  var grid=document.getElementById('browse-grid');
  var sub=document.getElementById('browse-subtitle');
  if(!grid) return;
  if(!snaps.length){grid.innerHTML='<div class="grid-empty">No snapshots yet — upload your data first</div>';if(sub)sub.textContent='';return;}

  var latest=snaps[0];
  var fSet=new Set(latest.followers),folSet=new Set(latest.following);
  var wl=loadWhitelist();var wlSet=new Set(wl);
  var q=((document.getElementById('browse-search')||{}).value||'').toLowerCase().trim();

  var list;
  if(browseMode==='nfb')          list=latest.following.filter(function(u){return !fSet.has(u)&&!wlSet.has(u);});
  else if(browseMode==='ydnfb')   list=latest.followers.filter(function(u){return !folSet.has(u);});
  else if(browseMode==='followers')list=latest.followers.slice();
  else if(browseMode==='following')list=latest.following.slice();
  else if(browseMode==='whitelist')list=wl.slice();
  else list=[];

  if(q) list=list.filter(function(u){return u.toLowerCase().indexOf(q)!==-1;});
  list=applySort(list,sortState['browse']);

  if(sub) sub.textContent=fmt(list.length)+' ACCOUNTS';
  if(!list.length){grid.innerHTML='<div class="grid-empty">No accounts found</div>';return;}

  grid.innerHTML=list.slice(0,120).map(function(u,i){return profileCard(u,i,wlSet.has(u));}).join('')+
    (list.length>120?'<div class="grid-empty" style="grid-column:1/-1">Showing 120 of '+fmt(list.length)+' — use search to narrow down</div>':'');
}

/* ══════════════════════════════════════════════
   HISTORY
   ══════════════════════════════════════════════ */
function renderHistory(){
  var snaps=loadSnaps();
  var list=document.getElementById('history-list');
  if(!list) return;
  if(!snaps.length){list.innerHTML='<div class="grid-empty" style="display:block;text-align:center;padding:3rem">No snapshots saved yet</div>';return;}
  list.innerHTML=snaps.map(function(s,i){
    var badge=i===0?'<span class="hc-latest">Latest</span>':'<button class="hc-del" onclick="deleteSnapshot('+i+')" aria-label="Delete">✕</button>';
    return '<div class="history-card"><span class="hc-num">#'+(snaps.length-i)+'</span>'+
      '<div class="hc-info"><p class="hc-time">'+fmtDateFull(s.ts)+'</p>'+
      '<p class="hc-meta">'+fmt(s.followers.length)+' followers · '+fmt(s.following.length)+' following</p></div>'+badge+'</div>';
  }).join('');
}
function deleteSnapshot(i){
  if(!confirm('Delete this snapshot?')) return;
  var s=loadSnaps();s.splice(i,1);saveSnaps(s);updateSnapLabel();renderHistory();
}
function clearAllSnapshots(){
  if(!confirm('Delete ALL snapshots permanently?')) return;
  localStorage.removeItem(SNAPS_KEY);updateSnapLabel();renderHistory();renderDashboard();
}

/* ══════════════════════════════════════════════
   PROFILE CARD
   ══════════════════════════════════════════════ */
function profileCard(username, idx, isWhitelisted){
  idx=idx||0;
  var col=avatarColor(username);
  var init=initials(username);
  var labels=loadLabels();
  var label=labels[username]||'';
  var wl=loadWhitelist();
  var inWl=wl.indexOf(username)!==-1;
  var delay=Math.min(idx*22,500);

  var labelBadge=label?'<span class="pc-label '+label+'">'+label+'</span>':'';
  if(inWl&&!label) labelBadge='<span class="pc-label whitelist">whitelisted</span>';

  /* Aura gradient uses avatar color */
  var auraStyle='background:conic-gradient(from 0deg,'+col.bg+',rgba(129,140,248,0.6),'+col.bg+')';

  return '<div class="profile-card'+(inWl?' whitelisted':'')+'" style="animation-delay:'+delay+'ms" '+
    'onclick="openLabelModal(\''+escAttr(username)+'\')" role="button" tabindex="0" '+
    'onkeydown="if(event.key===\'Enter\')openLabelModal(\''+escAttr(username)+'\')" '+
    'aria-label="Options for @'+escAttr(username)+'">' +
    '<div class="wl-check" onclick="event.stopPropagation();toggleWhitelist(\''+escAttr(username)+'\')">'+(inWl?'★':'☆')+'</div>'+
    '<div class="pc-avatar-wrap">'+
      '<div class="pc-aura" style="'+auraStyle+'"></div>'+
      '<div class="pc-avatar" style="background:'+col.bg+';font-size:17px">'+init+'</div>'+
    '</div>'+
    labelBadge+
    '<p class="pc-username">@'+esc(username)+'</p>'+
    '<a class="pc-view-btn" href="https://www.instagram.com/'+encodeURIComponent(username)+'/" '+
      'target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" '+
      'aria-label="Open @'+escAttr(username)+' on Instagram">View on Instagram ↗</a>'+
  '</div>';
}

/* ══════════════════════════════════════════════
   CHANGE CARD (dashboard)
   ══════════════════════════════════════════════ */
function changeCard(title,users,chipCls){
  var rows=users.length
    ?users.slice(0,6).map(function(u){
      var col=avatarColor(u);
      var url='https://www.instagram.com/'+encodeURIComponent(u)+'/';
      return '<a class="mini-row" href="'+url+'" target="_blank" rel="noopener noreferrer">'+
        '<div class="mini-av" style="background:'+col.bg+';color:#fff">'+initials(u)+'</div>'+
        '<span class="mini-name">@'+esc(u)+'</span><span class="mini-arrow">↗</span></a>';
    }).join('')+(users.length>6?'<p class="mini-more">+'+( users.length-6)+' more</p>':'')
    :'<p class="mini-empty">No changes</p>';
  return '<div class="change-card">'+
    '<div class="change-card-head"><span class="change-card-title">'+esc(title)+'</span>'+
    '<span class="chip '+chipCls+'">'+users.length+'</span></div>'+
    '<div class="mini-list">'+rows+'</div></div>';
}

/* ══════════════════════════════════════════════
   AVATAR COLOR — unique per username
   ══════════════════════════════════════════════ */
var AVATAR_COLORS=[
  {bg:'#7c6dfa'},{bg:'#f472b6'},{bg:'#2dd4bf'},
  {bg:'#f59e0b'},{bg:'#34d399'},{bg:'#60a5fa'},
  {bg:'#a78bfa'},{bg:'#fb7185'},{bg:'#38bdf8'},
  {bg:'#4ade80'},{bg:'#e879f9'},{bg:'#fbbf24'}
];
function avatarColor(username){
  var hash=0;
  for(var i=0;i<username.length;i++) hash=(hash*31+username.charCodeAt(i))>>>0;
  return AVATAR_COLORS[hash%AVATAR_COLORS.length];
}

/* ══════════════════════════════════════════════
   UTILITIES
   ══════════════════════════════════════════════ */
function updateSnapLabel(){
  var n=loadSnaps().length;
  var el=document.getElementById('snap-count-label');
  if(el) el.textContent=n+(n===1?' snapshot':' snapshots');
}
function setDashSubtitle(){
  var el=document.getElementById('dash-subtitle');
  if(el) el.textContent=new Date().toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'}).toUpperCase();
}
function set(id,val){var el=document.getElementById(id);if(el)el.textContent=val;}
function fmt(n){return Number(n).toLocaleString();}
function fmtDate(ts){return new Date(ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});}
function fmtDateFull(ts){return new Date(ts).toLocaleString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function initials(u){var c=u.replace(/[^a-zA-Z0-9]/g,'');return c.slice(0,2).toUpperCase()||'??';}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function escAttr(s){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
