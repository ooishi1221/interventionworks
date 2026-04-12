'use client';

import { useAuth } from '@/components/auth-provider';
import { useCallback, useEffect, useState } from 'react';

interface PendingSpot {
  id: string;
  name: string;
  address?: string;
  source: 'seed' | 'user';
  goodCount: number;
  badReportCount: number;
  coordinate?: { latitude: number; longitude: number } | null;
  createdBy?: string;
  createdAt: string;
}

type ActionType = 'approve' | 'reject' | 'delete';

export default function ModerationPage() {
  const { user } = useAuth();
  const [spots, setSpots] = useState<PendingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [totalPending, setTotalPending] = useState<number | null>(null);

  const fetchSpots = useCallback(async (cursorId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'pending', limit: '20' });
      if (cursorId) params.set('cursor', cursorId);

      const res = await fetch(`/api/spots?${params}`);
      const data = await res.json();

      if (cursorId) {
        setSpots((prev) => [...prev, ...data.spots]);
      } else {
        setSpots(data.spots);
      }
      setCursor(data.nextCursor);
      setHasMore(!!data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch('/api/dashboard/stats');
    const data = await res.json();
    setTotalPending(data.pendingSpots);
  }, []);

  useEffect(() => {
    fetchSpots();
    fetchStats();
  }, [fetchSpots, fetchStats]);

  const handleAction = async (spotId: string, action: ActionType, reason?: string) => {
    setProcessing(spotId);
    try {
      const res = await fetch(`/api/spots/${spotId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      setSpots((prev) => prev.filter((s) => s.id !== spotId));
      setTotalPending((prev) => (prev !== null ? prev - 1 : null));
      setRejectTarget(null);
      setRejectReason('');
      setDeleteTarget(null);
    } finally {
      setProcessing(null);
    }
  };

  const isModerator = user?.role === 'moderator' || user?.role === 'super_admin';

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">モデレーションキュー</h1>
          <p className="text-text-secondary text-sm mt-1">
            承認待ちスポットの審査
          </p>
        </div>
        {totalPending !== null && (
          <div className="bg-card border border-border rounded-lg px-4 py-3 text-center">
            <div className="text-2xl font-bold text-fresh-yellow">{totalPending}</div>
            <div className="text-xs text-text-secondary">未処理</div>
          </div>
        )}
      </div>

      {/* Queue */}
      {spots.length === 0 && !loading ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="text-4xl mb-3">&#x2714;</div>
          <p className="text-text-secondary">承認待ちスポットはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {spots.map((spot) => (
            <div
              key={spot.id}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Spot info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{spot.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        spot.source === 'user'
                          ? 'bg-fresh-blue/15 text-fresh-blue'
                          : 'bg-text-secondary/15 text-text-secondary'
                      }`}
                    >
                      {spot.source === 'user' ? 'ユーザー投稿' : 'シード'}
                    </span>
                  </div>
                  {spot.address && (
                    <p className="text-sm text-text-secondary truncate">{spot.address}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-text-secondary">
                    <span>Good: {spot.goodCount}</span>
                    <span>Bad: {spot.badReportCount}</span>
                    {spot.coordinate && (
                      <a
                        href={`https://www.google.com/maps?q=${spot.coordinate.latitude},${spot.coordinate.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-fresh-blue hover:underline"
                      >
                        地図で確認
                      </a>
                    )}
                    <span>
                      投稿日: {new Date(spot.createdAt).toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {isModerator && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleAction(spot.id, 'approve')}
                      disabled={processing === spot.id}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
                    >
                      承認
                    </button>
                    <button
                      onClick={() => setRejectTarget(spot.id)}
                      disabled={processing === spot.id}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-danger/15 text-danger hover:bg-danger/25 disabled:opacity-50 transition-colors"
                    >
                      却下
                    </button>
                    <button
                      onClick={() => setDeleteTarget(spot.id)}
                      disabled={processing === spot.id}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-fresh-red/15 text-fresh-red hover:bg-fresh-red/25 disabled:opacity-50 transition-colors"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>

              {/* Reject reason form */}
              {rejectTarget === spot.id && (
                <div className="mt-3 pt-3 border-t border-border">
                  <label className="block text-sm text-text-secondary mb-1">
                    却下理由（必須）
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="例: 情報が不正確、重複スポット..."
                      className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => handleAction(spot.id, 'reject', rejectReason)}
                      disabled={!rejectReason.trim() || processing === spot.id}
                      className="px-3 py-1.5 text-sm font-medium rounded-md bg-danger text-white hover:bg-danger/80 disabled:opacity-50 transition-colors"
                    >
                      確定
                    </button>
                    <button
                      onClick={() => {
                        setRejectTarget(null);
                        setRejectReason('');
                      }}
                      className="px-3 py-1.5 text-sm rounded-md text-text-secondary hover:text-foreground transition-colors"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* Delete confirmation */}
              {deleteTarget === spot.id && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-fresh-red">
                      このスポットを完全に削除しますか？この操作は取り消せません。
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(spot.id, 'delete')}
                        disabled={processing === spot.id}
                        className="px-3 py-1.5 text-sm font-medium rounded-md bg-fresh-red text-white hover:bg-fresh-red/80 disabled:opacity-50 transition-colors"
                      >
                        削除する
                      </button>
                      <button
                        onClick={() => setDeleteTarget(null)}
                        className="px-3 py-1.5 text-sm rounded-md text-text-secondary hover:text-foreground transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => cursor && fetchSpots(cursor)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-card border border-border rounded-lg hover:bg-surface disabled:opacity-50 transition-colors"
          >
            {loading ? '読み込み中...' : 'もっと読み込む'}
          </button>
        </div>
      )}

      {loading && spots.length === 0 && (
        <div className="text-center py-12 text-text-secondary">読み込み中...</div>
      )}
    </div>
  );
}
