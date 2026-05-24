'use client';

import { useAuth } from '@/components/auth-provider';
import { useCallback, useEffect, useState } from 'react';
import type {
  BetaFeedbackResponse,
  BetaFeedbackStatus,
  BetaFeedbackType,
} from '@/lib/types';

const STATUS_CONFIG: Record<
  BetaFeedbackStatus,
  { label: string; className: string }
> = {
  open: { label: '未対応', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
  in_progress: {
    label: '対応中',
    className: 'bg-fresh-blue/20 text-fresh-blue',
  },
  resolved: { label: '完了', className: 'bg-success/20 text-success' },
};

const TYPE_CONFIG: Record<BetaFeedbackType, { label: string; className: string }> = {
  bug: { label: 'バグ', className: 'bg-danger/20 text-danger' },
  opinion: { label: '意見', className: 'bg-accent/20 text-accent' },
  confused: { label: '困った', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
};

export default function BetaFeedbackPage() {
  const { user } = useAuth();
  const [feedbacks, setFeedbacks] = useState<BetaFeedbackResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BetaFeedbackStatus | ''>('open');
  const [typeFilter, setTypeFilter] = useState<BetaFeedbackType | ''>('');
  const [processing, setProcessing] = useState<string | null>(null);

  const isModerator =
    user?.role === 'moderator' || user?.role === 'super_admin';

  const fetchFeedbacks = useCallback(
    async (cursorId?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (statusFilter) params.set('status', statusFilter);
        if (typeFilter) params.set('type', typeFilter);
        if (cursorId) params.set('cursor', cursorId);

        const res = await fetch(`/api/beta-feedback?${params}`);
        const data = await res.json();

        if (cursorId) {
          setFeedbacks((prev) => [...prev, ...data.feedbacks]);
        } else {
          setFeedbacks(data.feedbacks);
        }
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, typeFilter]
  );

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const handleStatusChange = async (
    id: string,
    newStatus: BetaFeedbackStatus
  ) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/beta-feedback/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      setFeedbacks((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: newStatus } : f))
      );
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">βフィードバック</h1>
          <p className="text-text-secondary text-sm mt-1">
            βテスターからのフィードバックを管理
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as BetaFeedbackStatus | '')
          }
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全ステータス</option>
          <option value="open">未対応</option>
          <option value="in_progress">対応中</option>
          <option value="resolved">完了</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter(e.target.value as BetaFeedbackType | '')
          }
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全タイプ</option>
          <option value="bug">バグ</option>
          <option value="opinion">意見</option>
          <option value="confused">困った</option>
        </select>
      </div>

      {/* List */}
      {feedbacks.length === 0 && !loading ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-text-secondary">フィードバックがありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {feedbacks.map((f) => (
            <div
              key={f.id}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_CONFIG[f.feedbackType].className}`}
                    >
                      {TYPE_CONFIG[f.feedbackType].label}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[f.status].className}`}
                    >
                      {STATUS_CONFIG[f.status].label}
                    </span>
                  </div>

                  {/* Message */}
                  <p className="text-sm text-foreground mb-2 whitespace-pre-wrap">
                    {f.message}
                  </p>

                  {/* Photo */}
                  {f.photoUrl && (
                    <a
                      href={f.photoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mb-2"
                    >
                      <img
                        src={f.photoUrl}
                        alt="添付写真"
                        className="max-w-xs max-h-40 rounded border border-border"
                      />
                    </a>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                    <span>User: {f.userId.slice(0, 8)}...</span>
                    <span>
                      {f.deviceModel} / {f.os} {f.osVersion}
                    </span>
                    <span>v{f.appVersion}</span>
                    <span>
                      {new Date(f.createdAt).toLocaleString('ja-JP')}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {isModerator && (
                  <div className="flex flex-col gap-1 shrink-0">
                    {f.status !== 'in_progress' && (
                      <button
                        onClick={() => handleStatusChange(f.id, 'in_progress')}
                        disabled={processing === f.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-fresh-blue/15 text-fresh-blue hover:bg-fresh-blue/25 disabled:opacity-50 transition-colors"
                      >
                        対応中
                      </button>
                    )}
                    {f.status !== 'resolved' && (
                      <button
                        onClick={() => handleStatusChange(f.id, 'resolved')}
                        disabled={processing === f.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
                      >
                        完了
                      </button>
                    )}
                    {f.status !== 'open' && (
                      <button
                        onClick={() => handleStatusChange(f.id, 'open')}
                        disabled={processing === f.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-text-secondary/15 text-text-secondary hover:bg-text-secondary/25 disabled:opacity-50 transition-colors"
                      >
                        未対応に戻す
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => cursor && fetchFeedbacks(cursor)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-card border border-border rounded-lg hover:bg-surface disabled:opacity-50 transition-colors"
          >
            {loading ? '読み込み中...' : 'もっと読み込む'}
          </button>
        </div>
      )}

      {loading && feedbacks.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          読み込み中...
        </div>
      )}
    </div>
  );
}
