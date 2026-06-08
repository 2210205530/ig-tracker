'use strict';

/* ═══════════════════════════════════════════════════
   FOLLOWLY — Complete Application Logic
   Supports: 5000+ followers, 150+ files, all Instagram
   export formats
   ═══════════════════════════════════════════════════ */

/* ── Storage ────────────────────────────────────────
   We store only usernames (strings), not full objects.
   This keeps localStorage small even with 10k+ users.
   Snapshots are capped at 30 to stay under 5MB limit. */
var STORE = 'followly_v6';

function loadSnaps() {
  try { return JSON.parse(localStorage.getItem(STORE) || '[]'); }
  catch(e) { return []; }
}

function saveSnaps(snaps) {
  try {
    localStorage.setItem(STORE, JSON.stringify(snaps));
  } catch(e) {
    // Storage full — remove oldest snapshots until it fits
    while(snaps.length > 1) {
      snaps.pop();
      try { localStorage.setItem(STORE, JSON.stringify(snaps)); break; }
      catch(e2) { continue; }
    }
    alert('Storage was almost full — oldest snapshots were removed to make space.');
  }
}

/* ── App state ──────────────────────────────────────
   pendingFollowers / pendingFollowing are plain string
   arrays. No size limit — browser memory handles this
   easily up to hundreds of thousands of usernames. */
var pendingFollowers = null;   // string[]
var pendingFollowing = null;   // string[]
var browseMode = 'nfb';

/* ═══════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {
  initCanvas();
  initNav();
  initBrowseFilters();

  var bs = document.getElementById('browse-search');
  if(bs) bs.addEventListener('input', renderBrowse);

  updateSnapLabel();
  setDashSubtitle();
  renderDashboard();
});

/* ═══════════════════════════════════════════════════
   AMBIENT CANVAS ORBS
   ═══════════════════════════════════════════════════ */
function initCanvas() {
  var canvas = document.getElementById('orb-canvas');
  if(!canvas) return;
  var ctx = canvas.getContext('2d');

  var orbs = [
    { cx:0.15, cy:0.12, r:0.38, ax:0.00014, ay:0.00009, color:'rgba(244,114,182,0.13)' },
    { cx:0.85, cy:0.38, r:0.32, ax:-0.0001, ay:0.00012, color:'rgba(129,140,248,0.11)' },
    { cx:0.48, cy:0.82, r:0.27, ax:0.00008, ay:-0.00014,color:'rgba(45,212,191,0.09)'  }
  ];
  var t = 0;

  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);

  function draw() {
    t++;
    canvas.width = canvas.width; // clear
    for(var i=0; i<orbs.length; i++) {
      var o = orbs[i];
      o.cx += Math.sin(t * o.ax * 0.9) * 0.00042;
      o.cy += Math.cos(t * o.ay * 1.1) * 0.00035;
      o.cx = Math.max(0.05, Math.min(0.95, o.cx));
      o.cy = Math.max(0.05, Math.min(0.95, o.cy));
      var gx = o.cx * canvas.width;
      var gy = o.cy * canvas.height;
      var gr = o.r  * Math.max(canvas.width, canvas.height);
      var g  = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
      g.addColorStop(0, o.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

/* ═══════════════════════════════════════════════════
   NAV + TABS
   ═══════════════════════════════════════════════════ */
function initNav() {
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() { switchTab(btn.dataset.tab); });
  });
}

function switchTab(name) {
  document.querySelectorAll('.nav-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  document.querySelectorAll('.tab').forEach(function(t) {
    t.classList.toggle('active', t.id === 'tab-' + name);
  });
  if(name === 'dashboard') renderDashboard();
  if(name === 'browse')    renderBrowse();
  if(name === 'history')   renderHistory();
}

function goTab(name) { switchTab(name); }

function initBrowseFilters() {
  document.querySelectorAll('.filter-pill').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.filter-pill').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      browseMode = btn.dataset.mode;
      renderBrowse();
    });
  });
}

/* ═══════════════════════════════════════════════════
   INSTAGRAM JSON PARSER
   Handles every known export format:

   FORMAT A  (followers file — new 2024 export)
     Array of: { title:"", string_list_data:[{ value:"username", href:"...", timestamp:N }] }

   FORMAT B  (following file — new 2024 export)
     { relationships_following: Array of: { title:"username", string_list_data:[{ href:"..._u/username", timestamp:N }] } }
     NOTE: string_list_data has NO .value — username is in .title or extracted from .href

   FORMAT C  (old export, both files)
     { relationships_followers: [...] } or { relationships_following: [...] }
     where items have string_list_data[].value

   FORMAT D  (flat array of strings)
     ["username1", "username2", ...]

   FORMAT E  (flat array of {value:"username"} objects)
     [{ value:"username" }, ...]
   ═══════════════════════════════════════════════════ */
