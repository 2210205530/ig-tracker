// ── Storage helpers ──────────────────────────────────
function getSnapshots() {
  try { return JSON.parse(localStorage.getItem('ig_snapshots') || '[]'); }
  catch { return []; }
}
function saveSnapshots(snaps) {
  localStorage.setItem('ig_snapshots', JSON.stringify(snaps));
}

// ── State ─────────────────────────────────────────────
let currentFollowers = null;
let currentFollowing = null;
let browseMode = 'nonfollowers';

// ── Tab navigation ────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
    if (tab === 'changes') renderChanges();
    if (tab === 'browse') renderBrowse();
    if (tab === 'history') renderHistory();
  });
});

// ── Browse filter buttons ─────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    browseMode = btn.dataset.mode;
    renderBrowse();
  });
});

document.getElementById('browse-search').addEventListener('input', renderBrowse);

// ── File loading ──────────────────────────────────────
function parseInstagramJSON(text, type) {
  const data = JSON.parse(text);
  let items = [];
  if (type === 'followers') {
    if (Array.isArray(data)) items = data;
    else if (data.relationships_followers) items = data.relationships_followers;
  } else {
    if (Array.isArray(data)) items = data;
    else if (data.relationships_following) items = data.relationships_following;
    else items = data;
  }
  return items.flatMap(item => {
    if (item.string_list_data) return item.string_list_data.map(x => x.value);
    if (item.value) return [item.value];
    return [];
  }).filter(Boolean);
}

function loadFile(type, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const statusEl = document.getElementById('status-' + type);
    try {
      const users = parseInstagramJSON(e.target.result, type);
      if (users.length === 0) throw new Error('No usernames found — check the file');
      if (type === 'followers') currentFollowers = users;
      else currentFollowing = users;
      statusEl.textContent = '✓ ' + users.length + ' users loaded';
      statusEl.className = 'upload-status ok';
      checkReady();
    } catch (err) {
      statusEl.textContent = '✗ ' + err.message;
      statusEl.className = 'upload-status err';
    }
  };
  reader.readAsText(file);
}

// Wire up file inputs
document.getElementById('file-followers').addEventListener('change', function() { loadFile('followers', this); });
document.getElementById('file-following').addEventListener('change', function() { loadFile('following', this); });

function checkReady() {
  const ready = currentFollowers !== null && currentFollowing !== null;
  document.getElementById('btn-save').disabled = !ready;
  const alert = document.getElementById('upload-alert');
  if (ready) {
    alert.style.display = 'block';
    alert.className = 'alert alert-info';
    alert.textContent = 'Both files loaded. Click "Save snapshot" to record this state and detect changes next time.';
  } else {
    alert.style.display = 'none';
  }
}

// ── Save snapshot ─────────────────────────────────────
function saveSnapshot() {
  const snaps = getSnapshots();
  snaps.unshift({ ts: Date.now(), followers: currentFollowers, following: currentFollowing });
  if (snaps.length > 50) snaps.length = 50;
  saveSnapshots(snaps);
  updateSnapCount();

  const alert = document.getElementById('upload-alert');
  alert.className = 'alert alert-success';
  alert.textContent = '✓ Snapshot saved! Go to "Changes" to see what changed since last time.';
  document.getElementById('btn-save').disabled = true;
}

function clearUpload() {
  currentFollowers = null;
  currentFollowing = null;
  document.getElementById('file-followers').value = '';
  document.getElementById('file-following').value = '';
  ['followers', 'following'].forEach(t => {
    const el = document.getElementById('status-' + t);
    el.textContent = '';
    el.className = 'upload-status';
  });
  document.getElementById('upload-alert').style.display = 'none';
  document.getElementById('btn-save').disabled = true;
}

