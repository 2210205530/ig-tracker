'use strict';

// ── Storage ────────────────────────────────────────────
const STORE_KEY = 'followly_v4';
function getSnaps() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { return []; } }
function setSnaps(s) { localStorage.setItem(STORE_KEY, JSON.stringify(s)); }

// ── State ──────────────────────────────────────────────
let pendingF = null;
let pendingFo = null;
let browseMode = 'ghost';

// ── Boot ───────────────────────────────────────────────
(function init() {
  const d = new Date();
  const fmt = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  setText('dash-date', fmt.toUpperCase());
  updateMeta();
  renderDashboard();

  document.getElementById('file-followers').addEventListener('change', function () { loadFile('followers', this); });
  document.getElementById('file-following').addEventListener('change', function () { loadFile('following', this); });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll('.pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      browseMode = btn.dataset.mode;
      renderBrowse();
    });
  });

  document.getElementById('browse-search').addEventListener('input', renderBrowse);
})();

// ── Tab switching ──────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'browse')    renderBrowse();
  if (name === 'history')   renderHistory();
}

function goTab(name) { switchTab(name); }

// ── Instagram JSON parser ──────────────────────────────
function parseIG(raw, type) {
  const data = JSON.parse(raw);
  let items = [];
  if (type === 'followers') {
    items = Array.isArray(data) ? data : (data.relationships_followers || []);
  } else {
    items = Array.isArray(data) ? data : (data.relationships_following || (Array.isArray(data) ? data : []));
  }
  if (!Array.isArray(items)) items = [];
  return items.flatMap(item => {
    if (item?.string_list_data) return item.string_list_data.map(x => x.value).filter(Boolean);
    if (item?.value) return [item.value];
    return [];
  }).filter(Boolean);
}

// ── File load ──────────────────────────────────────────
function loadFile(type, input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dz = document.getElementById('dz-' + type);
    const st = document.getElementById('st-' + type);
    try {
      const users = parseIG(e.target.result, type);
      if (!users.length) throw new Error('No usernames found');
      if (type === 'followers') pendingF = users;
      else pendingFo = users;
      st.textContent = '✓  ' + users.length.toLocaleString() + ' accounts';
      st.className = 'dz-status ok';
      dz.classList.add('loaded');
      checkReady();
    } catch (err) {
      st.textContent = '✗  ' + err.message;
      st.className = 'dz-status err';
      dz.classList.remove('loaded');
    }
  };
  reader.readAsText(file);
}

function checkReady() {
  const ready = !!(pendingF && pendingFo);
  document.getElementById('btn-save').disabled = !ready;
  const a = document.getElementById('upload-alert');
  if (ready) {
    a.style.display = 'block';
    a.className = 'upload-alert info';
    a.textContent = '⚡  Both files ready — save snapshot to record this state.';
  }
}

// ── Save snapshot ──────────────────────────────────────
function saveSnapshot() {
  const snaps = getSnaps();
  snaps.unshift({ ts: Date.now(), followers: pendingF, following: pendingFo });
  if (snaps.length > 50) snaps.length = 50;
  setSnaps(snaps);
  updateMeta();
  const a = document.getElementById('upload-alert');
  a.className = 'upload-alert success';
  a.textContent = '✓  Snapshot saved — visit Dashboard to review your stats.';
  document.getElementById('btn-save').disabled = true;
}

function clearUpload() {
  pendingF = null; pendingFo = null;
  ['followers', 'following'].forEach(t => {
    document.getElementById('file-' + t).value = '';
    const st = document.getElementById('st-' + t);
    st.textContent = ''; st.className = 'dz-status';
    document.getElementById('dz-' + t).classList.remove('loaded');
  });
  const a = document.getElementById('upload-alert');
  a.style.display = 'none';
  document.getElementById('btn-save').disabled = true;
}