function parseInstagramExport(raw) {
  var data;
  try { data = JSON.parse(raw); }
  catch(e) { throw new Error('Invalid JSON file'); }

  // ── Unwrap to array ──────────────────────────────
  var arr = null;

  if(Array.isArray(data)) {
    arr = data;
  } else if(data && typeof data === 'object') {
    // Check all known named keys
    var knownKeys = [
      'relationships_following',
      'relationships_followers',
      'relationships_follow_requests_sent',
      'relationships_blocked_users'
    ];
    for(var k=0; k<knownKeys.length; k++) {
      if(Array.isArray(data[knownKeys[k]])) {
        arr = data[knownKeys[k]];
        break;
      }
    }
    // Fallback: first array-valued key in the object
    if(!arr) {
      var keys = Object.keys(data);
      for(var i=0; i<keys.length; i++) {
        if(Array.isArray(data[keys[i]])) {
          arr = data[keys[i]];
          break;
        }
      }
    }
  }

  if(!arr) throw new Error('Unrecognised file structure');

  // ── Extract usernames ────────────────────────────
  var results = [];

  for(var i=0; i<arr.length; i++) {
    var item = arr[i];
    if(!item) continue;

    var username = null;

    // Case: item has string_list_data array
    if(item.string_list_data && Array.isArray(item.string_list_data) && item.string_list_data.length > 0) {
      var sld = item.string_list_data[0];

      if(sld) {
        // FORMAT A: .value exists and is the username
        if(sld.value && typeof sld.value === 'string' && sld.value.trim()) {
          username = sld.value.trim();
        }
        // FORMAT B: no .value — extract from .href
        else if(sld.href && typeof sld.href === 'string') {
          username = extractFromHref(sld.href);
        }
      }

      // FORMAT B fallback: use .title on the parent item
      if(!username && item.title && typeof item.title === 'string' && item.title.trim()) {
        username = item.title.trim();
      }
    }
    // Case: item only has .title (no string_list_data or it's empty)
    else if(item.title && typeof item.title === 'string' && item.title.trim()) {
      username = item.title.trim();
    }
    // Case: item is {value:"username"}
    else if(item.value && typeof item.value === 'string' && item.value.trim()) {
      username = item.value.trim();
    }
    // Case: item is a plain string
    else if(typeof item === 'string' && item.trim()) {
      username = item.trim();
    }

    if(username) results.push(username);
  }

  return results;
}

