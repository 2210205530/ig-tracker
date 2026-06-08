// ── Storage ───────────────────────────────────────────
function getSnaps() {
  try { return JSON.parse(localStorage.getItem('followly_snaps') || '[]'); }
  catch { return []; }
}
function setSnaps(s) { localStorage.setItem('followly_snaps', JSON.stringify(s)); }

// ── State ─────────────────────────────────────────────
let pendingFollowers = null;
let pendingFollowing = null;
let browseMode = 'ghost';

// ── Tab navigation ────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'dashboard') renderDashboard();
    if (tab === 'browse')    renderBrowse();
    if (tab === 'history')   renderHistory();
  });
});

function goTab(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'browse')    renderBrowse();
  if (name === 'history')   renderHistory();
}

// ── Browse filter pills ───────────────────────────────
document.querySelectorAll('.pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
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
  return items.flatMap(item => {
    if (item.string_list_data) return item.string_list_data.map(x => x.value);
    if (item.value) return [item.value];
    return [];
  }).filter(Boolean);
}

// ── File inputs ───────────────────────────────────────
function loadFile(type, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dzEl = document.getElementById('dz-' + type);
    const stEl = document.getElementById('st-' + type);
    try {
      const users = parseIG(e.target.result, type);
      if (!users.length) throw new Error('No users found');
      if (type === 'followers') pendingFollowers = users;
      else pendingFollowing = users;
      stEl.textContent = '✓ ' + users.length.toLocaleString() + ' loaded';
      stEl.className = 'dz-status ok';
      dzEl.classList.add('loaded');
      checkReady();
    } catch (err) {
      stEl.textContent = '✗ ' + err.message;
      stEl.className = 'dz-status err';
      dzEl.classList.remove('loaded');
    }
  };
  reader.readAsText(file);
}

document.getElementById('file-followers').addEventListener('change', function() { loadFile('followers', this); });
document.getElementById('file-following').addEventListener('change', function() { loadFile('following', this); });

function checkReady() {
  const ready = pendingFollowers && pendingFollowing;
  document.getElementById('btn-save').disabled = !ready;
  const a = document.getElementById('upload-alert');
  if (ready) {
    a.style.display = 'block';
    a.className = 'alert alert-info';
    a.textContent = '✓ Both files ready! Click "Save snapshot" to record this state.';
  }
}

// ── Save snapshot ─────────────────────────────────────
function saveSnapshot() {
  const snaps = getSnaps();
  snaps.unshift({ ts: Date.now(), followers: pendingFollowers, following: pendingFollowing });
  if (snaps.length > 50) snaps.length = 50;
  setSnaps(snaps);
  updateSnapPill();
  const a = document.getElementById('upload-alert');
  a.className = 'alert alert-success';
  a.textContent = '🎉 Snapshot saved! Go to Dashboard to see your stats.';
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
  document.getElementById('upload-alert').style.display = 'none';
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
  const ratio  = latest.followers.length / Math.max(1, latest.following.length);

  // Stat cards
  setValue('sv-followers', latest.followers.length.toLocaleString());
  setValue('sv-following', latest.following.length.toLocaleString());
  setValue('sv-ghost', ghosts.length.toLocaleString());
  setValue('sv-ratio', ratio.toFixed(2));
  document.getElementById('ss-ratio').textContent =
    ratio >= 1 ? '👍 More followers than following' : '⚠ Following more than followers';

  // Deltas vs previous snapshot
  const sdF  = document.getElementById('sd-followers');
  const sdFo = document.getElementById('sd-following');
  if (prev) {
    const df = latest.followers.length - prev.followers.length;
    const dfo = latest.following.length - prev.following.length;
    sdF.textContent  = (df >= 0 ? '+' : '') + df + ' since last snapshot';
    sdF.className    = 'shc-delta ' + (df >= 0 ? 'up' : 'down');
    sdFo.textContent = (dfo >= 0 ? '+' : '') + dfo + ' since last snapshot';
    sdFo.className   = 'shc-delta ' + (dfo >= 0 ? 'up' : 'down');
  } else {
    sdF.textContent = ''; sdFo.textContent = '';
  }

  // Changes section
  const cGrid = document.getElementById('changes-grid');
  const cTitle = document.getElementById('changes-title');
  if (prev) {
    const pF   = new Set(prev.followers);
    const pFol = new Set(prev.following);
    const newF  = latest.followers.filter(u => !pF.has(u));
    const lostF = prev.followers.filter(u => !fSet.has(u));
    const newFo  = latest.following.filter(u => !pFol.has(u));
    const lostFo = prev.following.filter(u => !folSet.has(u));

    cTitle.style.display = 'flex';
    cTitle.textContent   = '📣 Changes since ' + new Date(prev.ts).toLocaleDateString();
    cGrid.style.display  = 'grid';
    cGrid.innerHTML =
      changeCard('👋 New followers',      newF,  'badge-green') +
      changeCard('💔 Unfollowed you',     lostF, 'badge-red') +
      changeCard('➕ You started following', newFo, 'badge-cyan') +
      changeCard('➖ You unfollowed',      lostFo,'badge-amber');
  } else {
    cTitle.style.display = 'none';
    cGrid.style.display  = 'none';
  }

  // Ghost grid
  document.getElementById('ghost-grid').innerHTML = ghosts.length
    ? ghosts.map(u => profileCard(u)).join('')
    : '<div class="grid-empty">🎉 Everyone follows you back!</div>';
}