// ── Dashboard ──────────────────────────────────────────
function renderDashboard() {
  const snaps = getSnaps();
  const empty   = document.getElementById('dash-empty');
  const content = document.getElementById('dash-content');

  if (!snaps.length) {
    empty.style.display = 'flex';
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

  setText('kv-followers', latest.followers.length.toLocaleString());
  setText('kv-following', latest.following.length.toLocaleString());
  setText('kv-ghost',     ghosts.length.toLocaleString());
  setText('kv-ratio',     ratio);
  setText('ks-ratio',     parseFloat(ratio) >= 1 ? '↑ good standing' : '↓ following more');

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
  const changesSection = document.getElementById('changes-section');
  if (prev) {
    const pF   = new Set(prev.followers);
    const pFol = new Set(prev.following);
    const newF    = latest.followers.filter(u => !pF.has(u));
    const lostF   = prev.followers.filter(u => !fSet.has(u));
    const newFol  = latest.following.filter(u => !pFol.has(u));
    const lostFol = prev.following.filter(u => !folSet.has(u));

    setText('since-tag', 'vs ' + new Date(prev.ts).toLocaleDateString());
    changesSection.style.display = 'block';
    document.getElementById('changes-grid').innerHTML =
      changeCard('New followers',        newF,    'chip-green')  +
      changeCard('Unfollowed you',       lostF,   'chip-red')    +
      changeCard('You started following',newFol,  'chip-indigo') +
      changeCard('You unfollowed',       lostFol, 'chip-pink');
  } else {
    changesSection.style.display = 'none';
  }

  // Ghost grid
  setText('ghost-count-tag', ghosts.length.toLocaleString() + ' accounts');
  const gg = document.getElementById('ghost-grid');
  gg.innerHTML = ghosts.length
    ? ghosts.map((u, i) => profileCard(u, i)).join('')
    : '<div class="grid-empty">everyone follows you back</div>';
}

// ── Change card ────────────────────────────────────────
function changeCard(title, users, chipCls) {
  const body = users.length
    ? users.slice(0, 5).map(u => miniRow(u)).join('') +
      (users.length > 5 ? `<p class="mini-more">+${users.length - 5} more</p>` : '')
    : '<p class="mini-none">no changes</p>';

  return `<div class="change-card">
    <div class="cc-head">
      <span class="cc-title">${esc(title)}</span>
      <span class="chip ${chipCls}">${users.length}</span>
    </div>
    <div class="mini-list">${body}</div>
  </div>`;
}

// ── Profile card ───────────────────────────────────────
function profileCard(username, idx = 0) {
  const init  = username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
  const url   = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
  const delay = Math.min(idx * 28, 700);
  return `<div class="profile-card" style="animation-delay:${delay}ms" onclick="window.open('${url}','_blank')" role="link" tabindex="0">
    <div class="pc-avatar-wrap">
      <div class="pc-aura"></div>
      <div class="pc-avatar">${init}</div>
    </div>
    <p class="pc-name">@${esc(username)}</p>
    <a class="pc-open" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">View ↗</a>
  </div>`;
}

// ── Mini profile row ───────────────────────────────────
function miniRow(username) {
  const init = username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??';
  const url  = 'https://www.instagram.com/' + encodeURIComponent(username) + '/';
  return `<a class="mini-row" href="${url}" target="_blank" rel="noopener">
    <div class="mini-av">${init}</div>
    <span class="mini-name">@${esc(username)}</span>
    <span class="mini-arrow">↗</span>
  </a>`;
}

// ── Browse ─────────────────────────────────────────────
function renderBrowse() {
  const snaps = getSnaps();
  const grid  = document.getElementById('browse-grid');
  const count = document.getElementById('browse-count');

  if (!snaps.length) {
    grid.innerHTML = '<div class="grid-empty">no snapshots yet — upload your data first</div>';
    count.textContent = '';
    return;
  }

  const latest = snaps[0];
  const fSet   = new Set(latest.followers);
  const q      = document.getElementById('browse-search').value.toLowerCase().trim();

  let list;
  if      (browseMode === 'ghost')     list = latest.following.filter(u => !fSet.has(u));
  else if (browseMode === 'followers') list = [...latest.followers];
  else                                 list = [...latest.following];

  if (q) list = list.filter(u => u.toLowerCase().includes(q));

  count.textContent = (list.length.toLocaleString() + ' accounts').toUpperCase();

  if (!list.length) {
    grid.innerHTML = '<div class="grid-empty">no accounts found</div>';
    return;
  }

  grid.innerHTML = list.slice(0, 120).map((u, i) => profileCard(u, i)).join('') +
    (list.length > 120
      ? `<div class="grid-empty" style="grid-column:1/-1">showing 120 of ${list.length} — use search to narrow down</div>`
      : '');
}

// ── History ────────────────────────────────────────────
function renderHistory() {
  const snaps = getSnaps();
  const list  = document.getElementById('history-list');

  if (!snaps.length) {
    list.innerHTML = '<div class="grid-empty" style="display:block;text-align:center;padding:3rem;">no snapshots saved yet</div>';
    return;
  }

  list.innerHTML = snaps.map((s, i) => `
    <div class="history-card">
      <span class="hc-idx">#${snaps.length - i}</span>
      <div class="hc-info">
        <p class="hc-time">${new Date(s.ts).toLocaleString('en-US', { weekday:'short', year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</p>
        <p class="hc-meta">${s.followers.length.toLocaleString()} followers  ·  ${s.following.length.toLocaleString()} following</p>
      </div>
      ${i === 0
        ? '<span class="hc-latest">Latest</span>'
        : `<button class="hc-del" onclick="deleteSnap(${i})" title="Delete snapshot">✕</button>`}
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
  localStorage.removeItem(STORE_KEY);
  updateMeta();
  renderHistory();
}

// ── Utilities ──────────────────────────────────────────
function updateMeta() {
  const n  = getSnaps().length;
  const el = document.getElementById('snap-label');
  if (el) el.textContent = n + (n === 1 ? ' snapshot' : ' snapshots');
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
