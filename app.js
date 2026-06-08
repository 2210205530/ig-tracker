// ── Storage ───────────────────────────────────────────
function getSnaps() {
  try { return JSON.parse(localStorage.getItem('followly_v3') || '[]'); }
  catch { return []; }
}
function setSnaps(s) { localStorage.setItem('followly_v3', JSON.stringify(s)); }

// ── State ─────────────────────────────────────────────
let pendingFollowers = null;
let pendingFollowing = null;
let browseMode = 'ghost';

// ── Init ──────────────────────────────────────────────
document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' });
updateMeta();
renderDashboard();

// ── Nav ───────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'browse')    renderBrowse();
    if (tab === 'history')   renderHistory();
  });
});

function goTab(name) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'browse')    renderBrowse();
  if (name === 'history')   renderHistory();
}

// ── Filter pills ──────────────────────────────────────
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    browseMode = btn.dataset.mode;
    renderBrowse();
  });
});

document.getElementById('browse-search').addEventListener('input', renderBrowse);

// ── Parse Instagram JSON ──────────────────────────────
function parseIG(text, type) {
  const data = JSON.parse(text);
  let items = [];
  if (type === 'followers') {
    items = Array.isArray(data) ? data : (data.relationships_followers || []);
  } else {
    items = Array.isArray(data) ? data : (data.relationships_following || data);
  }
  if (!Array.isArray(items)) items = [];
  return items.flatMap(item => {
    if (item && item.string_list_data) return item.string_list_data.map(x => x.value).filter(Boolean);
    if (item && item.value) return [item.value];
    return [];
  }).filter(Boolean);
}

// ── File inputs ───────────────────────────────────────
function loadFile(type, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dz = document.getElementById('dz-' + type);
    const st = document.getElementById('st-' + type);
    try {
      const users = parseIG(e.target.result, type);
      if (!users.length) throw new Error('No users found');
      if (type === 'followers') pendingFollowers = users;
      else pendingFollowing = users;
      st.textContent = '✓ ' + users.length.toLocaleString() + ' users';
      st.className = 'dz-status ok';
      dz.classList.add('loaded');
      checkReady();
    } catch (err) {
      st.textContent = '✗ ' + err.message;
      st.className = 'dz-status err';
      dz.classList.remove('loaded');
    }
  };
  reader.readAsText(file);
}

document.getElementById('file-followers').addEventListener('change', function() { loadFile('followers', this); });
document.getElementById('file-following').addEventListener('change', function() { loadFile('following', this); });

function checkReady() {
  const ready = !!(pendingFollowers && pendingFollowing);
  document.getElementById('btn-save').disabled = !ready;
  const a = document.getElementById('upload-alert');
  if (ready) {
    a.style.display = 'block';
    a.className = 'upload-alert info';
    a.textContent = '⚡ Both files ready — save snapshot to record this state.';
  }
}

// ── Save snapshot ─────────────────────────────────────
function saveSnapshot() {
  const snaps = getSnaps();
  snaps.unshift({ ts: Date.now(), followers: pendingFollowers, following: pendingFollowing });
  if (snaps.length > 50) snaps.length = 50;
  setSnaps(snaps);
  updateMeta();
  const a = document.getElementById('upload-alert');
  a.className = 'upload-alert success';
  a.textContent = '✓ Snapshot saved! Head to Dashboard to see your stats.';
  document.getElementById('btn-save').disabled = true;
}

function clearUpload() {
  pendingFollowers = null;
  pendingFollowing = null;
  ['followers','following'].forEach(t => {
    document.getElementById('file-' + t).value = '';
    const st = document.getElementById('st-' + t);
    st.textContent = ''; st.className = 'dz-status';
    document.getElementById('dz-' + t).classList.remove('loaded');
  });
  const a = document.getElementById('upload-alert');
  a.style.display = 'none';
  document.getElementById('btn-save').disabled = true;
}

