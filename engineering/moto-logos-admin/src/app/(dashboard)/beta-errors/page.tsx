'use client';

import { useAuth } from '@/components/auth-provider';
import { useCallback, useEffect, useState } from 'react';
import type { BetaErrorResponse, BetaErrorStatus } from '@/lib/types';

const STATUS_CONFIG: Record<
  BetaErrorStatus,
  { label: string; className: string }
> = {
  open: { label: '未対応', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
  known: { label: '既知', className: 'bg-text-secondary/20 text-text-secondary' },
  in_progress: {
    label: '対応中',
    className: 'bg-fresh-blue/20 text-fresh-blue',
  },
  fixed: { label: '修正済み', className: 'bg-success/20 text-success' },
};

export default function BetaErrorsPage() {
  const { user } = useAuth();
  const [errors, setErrors] = useState<BetaErrorResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<BetaErrorStatus | ''>('open');
  const [processing, setProcessing] = useState<string | null>(null);
  const [expandedStack, setExpandedStack] = useState<string | null>(null);

  const isModerator =
    user?.role === 'moderator' || user?.role === 'super_admin';

  const fetchErrors = useCallback(
    async (cursorId?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (statusFilter) params.set('status', statusFilter);
        if (cursorId) params.set('cursor', cursorId);

        const res = await fetch(`/api/beta-errors?${params}`);
        const data = await res.json();

        if (cursorId) {
          setErrors((prev) => [...prev, ...data.errors]);
        } else {
          setErrors(data.errors);
        }
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const handleStatusChange = async (id: string, newStatus: BetaErrorStatus) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/beta-errors/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      setErrors((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: newStatus } : e))
      );
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">βエラー</h1>
          <p className="text-text-secondary text-sm mt-1">
            βテスト中の自動エラー報告を管理
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as BetaErrorStatus | '')
          }
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全ステータス</option>
          <option value="open">未対応</option>
          <option value="known">既知</option>
          <option value="in_progress">対応中</option>
          <option value="fixed">修正済み</option>
        </select>
      </div>

      {/* List */}
      {errors.length === 0 && !loading ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-text-secondary">エラーがありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {errors.map((e) => (
            <div
              key={e.id}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Status badge */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[e.status].className}`}
                    >
                      {STATUS_CONFIG[e.status].label}
                    </span>
                    <span className="text-xs text-text-secondary">
                      v{e.appVersion}
                    </span>
                  </div>

                  {/* Error message */}
                  <p className="text-sm text-foreground font-mono mb-1">
                    {e.message}
                  </p>

                  {/* Context */}
                  {e.context && (
                    <p className="text-xs text-text-secondary mb-2">
                      Context: {e.context}
                    </p>
                  )}

                  {/* Stack trace toggle */}
                  {e.stack && (
                    <div className="mb-2">
                      <button
                        onClick={() =>
                          setExpandedStack(
                            expandedStack === e.id ? null : e.id
                          )
                        }
                        className="text-xs text-fresh-blue hover:underline"
                      >
                        {expandedStack === e.id
                          ? 'スタックトレースを閉じる'
                          : 'スタックトレースを表示'}
                      </button>
                      {expandedStack === e.id && (
                        <pre className="mt-1 p-2 bg-background rounded text-xs text-text-secondary overflow-x-auto max-h-48">
                          {e.stack}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                    {e.userId && (
                      <span>User: {e.userId.slice(0, 8)}...</span>
                    )}
                    <span>
                      {e.deviceModel} / {e.os} {e.osVersion}
                    </span>
                    <span>
                      {new Date(e.createdAt).toLocaleString('ja-JP')}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                {isModerator && (
                  <div className="flex flex-col gap-1 shrink-0">
                    {e.status === 'open' && (
                      <>
                        <button
                          onClick={() => handleStatusChange(e.id, 'known')}
                          disabled={processing === e.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-text-secondary/15 text-text-secondary hover:bg-text-secondary/25 disabled:opacity-50 transition-colors"
                        >
                          既知
                        </button>
                        <button
                          onClick={() =>
                            handleStatusChange(e.id, 'in_progress')
                          }
                          disabled={processing === e.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-fresh-blue/15 text-fresh-blue hover:bg-fresh-blue/25 disabled:opacity-50 transition-colors"
                        >
                          対応中
                        </button>
                      </>
                    )}
                    {(e.status === 'known' || e.status === 'in_progress') && (
                      <button
                        onClick={() => handleStatusChange(e.id, 'fixed')}
                        disabled={processing === e.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
                      >
                        修正済み
                      </button>
                    )}
                    {e.status !== 'open' && (
                      <button
                        onClick={() => handleStatusChange(e.id, 'open')}
                        disabled={processing === e.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-fresh-yellow/15 text-fresh-yellow hover:bg-fresh-yellow/25 disabled:opacity-50 transition-colors"
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
            onClick={() => cursor && fetchErrors(cursor)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-card border border-border rounded-lg hover:bg-surface disabled:opacity-50 transition-colors"
          >
            {loading ? '読み込み中...' : 'もっと読み込む'}
          </button>
        </div>
      )}

      {loading && errors.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          読み込み中...
        </div>
      )}
    </div>
  );
}