// ── Changes tab ───────────────────────────────────────
function renderChanges() {
  const el = document.getElementById('changes-content');
  const snaps = getSnapshots();

  if (snaps.length === 0) {
    el.innerHTML = '<div class="empty">No snapshots yet. Upload your Instagram data first.</div>';
    return;
  }

  const latest = snaps[0];
  const prev = snaps[1];
  const fSet = new Set(latest.followers);
  const folSet = new Set(latest.following);
  const notFollowingBack = latest.following.filter(u => !fSet.has(u));
  const youDontFollowBack = latest.followers.filter(u => !folSet.has(u));

  let html = `<div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Followers</div>
      <div class="stat-value">${latest.followers.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Following</div>
      <div class="stat-value">${latest.following.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Don't follow back</div>
      <div class="stat-value red">${notFollowingBack.length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">You don't follow back</div>
      <div class="stat-value accent">${youDontFollowBack.length}</div>
    </div>
  </div>`;

  if (prev) {
    const pF = new Set(prev.followers);
    const pFol = new Set(prev.following);
    const newFollowers = latest.followers.filter(u => !pF.has(u));
    const lostFollowers = prev.followers.filter(u => !fSet.has(u));
    const newFollowing = latest.following.filter(u => !pFol.has(u));
    const lostFollowing = prev.following.filter(u => !folSet.has(u));

    const prevDate = new Date(prev.ts).toLocaleString();
    html += `<p style="font-size:12px;color:var(--text-3);font-family:var(--mono);margin-bottom:1.5rem;">Since ${prevDate}</p>`;

    const hasChanges = newFollowers.length || lostFollowers.length || newFollowing.length || lostFollowing.length;
    if (!hasChanges) {
      html += '<div class="no-changes">— No changes detected since last snapshot —</div>';
    } else {
      html += changeBlock('New followers', newFollowers, 'badge-green');
      html += changeBlock('Unfollowed you', lostFollowers, 'badge-red');
      html += changeBlock('You started following', newFollowing, 'badge-blue');
      html += changeBlock('You unfollowed', lostFollowing, 'badge-amber');
    }
  } else {
    html += `<div class="alert alert-info" style="display:block;margin-bottom:1.5rem;">Only one snapshot saved. Upload again later to detect changes over time.</div>`;
    html += changeBlock('People you follow who don\'t follow back', notFollowingBack, 'badge-red');
  }

  el.innerHTML = html;
}

function changeBlock(title, users, badgeClass) {
  if (users.length === 0) return '';
  let html = `<div class="change-block">
    <div class="change-heading">${title} <span class="badge ${badgeClass}">${users.length}</span></div>
    <div class="user-list">`;
  users.slice(0, 60).forEach(u => {
    html += userRow(u);
  });
  if (users.length > 60) html += `<div class="user-more">+ ${users.length - 60} more</div>`;
  html += '</div></div>';
  return html;
}

function userRow(u) {
  const initials = u.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
  return `<div class="user-row">
    <div class="avatar">${initials}</div>
    <span class="username">${escHtml(u)}</span>
    <a class="user-link" href="https://instagram.com/${encodeURIComponent(u)}" target="_blank" rel="noopener">↗ ig</a>
  </div>`;
}

// ── Browse tab ────────────────────────────────────────
function renderBrowse() {
  const el = document.getElementById('browse-content');
  const snaps = getSnapshots();

  if (snaps.length === 0) {
    el.innerHTML = '<div class="empty">No snapshots yet.</div>';
    return;
  }

  const latest = snaps[0];
  const q = document.getElementById('browse-search').value.toLowerCase().trim();
  const fSet = new Set(latest.followers);
  const folSet = new Set(latest.following);

  let list;
  if (browseMode === 'nonfollowers') list = latest.following.filter(u => !fSet.has(u));
  else if (browseMode === 'followers') list = [...latest.followers];
  else list = [...latest.following];

  if (q) list = list.filter(u => u.toLowerCase().includes(q));

  if (list.length === 0) {
    el.innerHTML = '<div class="empty">No users found.</div>';
    return;
  }

  let html = `<div class="user-list">`;
  list.slice(0, 100).forEach(u => { html += userRow(u); });
  if (list.length > 100) html += `<div class="user-more">+ ${list.length - 100} more — use search to narrow down</div>`;
  html += '</div>';
  el.innerHTML = html;
}

// ── History tab ───────────────────────────────────────
function renderHistory() {
  const el = document.getElementById('history-content');
  const snaps = getSnapshots();

  if (snaps.length === 0) {
    el.innerHTML = '<div class="empty">No snapshots saved yet.</div>';
    return;
  }

  let html = '<div class="snapshot-list">';
  snaps.forEach((s, i) => {
    html += `<div class="snapshot-row">
      <span class="snapshot-index">#${snaps.length - i}</span>
      <span class="snapshot-time">${new Date(s.ts).toLocaleString()}</span>
      <span class="snapshot-meta">${s.followers.length} followers · ${s.following.length} following</span>
      ${i === 0
        ? '<span class="snapshot-tag">Latest</span>'
        : `<button class="snapshot-del" onclick="deleteSnapshot(${i})" title="Delete this snapshot">✕</button>`
      }
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

function deleteSnapshot(i) {
  if (!confirm('Delete this snapshot?')) return;
  const snaps = getSnapshots();
  snaps.splice(i, 1);
  saveSnapshots(snaps);
  updateSnapCount();
  renderHistory();
}

function clearAll() {
  if (!confirm('Delete ALL snapshots? This cannot be undone.')) return;
  localStorage.removeItem('ig_snapshots');
  updateSnapCount();
  renderHistory();
}

// ── Utilities ─────────────────────────────────────────
function updateSnapCount() {
  const n = getSnapshots().length;
  document.getElementById('snap-count').textContent = n + (n === 1 ? ' snapshot' : ' snapshots');
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ──────────────────────────────────────────────
updateSnapCount();