// ── Dashboard ─────────────────────────────────────────
function renderDashboard() {
  const snaps = getSnaps();
  const empty = document.getElementById('dash-empty');
  const content = document.getElementById('dash-content');

  if (!snaps.length) {
    empty.style.display = 'block';
    content.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  content.style.display = 'block';

  const latest = snaps[0];
  const prev   = snaps[1];
  const fSet   = new Set(latest.followers);
  const folSet = new Set(latest.following);
  const ghosts = latest.following.filter(u => !fSet.has(u));
  const ratio  = (latest.followers.length / Math.max(1, latest.following.length)).toFixed(2);

  // KPI values
  setText('kv-followers', latest.followers.length.toLocaleString());
  setText('kv-following', latest.following.length.toLocaleString());
  setText('kv-ghost', ghosts.length.toLocaleString());
  setText('kv-ratio', ratio);
  const ratioNum = parseFloat(ratio);
  setText('ks-ratio', ratioNum >= 1 ? '↑ Good standing' : '↓ Following more');

  // Deltas
  const kdF  = document.getElementById('kd-followers');
  const kdFo = document.getElementById('kd-following');
  if (prev) {
    const df  = latest.followers.length - prev.followers.length;
    const dfo = latest.following.length - prev.following.length;
    kdF.textContent  = (df >= 0 ? '+' : '') + df + ' since last';
    kdF.className    = 'kpi-delta ' + (df >= 0 ? 'up' : 'down');
    kdFo.textContent = (dfo >= 0 ? '+' : '') + dfo + ' since last';
    kdFo.className   = 'kpi-delta ' + (dfo >= 0 ? 'up' : 'down');
  } else {
    kdF.textContent = ''; kdFo.textContent = '';
  }

  // Changes section
  const cWrap = document.getElementById('changes-wrap');
  const cGrid = document.getElementById('changes-grid');
  if (prev) {
    const pF   = new Set(prev.followers);
    const pFol = new Set(prev.following);
    const newF   = latest.followers.filter(u => !pF.has(u));
    const lostF  = prev.followers.filter(u => !fSet.has(u));
    const newFol = latest.following.filter(u => !pFol.has(u));
    const lostFol= prev.following.filter(u => !folSet.has(u));

    setText('changes-since', 'vs ' + new Date(prev.ts).toLocaleDateString());
    cWrap.style.display = 'block';
    cGrid.innerHTML =
      changeCard('New followers',        newF,   'chip-green') +
      changeCard('Unfollowed you',       lostF,  'chip-red') +
      changeCard('You started following',newFol, 'chip-cyan') +
      changeCard('You unfollowed',       lostFol,'chip-violet');
  } else {
    cWrap.style.display = 'none';
  }

  // Ghost grid
  setText('ghost-count-tag', ghosts.length.toLocaleString() + ' accounts');
  const gg = document.getElementById('ghost-grid');
  if (ghosts.length) {
    gg.innerHTML = ghosts.map((u, i) => profileCard(u, i)).join('');
  } else {
    gg.innerHTML = '<div class="grid-empty">🎉 Everyone follows you back</div>';
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Change card ───────────────────────────────────────
function changeCard(title, users, chipClass) {
  const rows = users.length
    ? users.slice(0, 5).map(u => miniRow(u)).join('') +
      (users.length > 5 ? `<div class="mini-more">+${users.length - 5} more</div>` : '')
    : `<div class="mini-none">No changes</div>`;

  return `<div class="change-card">
    <div class="change-card-head">
      <span class="change-card-title">${esc(title)}</span>
      <span class="chip ${chipClass}">${users.length}</span>
    </div>
    <div class="mini-list">${rows}</div>
  </div>`;
}

// ── Profile card ──────────────────────────────────────
function profileCard(username, index = 0) {
  const init = username.replace(/[^a-zA-Z0-9]/g,'').slice(0,2).toUpperCase() || '??';
  const url  = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
  const delay = Math.min(index * 30, 600);
  return `<div class="profile-card" style="animation-delay:${delay}ms" onclick="window.open('${url}','_blank')">
    <div class="pc-avatar">
      <div class="pc-avatar-ring"></div>
      ${init}
    </div>
    <div class="pc-name">@${esc(username)}</div>
    <a class="pc-open" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
      View ↗
    </a>
  </div>`;
}

// ── Mini row ──────────────────────────────────────────
function miniRow(username) {
  const init = username.replace(/[^a-zA-Z0-9]/g,'').slice(0,2).toUpperCase() || '??';
  const url  = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
  return `<a class="mini-row" href="${url}" target="_blank" rel="noopener">
    <div class="mini-av">${init}</div>
    <span class="mini-name">@${esc(username)}</span>
    <span class="mini-arrow">↗</span>
  </a>`;
}

// ── Browse ────────────────────────────────────────────
function renderBrowse() {
  const snaps  = getSnaps();
  const grid   = document.getElementById('browse-grid');
  const count  = document.getElementById('browse-count');

  if (!snaps.length) {
    grid.innerHTML = '<div class="grid-empty">No snapshots yet. Upload your data first.</div>';
    count.textContent = 'No data';
    return;
  }

  const latest = snaps[0];
  const fSet   = new Set(latest.followers);
  const q      = document.getElementById('browse-search').value.toLowerCase().trim();

  let list;
  if (browseMode === 'ghost')      list = latest.following.filter(u => !fSet.has(u));
  else if (browseMode === 'followers') list = [...latest.followers];
  else                             list = [...latest.following];

  if (q) list = list.filter(u => u.toLowerCase().includes(q));

  count.textContent = list.length.toLocaleString() + ' accounts';

  if (!list.length) {
    grid.innerHTML = '<div class="grid-empty">No accounts found.</div>';
    return;
  }

  const shown = list.slice(0, 120);
  grid.innerHTML = shown.map((u, i) => profileCard(u, i)).join('') +
    (list.length > 120
      ? `<div class="grid-empty" style="grid-column:1/-1">Showing 120 of ${list.length} — refine with search</div>`
      : '');
}

// ── History ───────────────────────────────────────────
function renderHistory() {
  const snaps = getSnaps();
  const list  = document.getElementById('history-list');

  if (!snaps.length) {
    list.innerHTML = '<div class="grid-empty" style="display:block;text-align:center;padding:3rem;">No snapshots saved yet.</div>';
    return;
  }

  list.innerHTML = snaps.map((s, i) => `
    <div class="history-card">
      <span class="hc-num">#${snaps.length - i}</span>
      <div class="hc-info">
        <div class="hc-time">${new Date(s.ts).toLocaleString()}</div>
        <div class="hc-meta">${s.followers.length.toLocaleString()} followers · ${s.following.length.toLocaleString()} following</div>
      </div>
      ${i === 0
        ? '<span class="hc-badge">Latest</span>'
        : `<button class="hc-del" onclick="deleteSnap(${i})" title="Delete">✕</button>`}
    </div>`).join('');
}

function deleteSnap(i) {
  if (!confirm('Delete this snapshot?')) return;
  const snaps = getSnaps();
  snaps.splice(i, 1);
  setSnaps(snaps);
  updateMeta();
  renderHistory();
}

function clearAll() {
  if (!confirm('Delete ALL snapshots? This cannot be undone.')) return;
  localStorage.removeItem('followly_v3');
  updateMeta();
  renderHistory();
}

// ── Utilities ─────────────────────────────────────────
function updateMeta() {
  const n = getSnaps().length;
  const el = document.getElementById('snap-count-side');
  if (el) el.textContent = n + (n === 1 ? ' snapshot' : ' snapshots');
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
