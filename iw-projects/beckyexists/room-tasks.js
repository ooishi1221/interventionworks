/* room-tasks.js — タスク表 / due / コメントスレッド / 完了ログ
 * classic script（type="module" 禁止）。$ / esc / fmtAgo / fetchJson は room.html 側の inline script が定義する。
 * 関数はすべて呼び出し時にそれらを参照するので、本ファイルを inline script より先に読み込んでよい。 */

const CAT_TAG = { voice: 'vob', 'vibe-guard': 'vg', beckyexists: 'be', biz: 'biz', 'iw-local': 'local', content: 'note', slight: 'slight' };
const CAT_CLS = { voice: 'cat-voice', 'vibe-guard': 'cat-vg', beckyexists: 'cat-be', content: 'cat-note', 'iw-local': 'cat-local', biz: 'cat-biz', slight: 'cat-slight' };
const STATUS_LABEL = { pending: '未着手', in_progress: '進行中', waiting: '待ち', done: '完了' };
const STATUS_ORDER = { in_progress: 0, pending: 1, waiting: 2, done: 3 };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

let _taskActive = [];
let _taskDone = [];
let _sortCol = null;
let _sortDir = 1;      // 1=asc, -1=desc
let _openTask = null;  // コメントスレッドを開いているタスク id

let _comments = [];
let _localAlive = null; // null=未判定 / true=送信可 / false=閲覧のみ

const _today = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
const _fmtD = (s) => { if (!s) return '--'; const d = new Date(s); return isNaN(d) ? '--' : `${d.getMonth() + 1}/${d.getDate()}`; };
const _elapsedDays = (from) => { if (!from) return null; const f = new Date(from); f.setHours(0, 0, 0, 0); return Math.floor((_today - f) / 86400000); };
const _dueDays = (due) => { if (!due) return null; const d = new Date(due); d.setHours(0, 0, 0, 0); return Math.round((d - _today) / 86400000); };
const _dueCls = (days) => days === null ? '' : days <= 1 ? 'hot' : days <= 7 ? 'warm' : 'cool';

