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

/* ─── Main ─── */
export default function NotificationsPage() {
  const { user } = useAuth();
  const canSend = user?.role === 'super_admin' || user?.role === 'moderator';

  /* ── お知らせ一覧 ── */
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

    // sortOrder をスワップ
    const aOrder = index;
    const bOrder = swapIdx;

    // 楽観的UI更新
    const next = [...items];
    next[index] = b;
    next[swapIdx] = a;
    setItems(next);

    // Firestore 更新
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

  /* ── Broadcast ── */
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastPlatform, setBroadcastPlatform] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

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
      } else {
        setBroadcastResult(`エラー: ${data.error}`);
      }
    } finally {
      setBroadcastSending(false);
    }
  };

  /* ── Segment ── */
  const [segTitle, setSegTitle] = useState('');
  const [segBody, setSegBody] = useState('');
  const [segGeohash, setSegGeohash] = useState('');
  const [segSending, setSegSending] = useState(false);
  const [segResult, setSegResult] = useState<string | null>(null);

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
      } else {
        setSegResult(`エラー: ${data.error}`);
      }
    } finally {
      setSegSending(false);
    }
  };

  /* ── 日付フォーマット ── */
  function fmtDate(iso: string) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  if (!canSend) {
    return <div className="text-center py-12 text-text-secondary">通知の送信権限がありません</div>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">通知管理</h1>

      {/* ── お知らせ投稿 ── */}
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
          {/* プレビュー */}
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

      {/* ── お知らせ一覧 ── */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <h2 className="text-base font-bold mb-4">お知らせ一覧</h2>
        {loading ? (
          <p className="text-text-secondary text-sm">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="text-text-secondary text-sm">お知らせはありません</p>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map((item, idx) =>
              editId === item.id ? (
                /* 編集モード */
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
                  {/* 編集プレビュー */}
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
                /* 表示モード */
                <div key={item.id} className="bg-card border border-border rounded-lg p-4 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground mb-1">{item.title}</p>
                      <p className="text-xs text-text-secondary whitespace-pre-wrap leading-relaxed mb-2">{item.body}</p>
                      <p className="text-[11px] text-text-secondary">{fmtDate(item.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {/* 並び替え */}
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
                      {/* 編集 */}
                      <button
                        onClick={() => startEdit(item)}
                        className="p-1.5 rounded-md hover:bg-surface text-text-secondary hover:text-foreground transition-colors"
                        title="編集"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                      {/* 削除 */}
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

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 一斉通知 */}
        <div className="bg-surface border border-border rounded-xl p-6">
          <h2 className="text-base font-bold mb-4">一斉通知</h2>
          <p className="text-xs text-text-secondary mb-4">全ユーザーにプッシュ通知を送信します（メンテナンス・重要告知用）</p>

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
    </div>
  );
}
