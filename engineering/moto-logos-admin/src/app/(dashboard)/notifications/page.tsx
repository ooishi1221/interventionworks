'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';

export default function NotificationsPage() {
  const { user } = useAuth();
  const canSend = user?.role === 'super_admin' || user?.role === 'moderator';

  // Announcement (in-app)
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSending, setAnnSending] = useState(false);
  const [annResult, setAnnResult] = useState<string | null>(null);

  // Broadcast
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastPlatform, setBroadcastPlatform] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);

  // Segment
  const [segTitle, setSegTitle] = useState('');
  const [segBody, setSegBody] = useState('');
  const [segGeohash, setSegGeohash] = useState('');
  const [segSending, setSegSending] = useState(false);
  const [segResult, setSegResult] = useState<string | null>(null);

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

  if (!canSend) {
    return <div className="text-center py-12 text-text-secondary">通知の送信権限がありません</div>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">通知管理</h1>

      {/* お知らせ投稿（アプリ内表示） */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <h2 className="text-base font-bold mb-2">お知らせ投稿</h2>
        <p className="text-xs text-text-secondary mb-4">アプリ内の「お知らせ」画面に表示されます（プッシュ通知とは別）</p>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <input
            value={annTitle}
            onChange={(e) => setAnnTitle(e.target.value)}
            placeholder="タイトル"
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
          />
          <input
            value={annBody}
            onChange={(e) => setAnnBody(e.target.value)}
            placeholder="本文"
            className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent"
          />
          <button
            onClick={async () => {
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
                setAnnTitle(''); setAnnBody('');
              } else {
                const d = await res.json();
                setAnnResult(`エラー: ${d.error}`);
              }
            }}
            disabled={annSending || !annTitle.trim() || !annBody.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {annSending ? '投稿中...' : '投稿'}
          </button>
        </div>
        {annResult && (
          <p className={`mt-2 text-xs ${annResult.startsWith('エラー') ? 'text-fresh-red' : 'text-success'}`}>{annResult}</p>
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
