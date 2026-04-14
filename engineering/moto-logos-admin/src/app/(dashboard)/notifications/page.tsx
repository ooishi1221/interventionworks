'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/components/auth-provider';

/* ─── Types ─── */
interface Announcement {
  id: string;
  title: string;
  body: string;
  sortOrder: number | null;
  createdAt: string;
}

interface Template {
  id: string;
  name: string;
  title: string;
  body: string;
  category: string;
  createdAt: string;
}

interface ScheduledNotification {
  id: string;
  templateId: string | null;
  title: string;
  body: string;
  scheduledAt: string;
  status: 'pending' | 'sent' | 'cancelled';
  targetType: 'all' | 'segment';
  targetGeohash: string | null;
  createdAt: string;
  createdBy: string;
}

type Tab = 'announcements' | 'push' | 'templates' | 'scheduled';

const TEMPLATE_CATEGORIES = [
  { value: '', label: 'カテゴリなし' },
  { value: 'maintenance', label: 'メンテナンス' },
  { value: 'campaign', label: 'キャンペーン' },
  { value: 'update', label: 'アップデート' },
  { value: 'event', label: 'イベント' },
  { value: 'other', label: 'その他' },
];

/* ─── Main ─── */
export default function NotificationsPage() {
  const { user } = useAuth();
  const canSend = user?.role === 'super_admin' || user?.role === 'moderator';

  const [activeTab, setActiveTab] = useState<Tab>('announcements');

  /* ══════════════════════════════════════════════════════
   * お知らせ一覧
   * ══════════════════════════════════════════════════════ */
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/announcements');
      if (res.ok) {
        const data = await res.json();
        setItems(data.announcements ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  /* ── 新規投稿 ── */
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSending, setAnnSending] = useState(false);
  const [annResult, setAnnResult] = useState<string | null>(null);

  const handlePost = async () => {
    if (!annTitle.trim() || !annBody.trim()) return;
    setAnnSending(true);
    setAnnResult(null);
    const res = await fetch('/api/announcements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: annTitle.trim(), body: annBody.trim() }),
    });
    setAnnSending(false);
    if (res.ok) {
      setAnnResult('投稿しました');
      setAnnTitle('');
      setAnnBody('');
      fetchItems();
    } else {
      const d = await res.json();
      setAnnResult(`エラー: ${d.error}`);
    }
  };

  /* ── 編集モード ── */
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const startEdit = (item: Announcement) => {
    setEditId(item.id);
    setEditTitle(item.title);
    setEditBody(item.body);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditTitle('');
    setEditBody('');
  };

  const saveEdit = async () => {
    if (!editId || !editTitle.trim() || !editBody.trim()) return;
    setEditSaving(true);
    const res = await fetch(`/api/announcements/${editId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editTitle.trim(), body: editBody.trim() }),
    });
    setEditSaving(false);
    if (res.ok) {
      cancelEdit();
      fetchItems();
    } else {
      const d = await res.json().catch(() => null);
      alert(`保存に失敗しました（${res.status}: ${d?.error ?? '不明なエラー'}）`);
    }
  };

  /* ── 削除 ── */
  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`「${title}」を削除しますか？`)) return;
    const res = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchItems();
    } else {
      alert('削除に失敗しました');
    }
  };

  /* ── 並び替え ── */
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const a = items[index];
    const b = items[swapIdx];

    const aOrder = index;
    const bOrder = swapIdx;

    const next = [...items];
    next[index] = b;
    next[swapIdx] = a;
    setItems(next);

    await Promise.all([
      fetch(`/api/announcements/${a.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: bOrder }),
      }),
      fetch(`/api/announcements/${b.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: aOrder }),
      }),
    ]);
  };

  /* ══════════════════════════════════════════════════════
   * テンプレート管理
   * ══════════════════════════════════════════════════════ */
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplLoading, setTplLoading] = useState(false);

  const fetchTemplates = useCallback(async () => {
    setTplLoading(true);
    try {
      const res = await fetch('/api/notifications/templates');
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates ?? []);
      }
    } finally {
      setTplLoading(false);
    }
  }, []);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  // 新規テンプレート
  const [tplName, setTplName] = useState('');
  const [tplTitle, setTplTitle] = useState('');
  const [tplBody, setTplBody] = useState('');
  const [tplCategory, setTplCategory] = useState('');
  const [tplSaving, setTplSaving] = useState(false);
  const [tplResult, setTplResult] = useState<string | null>(null);

  const handleCreateTemplate = async () => {
    if (!tplName.trim() || !tplTitle.trim() || !tplBody.trim()) return;
    setTplSaving(true);
    setTplResult(null);
    const res = await fetch('/api/notifications/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tplName.trim(), title: tplTitle.trim(), body: tplBody.trim(), category: tplCategory }),
    });
    setTplSaving(false);
    if (res.ok) {
      setTplResult('テンプレートを作成しました');
      setTplName(''); setTplTitle(''); setTplBody(''); setTplCategory('');
      fetchTemplates();
    } else {
      const d = await res.json();
      setTplResult(`エラー: ${d.error}`);
    }
  };

  // テンプレート編集
  const [tplEditId, setTplEditId] = useState<string | null>(null);
  const [tplEditName, setTplEditName] = useState('');
  const [tplEditTitle, setTplEditTitle] = useState('');
  const [tplEditBody, setTplEditBody] = useState('');
  const [tplEditCategory, setTplEditCategory] = useState('');
  const [tplEditSaving, setTplEditSaving] = useState(false);

  const startTplEdit = (t: Template) => {
    setTplEditId(t.id);
    setTplEditName(t.name);
    setTplEditTitle(t.title);
    setTplEditBody(t.body);
    setTplEditCategory(t.category);
  };

  const cancelTplEdit = () => {
    setTplEditId(null);
    setTplEditName(''); setTplEditTitle(''); setTplEditBody(''); setTplEditCategory('');
  };

  const saveTplEdit = async () => {
    if (!tplEditId || !tplEditName.trim() || !tplEditTitle.trim() || !tplEditBody.trim()) return;
    setTplEditSaving(true);
    const res = await fetch(`/api/notifications/templates/${tplEditId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tplEditName.trim(), title: tplEditTitle.trim(), body: tplEditBody.trim(), category: tplEditCategory }),
    });
    setTplEditSaving(false);
    if (res.ok) {
      cancelTplEdit();
      fetchTemplates();
    } else {
      const d = await res.json().catch(() => null);
      alert(`保存に失敗しました（${res.status}: ${d?.error ?? '不明なエラー'}）`);
    }
  };

  const handleDeleteTemplate = async (id: string, name: string) => {
    if (!confirm(`テンプレート「${name}」を削除しますか？`)) return;
    const res = await fetch(`/api/notifications/templates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchTemplates();
    } else {
      alert('削除に失敗しました');
    }
  };

  /* ══════════════════════════════════════════════════════
   * 予約配信
   * ══════════════════════════════════════════════════════ */
  const [scheduled, setScheduled] = useState<ScheduledNotification[]>([]);
  const [schedLoading, setSchedLoading] = useState(false);

  const fetchScheduled = useCallback(async () => {
    setSchedLoading(true);
    try {
      const res = await fetch('/api/notifications/schedule');
      if (res.ok) {
        const data = await res.json();
        setScheduled(data.items ?? []);
      }
    } finally {
      setSchedLoading(false);
    }
  }, []);

  useEffect(() => { fetchScheduled(); }, [fetchScheduled]);

  // 新規予約
  const [schedTemplateId, setSchedTemplateId] = useState('');
  const [schedTitle, setSchedTitle] = useState('');
  const [schedBody, setSchedBody] = useState('');
  const [schedAt, setSchedAt] = useState('');
  const [schedTargetType, setSchedTargetType] = useState<'all' | 'segment'>('all');
  const [schedGeohash, setSchedGeohash] = useState('');
  const [schedSaving, setSchedSaving] = useState(false);
  const [schedResult, setSchedResult] = useState<string | null>(null);

  // テンプレート選択時に自動反映
  const handleSchedTemplateChange = (templateId: string) => {
    setSchedTemplateId(templateId);
    if (templateId) {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl) {
        setSchedTitle(tpl.title);
        setSchedBody(tpl.body);
      }
    }
  };

  const handleCreateScheduled = async () => {
    if (!schedTitle.trim() || !schedBody.trim() || !schedAt) {
      alert('タイトル、本文、送信日時は必須です');
      return;
    }
    setSchedSaving(true);
    setSchedResult(null);
    const res = await fetch('/api/notifications/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: schedTemplateId || undefined,
        title: schedTitle.trim(),
        body: schedBody.trim(),
        scheduledAt: new Date(schedAt).toISOString(),
        targetType: schedTargetType,
        ...(schedTargetType === 'segment' && { targetGeohash: schedGeohash.trim() }),
      }),
    });
    setSchedSaving(false);
    if (res.ok) {
      setSchedResult('予約配信を登録しました');
      setSchedTemplateId(''); setSchedTitle(''); setSchedBody(''); setSchedAt('');
      setSchedTargetType('all'); setSchedGeohash('');
      fetchScheduled();
    } else {
      const d = await res.json();
      setSchedResult(`エラー: ${d.error}`);
    }
  };

  const handleCancelScheduled = async (id: string, title: string) => {
    if (!confirm(`「${title}」の予約配信をキャンセルしますか？`)) return;
    const res = await fetch(`/api/notifications/schedule/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    if (res.ok) {
      fetchScheduled();
    } else {
      const d = await res.json().catch(() => null);
      alert(`キャンセルに失敗しました（${d?.error ?? '不明なエラー'}）`);
    }
  };

  const handleDeleteScheduled = async (id: string, title: string) => {
    if (!confirm(`「${title}」の予約配信を削除しますか？`)) return;
    const res = await fetch(`/api/notifications/schedule/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchScheduled();
    } else {
      alert('削除に失敗しました');
    }
  };

  /* ══════════════════════════════════════════════════════
   * Broadcast（テンプレート選択対応）
   * ══════════════════════════════════════════════════════ */
  const [broadcastTemplateId, setBroadcastTemplateId] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastPlatform, setBroadcastPlatform] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  const handleBroadcastTemplateChange = (templateId: string) => {
    setBroadcastTemplateId(templateId);
    if (templateId) {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl) {
        setBroadcastTitle(tpl.title);
        setBroadcastBody(tpl.body);
      }
    }
  };

  const handleBroadcast = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      alert('タイトルと本文を入力してください');
      return;
    }
    if (!confirm(`全ユーザーに通知を送信します。よろしいですか？\n\nタイトル: ${broadcastTitle}\n本文: ${broadcastBody}`)) return;

    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      const res = await fetch('/api/notifications/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: broadcastTitle.trim(),
          body: broadcastBody.trim(),
          ...(broadcastPlatform && { platform: broadcastPlatform }),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setBroadcastResult(`送信完了: ${data.sentCount}件成功 / ${data.errorCount}件失敗 (対象: ${data.totalTokens}件)`);
        setBroadcastTitle('');
        setBroadcastBody('');
        setBroadcastTemplateId('');
      } else {
        setBroadcastResult(`エラー: ${data.error}`);
      }
    } finally {
      setBroadcastSending(false);
    }
  };

  /* ── Segment（テンプレート選択対応） ── */
  const [segTemplateId, setSegTemplateId] = useState('');
  const [segTitle, setSegTitle] = useState('');
  const [segBody, setSegBody] = useState('');
  const [segGeohash, setSegGeohash] = useState('');
  const [segSending, setSegSending] = useState(false);
  const [segResult, setSegResult] = useState<string | null>(null);

  const handleSegTemplateChange = (templateId: string) => {
    setSegTemplateId(templateId);
    if (templateId) {
      const tpl = templates.find((t) => t.id === templateId);
      if (tpl) {
        setSegTitle(tpl.title);
        setSegBody(tpl.body);
      }
    }
  };

  const handleSegment = async () => {
    if (!segTitle.trim() || !segBody.trim() || !segGeohash.trim()) {
      alert('タイトル、本文、geohashプレフィクスを入力してください');
      return;
    }
    setSegSending(true);
    setSegResult(null);
    try {
      const res = await fetch('/api/notifications/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: segTitle.trim(),
          body: segBody.trim(),
          geohashPrefix: segGeohash.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSegResult(`送信完了: エリア内${data.spotsInArea}スポット / ${data.uniqueUsers}ユーザー / ${data.sentCount}件成功`);
        setSegTitle('');
        setSegBody('');
        setSegGeohash('');
        setSegTemplateId('');
      } else {
        setSegResult(`エラー: ${data.error}`);
      }
    } finally {
      setSegSending(false);
    }
  };

  /* ── ヘルパー ── */
  function fmtDate(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function statusBadge(status: string) {
    switch (status) {
      case 'pending':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-fresh-yellow/20 text-fresh-yellow">待機中</span>;
      case 'sent':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-success/20 text-success">送信済</span>;
      case 'cancelled':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-text-secondary/20 text-text-secondary">キャンセル</span>;
      default:
        return <span className="text-xs px-2 py-0.5 rounded-full bg-card text-text-secondary">{status}</span>;
    }
  }

  function categoryLabel(cat: string) {
    const found = TEMPLATE_CATEGORIES.find((c) => c.value === cat);
    return found?.label || cat || '-';
  }

  if (!canSend) {
    return <div className="text-center py-12 text-text-secondary">通知の送信権限がありません</div>;
  }

  /* ══════════════════════════════════════════════════════
   * テンプレート選択コンポーネント
   * ══════════════════════════════════════════════════════ */
  const TemplateSelect = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (id: string) => void;
  }) => (
    <div className="mb-3">
      <label className="block text-sm text-text-secondary mb-1">テンプレートから入力</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
      >
        <option value="">-- テンプレートを選択 --</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}{t.category ? ` [${categoryLabel(t.category)}]` : ''}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">通知管理</h1>

      {/* ── タブ ── */}
      <div className="flex gap-1 mb-6 bg-surface border border-border rounded-lg p-1 w-fit">
        {([
          { key: 'announcements' as Tab, label: 'お知らせ' },
          { key: 'push' as Tab, label: 'プッシュ通知' },
          { key: 'templates' as Tab, label: 'テンプレート' },
          { key: 'scheduled' as Tab, label: '予約配信' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === tab.key
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-foreground hover:bg-card'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════
       * TAB: お知らせ
       * ══════════════════════════════════════════════════════ */}
      {activeTab === 'announcements' && (
        <>
          {/* お知らせ投稿 */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-6">
            <h2 className="text-base font-bold mb-2">お知らせ投稿</h2>
            <p className="text-xs text-text-secondary mb-4">
              アプリ内の「お知らせ」画面に表示されます（プッシュ通知とは別）。改行はそのままアプリに反映されます。
            </p>
            <div className="grid gap-3">
              <input
                value={annTitle}
                onChange={(e) => setAnnTitle(e.target.value)}
                placeholder="タイトル"
                className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
              />
              <textarea
                value={annBody}
                onChange={(e) => setAnnBody(e.target.value)}
                placeholder="本文（改行OK）"
                rows={6}
                className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-y focus:outline-none focus:border-accent leading-relaxed"
              />
              {annBody.trim() && (
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="text-xs text-text-secondary mb-2">プレビュー（アプリ表示イメージ）</p>
                  {annTitle.trim() && <p className="text-sm font-bold text-foreground mb-1">{annTitle}</p>}
                  <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">{annBody}</p>
                </div>
              )}
              <button
                onClick={handlePost}
                disabled={annSending || !annTitle.trim() || !annBody.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors w-fit"
              >
                {annSending ? '投稿中...' : '投稿'}
              </button>
            </div>
            {annResult && (
              <p className={`mt-2 text-xs ${annResult.startsWith('エラー') ? 'text-fresh-red' : 'text-success'}`}>{annResult}</p>
            )}
          </div>

          {/* お知らせ一覧 */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h2 className="text-base font-bold mb-4">お知らせ一覧</h2>
            {loading ? (
              <p className="text-text-secondary text-sm">読み込み中...</p>
            ) : items.length === 0 ? (
              <p className="text-text-secondary text-sm">お知らせはありません</p>
            ) : (
              <div className="flex flex-col gap-3">
                {items.map((item, idx) =>
                  editId === item.id ? (
                    <div key={item.id} className="bg-card border-2 border-accent rounded-lg p-4">
                      <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent mb-2"
                      />
                      <textarea
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={6}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground resize-y focus:outline-none focus:border-accent leading-relaxed mb-2"
                      />
                      {editBody.trim() && (
                        <div className="bg-surface border border-border rounded-lg p-3 mb-2">
                          <p className="text-xs text-text-secondary mb-1">プレビュー</p>
                          {editTitle.trim() && <p className="text-sm font-bold text-foreground mb-1">{editTitle}</p>}
                          <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed">{editBody}</p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={editSaving || !editTitle.trim() || !editBody.trim()}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
                        >
                          {editSaving ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface border border-border text-text-secondary hover:text-foreground transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={item.id} className="bg-card border border-border rounded-lg p-4 group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground mb-1">{item.title}</p>
                          <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed mb-2">{item.body}</p>
                          <p className="text-[11px] text-text-secondary">{fmtDate(item.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleMove(idx, 'up')}
                            disabled={idx === 0}
                            className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-foreground disabled:opacity-30 transition-colors"
                            title="上に移動"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
                          </button>
                          <button
                            onClick={() => handleMove(idx, 'down')}
                            disabled={idx === items.length - 1}
                            className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-foreground disabled:opacity-30 transition-colors"
                            title="下に移動"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
                          </button>
                          <button
                            onClick={() => startEdit(item)}
                            className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-foreground transition-colors"
                            title="編集"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                          <button
                            onClick={() => handleDelete(item.id, item.title)}
                            className="p-1.5 rounded-md hover:bg-fresh-red/20 text-text-secondary hover:text-fresh-red transition-colors"
                            title="削除"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
       * TAB: プッシュ通知（一斉 + エリア別）
       * ══════════════════════════════════════════════════════ */}
      {activeTab === 'push' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* 一斉通知 */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h2 className="text-base font-bold mb-4">一斉通知</h2>
            <p className="text-xs text-text-secondary mb-4">全ユーザーにプッシュ通知を送信します（メンテナンス・重要告知用）</p>

            <TemplateSelect value={broadcastTemplateId} onChange={handleBroadcastTemplateChange} />

            <label className="block text-sm text-text-secondary mb-1">タイトル</label>
            <input
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder="例: メンテナンスのお知らせ"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent mb-3"
            />

            <label className="block text-sm text-text-secondary mb-1">本文</label>
            <textarea
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="通知本文..."
              rows={3}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent mb-3"
            />

            <label className="block text-sm text-text-secondary mb-1">プラットフォーム（任意）</label>
            <select
              value={broadcastPlatform}
              onChange={(e) => setBroadcastPlatform(e.target.value)}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground mb-4"
            >
              <option value="">全プラットフォーム</option>
              <option value="ios">iOS のみ</option>
              <option value="android">Android のみ</option>
            </select>

            <button
              onClick={handleBroadcast}
              disabled={broadcastSending}
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
            >
              {broadcastSending ? '送信中...' : '一斉送信'}
            </button>

            {broadcastResult && (
              <p className={`mt-3 text-xs ${broadcastResult.startsWith('エラー') ? 'text-fresh-red' : 'text-success'}`}>
                {broadcastResult}
              </p>
            )}
          </div>

          {/* エリア別セグメント通知 */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h2 className="text-base font-bold mb-4">エリア別通知</h2>
            <p className="text-xs text-text-secondary mb-4">指定エリアのスポット投稿者・レビュー投稿者に通知（新スポット追加告知等）</p>

            <TemplateSelect value={segTemplateId} onChange={handleSegTemplateChange} />

            <label className="block text-sm text-text-secondary mb-1">タイトル</label>
            <input
              value={segTitle}
              onChange={(e) => setSegTitle(e.target.value)}
              placeholder="例: 新スポットが追加されました"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent mb-3"
            />

            <label className="block text-sm text-text-secondary mb-1">本文</label>
            <textarea
              value={segBody}
              onChange={(e) => setSegBody(e.target.value)}
              placeholder="通知本文..."
              rows={3}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent mb-3"
            />

            <label className="block text-sm text-text-secondary mb-1">geohash プレフィクス（2〜6文字）</label>
            <input
              value={segGeohash}
              onChange={(e) => setSegGeohash(e.target.value)}
              placeholder="例: xn76 (東京都足立区周辺)"
              maxLength={6}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:border-accent mb-4"
            />

            <button
              onClick={handleSegment}
              disabled={segSending}
              className="w-full py-2.5 text-sm font-medium rounded-lg bg-fresh-blue text-white hover:bg-fresh-blue/80 disabled:opacity-50 transition-colors"
            >
              {segSending ? '送信中...' : 'エリア別送信'}
            </button>

            {segResult && (
              <p className={`mt-3 text-xs ${segResult.startsWith('エラー') ? 'text-fresh-red' : 'text-success'}`}>
                {segResult}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
       * TAB: テンプレート管理
       * ══════════════════════════════════════════════════════ */}
      {activeTab === 'templates' && (
        <>
          {/* テンプレート作成 */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-6">
            <h2 className="text-base font-bold mb-2">テンプレート作成</h2>
            <p className="text-xs text-text-secondary mb-4">
              よく使う通知内容をテンプレートとして保存し、一斉通知・エリア別通知・予約配信で再利用できます。
            </p>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">テンプレート名（管理用）</label>
                  <input
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="例: 定期メンテナンス通知"
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">カテゴリ</label>
                  <select
                    value={tplCategory}
                    onChange={(e) => setTplCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
                  >
                    {TEMPLATE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">通知タイトル</label>
                <input
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  placeholder="例: メンテナンスのお知らせ"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-sm text-text-secondary mb-1">通知本文</label>
                <textarea
                  value={tplBody}
                  onChange={(e) => setTplBody(e.target.value)}
                  placeholder="通知本文..."
                  rows={3}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent"
                />
              </div>
              <button
                onClick={handleCreateTemplate}
                disabled={tplSaving || !tplName.trim() || !tplTitle.trim() || !tplBody.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors w-fit"
              >
                {tplSaving ? '保存中...' : 'テンプレート作成'}
              </button>
            </div>
            {tplResult && (
              <p className={`mt-2 text-xs ${tplResult.startsWith('エラー') ? 'text-fresh-red' : 'text-success'}`}>{tplResult}</p>
            )}
          </div>

          {/* テンプレート一覧 */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h2 className="text-base font-bold mb-4">テンプレート一覧</h2>
            {tplLoading ? (
              <p className="text-text-secondary text-sm">読み込み中...</p>
            ) : templates.length === 0 ? (
              <p className="text-text-secondary text-sm">テンプレートはありません</p>
            ) : (
              <div className="flex flex-col gap-3">
                {templates.map((t) =>
                  tplEditId === t.id ? (
                    <div key={t.id} className="bg-card border-2 border-accent rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-3 mb-2">
                        <input
                          value={tplEditName}
                          onChange={(e) => setTplEditName(e.target.value)}
                          placeholder="テンプレート名"
                          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
                        />
                        <select
                          value={tplEditCategory}
                          onChange={(e) => setTplEditCategory(e.target.value)}
                          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground"
                        >
                          {TEMPLATE_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <input
                        value={tplEditTitle}
                        onChange={(e) => setTplEditTitle(e.target.value)}
                        placeholder="通知タイトル"
                        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent mb-2"
                      />
                      <textarea
                        value={tplEditBody}
                        onChange={(e) => setTplEditBody(e.target.value)}
                        placeholder="通知本文"
                        rows={3}
                        className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent mb-2"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={saveTplEdit}
                          disabled={tplEditSaving || !tplEditName.trim() || !tplEditTitle.trim() || !tplEditBody.trim()}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
                        >
                          {tplEditSaving ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={cancelTplEdit}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface border border-border text-text-secondary hover:text-foreground transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div key={t.id} className="bg-card border border-border rounded-lg p-4 group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-sm font-bold text-foreground">{t.name}</p>
                            {t.category && (
                              <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                                {categoryLabel(t.category)}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-text-secondary mb-0.5">
                            <span className="text-foreground font-medium">タイトル:</span> {t.title}
                          </p>
                          <p className="text-xs text-text-secondary mb-1">
                            <span className="text-foreground font-medium">本文:</span> {t.body}
                          </p>
                          <p className="text-[11px] text-text-secondary">{fmtDate(t.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startTplEdit(t)}
                            className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-foreground transition-colors"
                            title="編集"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(t.id, t.name)}
                            className="p-1.5 rounded-md hover:bg-fresh-red/20 text-text-secondary hover:text-fresh-red transition-colors"
                            title="削除"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════
       * TAB: 予約配信
       * ══════════════════════════════════════════════════════ */}
      {activeTab === 'scheduled' && (
        <>
          {/* 予約作成 */}
          <div className="bg-surface border border-border rounded-xl p-6 mb-6">
            <h2 className="text-base font-bold mb-2">予約配信の作成</h2>
            <p className="text-xs text-text-secondary mb-4">
              指定した日時に自動でプッシュ通知を送信します。15分間隔でチェックされます。
            </p>
            <div className="grid gap-3">
              <TemplateSelect value={schedTemplateId} onChange={handleSchedTemplateChange} />

              <div>
                <label className="block text-sm text-text-secondary mb-1">タイトル</label>
                <input
                  value={schedTitle}
                  onChange={(e) => setSchedTitle(e.target.value)}
                  placeholder="通知タイトル"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">本文</label>
                <textarea
                  value={schedBody}
                  onChange={(e) => setSchedBody(e.target.value)}
                  placeholder="通知本文..."
                  rows={3}
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-text-secondary mb-1">送信予定日時</label>
                  <input
                    type="datetime-local"
                    value={schedAt}
                    onChange={(e) => setSchedAt(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-text-secondary mb-1">配信対象</label>
                  <select
                    value={schedTargetType}
                    onChange={(e) => setSchedTargetType(e.target.value as 'all' | 'segment')}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
                  >
                    <option value="all">全ユーザー</option>
                    <option value="segment">エリア別（geohash）</option>
                  </select>
                </div>
              </div>

              {schedTargetType === 'segment' && (
                <div>
                  <label className="block text-sm text-text-secondary mb-1">geohash プレフィクス（2〜6文字）</label>
                  <input
                    value={schedGeohash}
                    onChange={(e) => setSchedGeohash(e.target.value)}
                    placeholder="例: xn76"
                    maxLength={6}
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground font-mono focus:outline-none focus:border-accent"
                  />
                </div>
              )}

              <button
                onClick={handleCreateScheduled}
                disabled={schedSaving || !schedTitle.trim() || !schedBody.trim() || !schedAt}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors w-fit"
              >
                {schedSaving ? '登録中...' : '予約登録'}
              </button>
            </div>
            {schedResult && (
              <p className={`mt-2 text-xs ${schedResult.startsWith('エラー') ? 'text-fresh-red' : 'text-success'}`}>{schedResult}</p>
            )}
          </div>

          {/* 予約一覧 */}
          <div className="bg-surface border border-border rounded-xl p-6">
            <h2 className="text-base font-bold mb-4">予約配信一覧</h2>
            {schedLoading ? (
              <p className="text-text-secondary text-sm">読み込み中...</p>
            ) : scheduled.length === 0 ? (
              <p className="text-text-secondary text-sm">予約配信はありません</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-text-secondary text-left">
                      <th className="pb-2 pr-4 font-medium">ステータス</th>
                      <th className="pb-2 pr-4 font-medium">タイトル</th>
                      <th className="pb-2 pr-4 font-medium">配信対象</th>
                      <th className="pb-2 pr-4 font-medium">送信予定</th>
                      <th className="pb-2 pr-4 font-medium">作成者</th>
                      <th className="pb-2 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduled.map((s) => (
                      <tr key={s.id} className="border-b border-border/50 hover:bg-card/50">
                        <td className="py-3 pr-4">{statusBadge(s.status)}</td>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-foreground">{s.title}</p>
                          <p className="text-xs text-text-secondary mt-0.5 line-clamp-1">{s.body}</p>
                        </td>
                        <td className="py-3 pr-4 text-xs text-text-secondary">
                          {s.targetType === 'all' ? '全ユーザー' : `エリア: ${s.targetGeohash}`}
                        </td>
                        <td className="py-3 pr-4 text-xs text-text-secondary whitespace-nowrap">
                          {fmtDate(s.scheduledAt)}
                        </td>
                        <td className="py-3 pr-4 text-xs text-text-secondary">{s.createdBy}</td>
                        <td className="py-3">
                          <div className="flex gap-1">
                            {s.status === 'pending' && (
                              <button
                                onClick={() => handleCancelScheduled(s.id, s.title)}
                                className="px-2 py-1 text-xs rounded-md bg-fresh-yellow/10 text-fresh-yellow hover:bg-fresh-yellow/20 transition-colors"
                              >
                                キャンセル
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteScheduled(s.id, s.title)}
                              className="px-2 py-1 text-xs rounded-md bg-fresh-red/10 text-fresh-red hover:bg-fresh-red/20 transition-colors"
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