// ── コメント（閲覧は公開 JSON、送信は localhost:9001 のみ） ──
async function initComments() {
  const pub = await fetchJson('task_comments.json');
  _comments = pub?.comments || [];
  try {
    const r = await fetch('http://localhost:9001/task_comments', { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      const d = await r.json();
      _comments = Array.isArray(d) ? d : (d.comments || _comments);
      _localAlive = true;
    } else {
      _localAlive = false;
    }
  } catch { _localAlive = false; }
}

function commentsFor(id) {
  return _comments.filter(c => c.task_id === id).sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
}

function threadHTML(id) {
  const list = commentsFor(id);
  const items = list.length ? list.map(c => {
    const who = c.from === 'becky' ? '💬 ' : '';
    const d = new Date(c.ts);
    const ts = isNaN(d) ? '' : d.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `<div class="memo-item ${c.read ? '' : 'unread'}"><div style="flex:1"><div class="memo-text">${who}${esc(c.text)}</div><div class="memo-ts">${ts}</div></div></div>`;
  }).join('') : '<div class="empty" style="padding:8px 6px">まだコメントなし</div>';

  const canSend = _localAlive !== false;
  const form = `<div class="memo-form">
      <textarea class="memo-input" id="ci-${id}" rows="1" placeholder="${canSend ? 'ベキたんへコメント…' : 'ローカルでのみ送信可'}" ${canSend ? '' : 'disabled'}></textarea>
      <button class="memo-send" ${canSend ? `onclick="sendTaskComment('${id}')"` : 'disabled style="opacity:.4;cursor:not-allowed"'}>送る</button>
    </div>` + (canSend ? '' : '<div class="thread-offline"><svg data-lucide="lock"></svg>health_server 未接続 — 送信はゆうの Mac ローカルのみ（閲覧は可）</div>');

  return `<div class="comment-thread"><div class="memo-list">${items}</div>${form}</div>`;
}

async function sendTaskComment(id) {
  const ta = document.getElementById('ci-' + id);
  if (!ta) return;
  const text = ta.value.trim();
  if (!text) return;
  try {
    const r = await fetch('http://localhost:9001/task_comment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: id, text }),
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) throw new Error(r.status);
    ta.value = '';
    await initComments();
    renderTaskTable();
  } catch (e) {
    _localAlive = false;
    renderTaskTable();
  }
}

// ── ソート ──
function sortTaskList(tasks) {
  if (!_sortCol) {
    return [...tasks].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
  }
  return [...tasks].sort((a, b) => {
    if (_sortCol === 'label') return _sortDir * (a.label || '').localeCompare(b.label || '', 'ja');
    if (_sortCol === 'status') return _sortDir * ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
    if (_sortCol === 'due') return _sortDir * ((a.due || '9999').localeCompare(b.due || '9999'));
    if (_sortCol === 'updated') return _sortDir * ((a.updated_at || '').localeCompare(b.updated_at || ''));
    if (_sortCol === 'elapsed') return _sortDir * ((_elapsedDays(a.updated_at) ?? -1) - (_elapsedDays(b.updated_at) ?? -1));
    return 0;
  });
}

function doSort(col) {
  if (_sortCol === col) { _sortDir = -_sortDir; }
  else { _sortCol = col; _sortDir = 1; }
  renderTaskTable();
}

function toggleThread(id) {
  _openTask = _openTask === id ? null : id;
  renderTaskTable();
}

function taskRowHTML(t) {
  const days = _elapsedDays(t.updated_at);
  const warn = days !== null && days >= 7 && t.status !== 'done' && t.status !== 'waiting';
  const waitWarn = t.status === 'waiting' && days !== null && days >= 14;
  const isWarn = warn || waitWarn;
  const tag = CAT_TAG[t.category] || '';
  const tagHtml = tag ? `<span class="tbl-cat-tag ${CAT_CLS[t.category] || ''}">[${tag}]</span>` : '';
  const dd = _dueDays(t.due);
  const dueHtml = t.due ? `<span class="tbl-due ${_dueCls(dd)}">${_fmtD(t.due)}</span>` : '<span style="color:var(--sub2)">--</span>';
  const cCount = commentsFor(t.id).length;
  const cBadge = cCount ? `<span class="c-count">${cCount}</span>` : '';
  const open = _openTask === t.id;

  let html = `<tr class="task-row-main ${open ? 'open' : ''}" onclick="toggleThread('${t.id}')">
      <td><div class="tbl-name"><span class="tbl-icon">${t.icon || '○'}</span>${tagHtml}<span>${esc(t.label)}</span><span class="tbl-scope ${t.scope || 'iw'}">${(t.scope || 'iw').toUpperCase()}</span>${cBadge}</div></td>
      <td><span class="tbl-status-badge ${t.status}">${STATUS_LABEL[t.status] || t.status}</span></td>
      <td class="tbl-date">${dueHtml}</td>
      <td class="tbl-date">${_fmtD(t.updated_at)}</td>
      <td class="tbl-elapsed ${isWarn ? 'warn' : 'ok'}">${days !== null ? days + '日' : '--'}</td>
      <td class="tbl-note">${esc(t.note || '')}</td>
    </tr>`;
  if (open) html += `<tr class="thread-tr"><td colspan="6">${threadHTML(t.id)}</td></tr>`;
  return html;
}

// タスク表を IW / WO / BE の3グループに分けて並べる（2026-07-10 ゆうFB）
// BE = ベッキー個人の発信活動全般（作戦本部・Voice of Becky・note連載・Kindle本）
const BE_CATEGORIES = ['beckyexists', 'becky', 'voice-of-becky', 'voice', 'content'];
const TASK_GROUPS = [
  { key: 'iw', label: 'IW', match: t => (t.scope || 'iw') === 'iw' && !BE_CATEGORIES.includes(t.category) },
  { key: 'wo', label: 'WO', match: t => (t.scope || 'iw') === 'wo' },
  { key: 'be', label: 'BE', match: t => BE_CATEGORIES.includes(t.category) },
];

function renderTaskTable() {
  const ind = (col) => _sortCol !== col ? '' : (_sortDir === 1 ? ' asc' : ' desc');
  const head = `<thead><tr>
        <th class="sortable" onclick="doSort('label')">タスク<span class="sort-ind${ind('label')}"></span></th>
        <th class="sortable" onclick="doSort('status')">状態<span class="sort-ind${ind('status')}"></span></th>
        <th class="sortable" onclick="doSort('due')">期限<span class="sort-ind${ind('due')}"></span></th>
        <th class="sortable" onclick="doSort('updated')">更新<span class="sort-ind${ind('updated')}"></span></th>
        <th class="sortable" onclick="doSort('elapsed')">経過<span class="sort-ind${ind('elapsed')}"></span></th>
        <th>備考 / クリックでコメント</th>
      </tr></thead>`;
  $('taskTable').innerHTML = TASK_GROUPS.map(g => {
    const tasks = _taskActive.filter(g.match);
    if (!tasks.length) return '';
    const sorted = sortTaskList(tasks);
    return `<div class="task-group">
      <div class="task-group-h">${g.label}<span class="task-group-count">${tasks.length}</span></div>
      <div style="overflow-x:auto"><table class="task-tbl">${head}<tbody>${sorted.map(taskRowHTML).join('')}</tbody></table></div>
    </div>`;
  }).join('');
  if (window.lucide) lucide.createIcons();
}

// ── 🎯 長期目標ピン留め帯（due が今日 +30 日超の active タスク） ──
function renderGoalBand(active) {
  const el = $('goalBand');
  if (!el) return;
  const goals = active
    .filter(t => { const d = _dueDays(t.due); return d !== null && d > 30; })
    .sort((a, b) => _dueDays(a.due) - _dueDays(b.due));
  if (!goals.length) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = goals.map(t => {
    const d = _dueDays(t.due);
    return `<div class="goal-chip"><span class="goal-icon">${t.icon || '🎯'}</span><span class="goal-label">${esc(t.label)}</span><span class="goal-days">あと ${d}日</span></div>`;
  }).join('');
}

// ── 完了ログ（completed_at 降順） ──
function renderDoneLog(done) {
  const el = $('doneLogList');
  if (!el) return;
  const sorted = [...done].sort((a, b) => (b.completed_at || b.updated_at || '').localeCompare(a.completed_at || a.updated_at || ''));
  const cnt = $('doneLogCount');
  if (cnt) cnt.textContent = sorted.length;
  el.innerHTML = sorted.map(t => {
    const cd = t.completed_at || t.updated_at;
    return `<div class="done-row"><span class="done-date">${_fmtD(cd)}</span><span class="tbl-scope ${t.scope || 'iw'}">${(t.scope || 'iw').toUpperCase()}</span><span class="done-label" title="${esc(t.label)}">${esc(t.label)}</span></div>`;
  }).join('') || '<div class="empty">完了タスクなし</div>';
}

async function loadTasks() {
  const data = await fetchJson('tasks.json');
  if (!data?.tasks?.length) { $('taskTable').innerHTML = '<div class="empty">タスクなし</div>'; return; }
  _taskActive = data.tasks.filter(t => t.status !== 'done');
  _taskDone = data.tasks.filter(t => t.status === 'done');
  const upd = data.updated_at ? new Date(data.updated_at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const meta = $('taskMeta');
  if (meta) meta.textContent = `残 ${_taskActive.length} / 全 ${data.tasks.length} タスク — ${upd} 更新`;
  renderGoalBand(_taskActive);
  renderTaskTable();
  renderDoneLog(_taskDone);
}

// room.html の startRoom から呼ぶ。コメントを先に読んでからタスク表を描く。
function bootTasks() {
  initComments().then(loadTasks);
  setInterval(() => initComments().then(loadTasks), 300000);
}