function setValue(id, val) { document.getElementById(id).textContent = val; }

function changeCard(title, users, badgeClass) {
  if (!users.length) return `
    <div class="change-card">
      <div class="change-card-header">
        <span class="change-card-title">${title}</span>
        <span class="count-badge ${badgeClass}">0</span>
      </div>
      <div style="font-size:13px;color:var(--text-3);padding:4px 0;">No changes</div>
    </div>`;

  const rows = users.slice(0, 5).map(u => miniProfile(u)).join('');
  const more = users.length > 5
    ? `<div class="mini-more">+${users.length - 5} more</div>` : '';
  return `
    <div class="change-card">
      <div class="change-card-header">
        <span class="change-card-title">${title}</span>
        <span class="count-badge ${badgeClass}">${users.length}</span>
      </div>
      <div class="mini-profile-list">${rows}${more}</div>
    </div>`;
}

// ── Profile card (grid) ───────────────────────────────
function profileCard(username) {
  const initials = username.replace(/[^a-zA-Z0-9]/g,'').slice(0,2).toUpperCase() || '??';
  const url = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
  return `
    <div class="profile-card" onclick="window.open('${url}','_blank')">
      <div class="pc-avatar">${initials}</div>
      <div class="pc-name">@${esc(username)}</div>
      <a class="pc-link-btn" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">
        View on Instagram ↗
      </a>
    </div>`;
}

// ── Mini profile row (inside change cards) ────────────
function miniProfile(username) {
  const initials = username.replace(/[^a-zA-Z0-9]/g,'').slice(0,2).toUpperCase() || '??';
  const url = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
  return `
    <a class="mini-profile" href="${url}" target="_blank" rel="noopener">
      <div class="mini-avatar">${initials}</div>
      <span class="mini-name">@${esc(username)}</span>
      <span class="mini-arrow">↗</span>
    </a>`;
}

// ── Browse ────────────────────────────────────────────
function renderBrowse() {
  const snaps = getSnaps();
  const grid  = document.getElementById('browse-grid');
  const count = document.getElementById('browse-count');

  if (!snaps.length) {
    grid.innerHTML = '<div class="grid-empty">No snapshots yet. Upload your data first.</div>';
    count.textContent = '';
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
  grid.innerHTML = shown.map(u => profileCard(u)).join('') +
    (list.length > 120 ? `<div class="grid-empty" style="grid-column:1/-1;">Showing 120 of ${list.length} — use search to narrow down</div>` : '');
}

// ── History ───────────────────────────────────────────
function renderHistory() {
  const snaps = getSnaps();
  const list  = document.getElementById('history-list');

  if (!snaps.length) {
    list.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--text-3);font-size:14px;font-weight:600;">No snapshots saved yet.</div>';
    return;
  }

  list.innerHTML = snaps.map((s, i) => `
    <div class="history-card">
      <div class="hc-index">#${snaps.length - i}</div>
      <div class="hc-info">
        <div class="hc-time">${new Date(s.ts).toLocaleString()}</div>
        <div class="hc-meta">${s.followers.length.toLocaleString()} followers · ${s.following.length.toLocaleString()} following</div>
      </div>
      ${i === 0
        ? '<span class="hc-latest">Latest</span>'
        : `<button class="hc-del" onclick="deleteSnap(${i})" title="Delete">✕</button>`
      }
    </div>`).join('');
}

function deleteSnap(i) {
  if (!confirm('Delete this snapshot?')) return;
  const snaps = getSnaps();
  snaps.splice(i, 1);
  setSnaps(snaps);
  updateSnapPill();
  renderHistory();
}

function clearAll() {
  if (!confirm('Delete ALL snapshots? This cannot be undone.')) return;
  localStorage.removeItem('followly_snaps');
  updateSnapPill();
  renderHistory();
}

// ── Utilities ─────────────────────────────────────────
function updateSnapPill() {
  const n = getSnaps().length;
  document.getElementById('snap-pill').textContent = n + (n === 1 ? ' snapshot' : ' snapshots');
}

function esc(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Init ──────────────────────────────────────────────
updateSnapPill();
renderDashboard();