function extractFromHref(href) {
  if(!href || typeof href !== 'string') return null;
  // Remove trailing slash
  var s = href.replace(/\/$/, '');
  // https://www.instagram.com/_u/username
  var m1 = s.match(/instagram\.com\/_u\/([^/?#]+)$/);
  if(m1 && m1[1]) return decodeURIComponent(m1[1]).trim();
  // https://www.instagram.com/username
  var m2 = s.match(/instagram\.com\/([^/?#]+)$/);
  if(m2 && m2[1] && m2[1] !== 'p' && m2[1] !== 'reel') return decodeURIComponent(m2[1]).trim();
  return null;
}

function dedup(arr) {
  var seen = Object.create(null), out = [];
  for(var i=0; i<arr.length; i++) {
    if(arr[i] && !seen[arr[i]]) { seen[arr[i]] = true; out.push(arr[i]); }
  }
  return out;
}

/* ═══════════════════════════════════════════════════
   FILE UPLOAD HANDLERS
   Separate functions for followers (multi) and
   following (single) called from HTML onchange.
   ═══════════════════════════════════════════════════ */

/* ── Followers: reads MULTIPLE files in parallel ─── */
function handleFilesFollowers(input) {
  var files = input.files;
  if(!files || files.length === 0) return;

  var dz = document.getElementById('dz-followers');
  var st = document.getElementById('st-followers');
  var pw = document.getElementById('progress-wrap');
  var pf = document.getElementById('progress-fill');
  var pl = document.getElementById('progress-label');

  // Reset
  pendingFollowers = null;
  dz.classList.remove('loaded');
  st.textContent = '';
  st.className = 'drop-status';

  // Show progress if > 1 file
  if(files.length > 1 && pw) {
    pw.style.display = 'block';
    pf.style.width = '0%';
    pl.textContent = 'Reading 0 / ' + files.length + ' files…';
  }

  var allUsernames = [];
  var errors       = [];
  var completed    = 0;
  var total        = files.length;

  function onFileDone(usernames, err) {
    if(err)        errors.push(err);
    else           allUsernames = allUsernames.concat(usernames);

    completed++;

    // Update progress bar
    if(files.length > 1 && pw) {
      var pct = Math.round((completed / total) * 100);
      pf.style.width = pct + '%';
      pl.textContent = 'Reading ' + completed + ' / ' + total + ' files…';
    }

    if(completed < total) return; // still waiting for others

    // All files done — finalise
    if(pw) pw.style.display = 'none';

    if(allUsernames.length === 0) {
      st.textContent = '✗  No usernames found in any file — check file selection';
      st.className = 'drop-status err';
      pendingFollowers = null;
    } else {
      var merged = dedup(allUsernames);
      pendingFollowers = merged;
      var label = merged.length.toLocaleString() + ' followers loaded';
      if(total > 1) label += ' from ' + total + ' files';
      st.textContent = '✓  ' + label;
      st.className = 'drop-status ok';
      dz.classList.add('loaded');
    }

    refreshUploadUI();
  }

  // Launch all readers simultaneously (browser handles concurrency)
  for(var i=0; i<files.length; i++) {
    readOneFile(files[i], onFileDone);
  }
}

/* ── Following: single file ─────────────────────── */
function handleFilesFollowing(input) {
  var files = input.files;
  if(!files || files.length === 0) return;

  var dz = document.getElementById('dz-following');
  var st = document.getElementById('st-following');

  pendingFollowing = null;
  dz.classList.remove('loaded');
  st.textContent = 'Reading…';
  st.className = 'drop-status';

  readOneFile(files[0], function(usernames, err) {
    if(err || usernames.length === 0) {
      st.textContent = '✗  ' + (err || 'No usernames found');
      st.className = 'drop-status err';
      pendingFollowing = null;
    } else {
      var merged = dedup(usernames);
      pendingFollowing = merged;
      st.textContent = '✓  ' + merged.length.toLocaleString() + ' accounts loaded';
      st.className = 'drop-status ok';
      dz.classList.add('loaded');
    }
    refreshUploadUI();
  });
}

/* ── Read one file and call back with usernames ─── */
function readOneFile(file, cb) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var users = parseInstagramExport(e.target.result);
      cb(users, null);
    } catch(err) {
      cb([], err.message + ' (' + file.name + ')');
    }
  };
  reader.onerror = function() {
    cb([], 'Could not read ' + file.name);
  };
  reader.readAsText(file, 'UTF-8');
}

/* ── UI state after any file change ─────────────── */
function refreshUploadUI() {
  var ready = !!(pendingFollowers && pendingFollowers.length > 0 &&
                 pendingFollowing && pendingFollowing.length > 0);
  var btn = document.getElementById('btn-save');
  if(btn) btn.disabled = !ready;

  var msg = document.getElementById('upload-msg');
  if(!msg) return;

  if(ready) {
    msg.style.display = 'block';
    msg.className = 'upload-msg info';
    msg.textContent = 'Both files ready — press Save Snapshot to record this state.';
  } else if(pendingFollowers || pendingFollowing) {
    msg.style.display = 'block';
    msg.className = 'upload-msg info';
    msg.textContent = 'Upload both files to continue.';
  } else {
    msg.style.display = 'none';
  }
}

/* ── Save snapshot ──────────────────────────────── */
function saveSnapshot() {
  if(!pendingFollowers || !pendingFollowing) return;

  var snaps = loadSnaps();
  snaps.unshift({
    ts:        Date.now(),
    followers: pendingFollowers,
    following: pendingFollowing
  });
  if(snaps.length > 30) snaps.length = 30;
  saveSnaps(snaps);
  updateSnapLabel();

  var msg = document.getElementById('upload-msg');
  if(msg) {
    msg.style.display = 'block';
    msg.className = 'upload-msg success';
    msg.textContent = '✓  Snapshot saved — open Dashboard to see your stats.';
  }
  var btn = document.getElementById('btn-save');
  if(btn) btn.disabled = true;
}

function clearUpload() {
  pendingFollowers = null;
  pendingFollowing = null;
  ['followers','following'].forEach(function(t) {
    var inp = document.getElementById('inp-' + t);
    if(inp) inp.value = '';
    var st = document.getElementById('st-' + t);
    if(st) { st.textContent = ''; st.className = 'drop-status'; }
    var dz = document.getElementById('dz-' + t);
    if(dz) dz.classList.remove('loaded');
  });
  var pw = document.getElementById('progress-wrap');
  if(pw) pw.style.display = 'none';
  var msg = document.getElementById('upload-msg');
  if(msg) msg.style.display = 'none';
  var btn = document.getElementById('btn-save');
  if(btn) btn.disabled = true;
}

/* ═══════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════ */
function renderDashboard() {
  var snaps   = loadSnaps();
  var empty   = document.getElementById('dash-empty');
  var content = document.getElementById('dash-content');
  if(!empty || !content) return;

  if(!snaps.length) {
    empty.style.display   = 'flex';
    content.style.display = 'none';
    return;
  }

  empty.style.display   = 'none';
  content.style.display = 'block';

  var latest = snaps[0];
  var prev   = snaps[1] || null;

  var fSet   = new Set(latest.followers);
  var folSet = new Set(latest.following);

  // Core lists
  var notFollowingBack  = latest.following.filter(function(u) { return !fSet.has(u); });
  var youDontFollowBack = latest.followers.filter(function(u) { return !folSet.has(u); });

  // KPIs
  set('kpi-followers',  fmt(latest.followers.length));
  set('kpi-following',  fmt(latest.following.length));
  set('kpi-nfb',        fmt(notFollowingBack.length));
  set('kpi-unfollowed', fmt(youDontFollowBack.length));

  // Deltas vs previous snapshot
  var dF  = document.getElementById('delta-followers');
  var dFo = document.getElementById('delta-following');
  if(prev) {
    var df  = latest.followers.length - prev.followers.length;
    var dfo = latest.following.length - prev.following.length;
    if(dF)  { dF.textContent  = (df  >= 0 ? '+' : '') + df  + ' since last snapshot'; dF.className  = 'kpi-delta ' + (df  >= 0 ? 'up' : 'down'); }
    if(dFo) { dFo.textContent = (dfo >= 0 ? '+' : '') + dfo + ' since last snapshot'; dFo.className = 'kpi-delta ' + (dfo >= 0 ? 'up' : 'down'); }
  } else {
    if(dF)  { dF.textContent  = 'First snapshot'; dF.className  = 'kpi-delta'; }
    if(dFo) { dFo.textContent = '';               dFo.className = 'kpi-delta'; }
  }

  // Changes section
  var cWrap = document.getElementById('changes-wrap');
  if(prev && cWrap) {
    var pF   = new Set(prev.followers);
    var pFol = new Set(prev.following);
    var newF    = latest.followers.filter(function(u) { return !pF.has(u); });
    var lostF   = prev.followers.filter(function(u)   { return !fSet.has(u); });
    var newFol  = latest.following.filter(function(u)  { return !pFol.has(u); });
    var lostFol = prev.following.filter(function(u)   { return !folSet.has(u); });
    set('changes-since', 'vs ' + fmtDate(prev.ts));
    cWrap.style.display = 'block';
    var cg = document.getElementById('change-grid');
    if(cg) cg.innerHTML =
      changeCard('New followers',          newF,    'chip-green')  +
      changeCard('Unfollowed you',         lostF,   'chip-red')    +
      changeCard('You started following',  newFol,  'chip-indigo') +
      changeCard('You unfollowed',         lostFol, 'chip-pink');
  } else if(cWrap) {
    cWrap.style.display = 'none';
  }

  // Profile grids — render paginated (100 at a time for performance)
  set('badge-nfb',        fmt(notFollowingBack.length)  + ' accounts');
  set('badge-unfollowed', fmt(youDontFollowBack.length) + ' accounts');

  renderProfileGrid('grid-nfb',        notFollowingBack,  'Everyone you follow follows you back');
  renderProfileGrid('grid-unfollowed', youDontFollowBack, 'You follow everyone back');
}

/* ── Render a profile grid with show-more for large lists */
function renderProfileGrid(gridId, list, emptyMsg) {
  var grid = document.getElementById(gridId);
  if(!grid) return;

  if(!list.length) {
    grid.innerHTML = '<div class="grid-empty">' + emptyMsg + '</div>';
    return;
  }

  var PAGE = 100;
  var shown = list.slice(0, PAGE);

  grid.innerHTML = shown.map(profileCard).join('') +
    (list.length > PAGE
      ? '<div class="show-more-wrap" style="grid-column:1/-1">' +
          '<button class="btn-ghost show-more-btn" ' +
          'onclick="showMoreGrid(\'' + gridId + '\', this, ' + PAGE + ')" ' +
          'data-list-id="' + gridId + '">' +
          'Show more (' + fmt(list.length - PAGE) + ' remaining)' +
          '</button>' +
        '</div>'
      : '');

  // Store full list on the element for show-more
  grid._fullList = list;
}

function showMoreGrid(gridId, btn, alreadyShown) {
  var grid = document.getElementById(gridId);
  if(!grid || !grid._fullList) return;
  var list = grid._fullList;
  var PAGE = 100;
  var nextShown = alreadyShown + PAGE;
  var newCards = list.slice(alreadyShown, nextShown).map(profileCard).join('');
  // Remove the show-more button wrapper
  var wrap = btn.parentElement;
  wrap.insertAdjacentHTML('beforebegin', newCards);
  if(nextShown >= list.length) {
    wrap.remove();
  } else {
    btn.textContent = 'Show more (' + fmt(list.length - nextShown) + ' remaining)';
    btn.setAttribute('onclick', 'showMoreGrid(\'' + gridId + '\', this, ' + nextShown + ')');
  }
}

/* ═══════════════════════════════════════════════════
   CHANGE CARDS
   ═══════════════════════════════════════════════════ */
function changeCard(title, users, chipCls) {
  var body = users.length
    ? users.slice(0, 6).map(miniRow).join('') +
      (users.length > 6 ? '<p class="mini-more">+' + fmt(users.length - 6) + ' more</p>' : '')
    : '<p class="mini-empty">No changes</p>';
  return '<div class="change-card">' +
    '<div class="change-card-head">' +
      '<span class="change-card-title">' + esc(title) + '</span>' +
      '<span class="chip ' + chipCls + '">' + users.length + '</span>' +
    '</div>' +
    '<div class="mini-list">' + body + '</div>' +
  '</div>';
}

/* ═══════════════════════════════════════════════════
   PROFILE CARD + MINI ROW
   ═══════════════════════════════════════════════════ */
function profileCard(username) {
  var init = initials(username);
  var url  = igUrl(username);
  return '<div class="profile-card" onclick="openProfile(\'' + escAttr(username) + '\')" ' +
    'role="button" tabindex="0" ' +
    'onkeydown="if(event.key===\'Enter\'||event.key===\' \')openProfile(\'' + escAttr(username) + '\')">' +
    '<div class="pc-avatar-wrap">' +
      '<div class="pc-aura"></div>' +
      '<div class="pc-avatar">' + init + '</div>' +
    '</div>' +
    '<p class="pc-username">@' + esc(username) + '</p>' +
    '<a class="pc-view-btn" href="' + url + '" target="_blank" rel="noopener noreferrer" ' +
      'onclick="event.stopPropagation()">View on Instagram ↗</a>' +
  '</div>';
}

function miniRow(username) {
  var init = initials(username);
  var url  = igUrl(username);
  return '<a class="mini-row" href="' + url + '" target="_blank" rel="noopener noreferrer">' +
    '<div class="mini-av">' + init + '</div>' +
    '<span class="mini-name">@' + esc(username) + '</span>' +
    '<span class="mini-arrow">↗</span>' +
  '</a>';
}

function openProfile(username) {
  window.open(igUrl(username), '_blank', 'noopener,noreferrer');
}

/* ═══════════════════════════════════════════════════
   BROWSE TAB
   ═══════════════════════════════════════════════════ */
function renderBrowse() {
  var snaps = loadSnaps();
  var grid  = document.getElementById('browse-grid');
  var sub   = document.getElementById('browse-subtitle');
  if(!grid) return;

  if(!snaps.length) {
    grid.innerHTML = '<div class="grid-empty">No snapshots yet — upload your data first</div>';
    if(sub) sub.textContent = '';
    return;
  }

  var latest = snaps[0];
  var fSet   = new Set(latest.followers);
  var folSet = new Set(latest.following);
  var q      = ((document.getElementById('browse-search') || {}).value || '').toLowerCase().trim();

  var list;
  if     (browseMode === 'nfb')      list = latest.following.filter(function(u) { return !fSet.has(u); });
  else if(browseMode === 'ydnfb')    list = latest.followers.filter(function(u) { return !folSet.has(u); });
  else if(browseMode === 'followers')list = latest.followers.slice();
  else                               list = latest.following.slice();

  if(q) list = list.filter(function(u) { return u.toLowerCase().indexOf(q) !== -1; });

  if(sub) sub.textContent = fmt(list.length) + ' ACCOUNTS';

  if(!list.length) {
    grid.innerHTML = '<div class="grid-empty">No accounts found</div>';
    return;
  }

  // Browse also uses paginated rendering
  grid._fullList = list;
  var PAGE = 100;
  grid.innerHTML = list.slice(0, PAGE).map(profileCard).join('') +
    (list.length > PAGE
      ? '<div class="show-more-wrap" style="grid-column:1/-1">' +
          '<button class="btn-ghost show-more-btn" ' +
          'onclick="showMoreBrowse(this, ' + PAGE + ')">' +
          'Show more (' + fmt(list.length - PAGE) + ' remaining)' +
          '</button>' +
        '</div>'
      : '');
}

function showMoreBrowse(btn, alreadyShown) {
  var grid = document.getElementById('browse-grid');
  if(!grid || !grid._fullList) return;
  var list = grid._fullList;
  var PAGE = 100;
  var nextShown = alreadyShown + PAGE;
  btn.parentElement.insertAdjacentHTML('beforebegin', list.slice(alreadyShown, nextShown).map(profileCard).join(''));
  if(nextShown >= list.length) btn.parentElement.remove();
  else { btn.textContent = 'Show more (' + fmt(list.length - nextShown) + ' remaining)'; btn.setAttribute('onclick', 'showMoreBrowse(this,' + nextShown + ')'); }
}

/* ═══════════════════════════════════════════════════
   HISTORY TAB
   ═══════════════════════════════════════════════════ */
function renderHistory() {
  var snaps = loadSnaps();
  var list  = document.getElementById('history-list');
  if(!list) return;

  if(!snaps.length) {
    list.innerHTML = '<div class="grid-empty" style="display:block;text-align:center;padding:3rem">No snapshots saved yet</div>';
    return;
  }

  list.innerHTML = snaps.map(function(s, i) {
    var badge = i === 0
      ? '<span class="hc-latest">Latest</span>'
      : '<button class="hc-del" onclick="deleteSnapshot(' + i + ')" aria-label="Delete">✕</button>';
    return '<div class="history-card">' +
      '<span class="hc-num">#' + (snaps.length - i) + '</span>' +
      '<div class="hc-info">' +
        '<p class="hc-time">' + fmtDateFull(s.ts) + '</p>' +
        '<p class="hc-meta">' + fmt(s.followers.length) + ' followers · ' + fmt(s.following.length) + ' following</p>' +
      '</div>' + badge +
    '</div>';
  }).join('');
}

function deleteSnapshot(i) {
  if(!confirm('Delete this snapshot?')) return;
  var snaps = loadSnaps();
  snaps.splice(i, 1);
  saveSnaps(snaps);
  updateSnapLabel();
  renderHistory();
}

function clearAllSnapshots() {
  if(!confirm('Delete ALL snapshots permanently?')) return;
  localStorage.removeItem(STORE);
  updateSnapLabel();
  renderHistory();
  renderDashboard();
}

/* ═══════════════════════════════════════════════════
   UTILITIES
   ═══════════════════════════════════════════════════ */
function updateSnapLabel() {
  var n  = loadSnaps().length;
  var el = document.getElementById('snap-count-label');
  if(el) el.textContent = n + (n === 1 ? ' snapshot saved' : ' snapshots saved');
}

function setDashSubtitle() {
  var el = document.getElementById('dash-subtitle');
  if(el) el.textContent = new Date().toLocaleDateString('en-US', {
    weekday:'long', year:'numeric', month:'long', day:'numeric'
  }).toUpperCase();
}

function set(id, val) { var el = document.getElementById(id); if(el) el.textContent = val; }
function fmt(n)       { return Number(n).toLocaleString(); }
function fmtDate(ts)  { return new Date(ts).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
function fmtDateFull(ts) {
  return new Date(ts).toLocaleString('en-US', {
    weekday:'short', month:'short', day:'numeric',
    year:'numeric', hour:'2-digit', minute:'2-digit'
  });
}

function igUrl(u)       { return 'https://www.instagram.com/' + encodeURIComponent(u) + '/'; }
function initials(u)    { var c = u.replace(/[^a-zA-Z0-9]/g,''); return (c.slice(0,2).toUpperCase()) || '??'; }
function esc(s)         { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s)     { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

