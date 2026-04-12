'use client';

import { useAuth } from '@/components/auth-provider';
import { useCallback, useEffect, useState } from 'react';
import type { ReportStatus } from '@/lib/types';

interface ReportItem {
  id: string;
  reviewId: string;
  spotId: string;
  reporterUid: string;
  reason: string;
  description?: string;
  status: string;
  resolvedBy?: string;
  resolution?: string;
  createdAt: string;
  review?: {
    id: string;
    score: number;
    comment?: string;
    userId: string;
    spotId: string;
  };
  spotName?: string;
}

const REASON_LABEL: Record<string, string> = {
  spam: 'スパム',
  inappropriate: '不適切',
  misleading: '誤情報',
  other: 'その他',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: '未対応', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
  resolved: { label: '対応済み', className: 'bg-success/20 text-success' },
  dismissed: { label: '却下', className: 'bg-text-secondary/20 text-text-secondary' },
};

export default function ReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('open');
  const [processing, setProcessing] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState('');

  const isModerator = user?.role === 'moderator' || user?.role === 'super_admin';

  const fetchReports = useCallback(
    async (cursorId?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (statusFilter) params.set('status', statusFilter);
        if (cursorId) params.set('cursor', cursorId);

        const res = await fetch(`/api/reports?${params}`);
        const data = await res.json();

        if (cursorId) {
          setReports((prev) => [...prev, ...data.reports]);
        } else {
          setReports(data.reports);
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
    fetchReports();
  }, [fetchReports]);

  const handleAction = async (
    reportId: string,
    action: 'resolve' | 'dismiss' | 'delete_review',
    resolution?: string
  ) => {
    setProcessing(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, resolution }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      const result = await res.json();
      setReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? { ...r, status: result.newStatus, resolvedBy: user?.email, resolution: resolution || action }
            : r
        )
      );
      setResolveTarget(null);
      setResolveNote('');
    } finally {
      setProcessing(null);
    }
  };

  const renderStars = (score: number) => {
    return '★'.repeat(score) + '☆'.repeat(5 - score);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">通報一覧</h1>
          <p className="text-text-secondary text-sm mt-1">
            レビューへの通報を審査・対応
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReportStatus | '')}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全ステータス</option>
          <option value="open">未対応</option>
          <option value="resolved">対応済み</option>
          <option value="dismissed">却下</option>
        </select>
      </div>

      {/* Reports list */}
      {reports.length === 0 && !loading ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-text-secondary">
            {statusFilter === 'open' ? '未対応の通報はありません' : '通報が見つかりません'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const statusConf = STATUS_CONFIG[report.status] || STATUS_CONFIG.open;
            const isOpen = report.status === 'open';

            return (
              <div
                key={report.id}
                className="bg-card border border-border rounded-lg p-4"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConf.className}`}
                      >
                        {statusConf.label}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-danger/15 text-danger">
                        {REASON_LABEL[report.reason] || report.reason}
                      </span>
                      {report.spotName && (
                        <span className="text-xs text-text-secondary truncate">
                          スポット: {report.spotName}
                        </span>
                      )}
                    </div>

                    {/* Review content preview */}
                    {report.review ? (
                      <div className="mt-2 p-3 bg-surface rounded-md border border-border/50">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-fresh-yellow text-sm">
                            {renderStars(report.review.score)}
                          </span>
                          <span className="text-xs text-text-secondary">
                            by {report.review.userId.slice(0, 8)}...
                          </span>
                        </div>
                        {report.review.comment && (
                          <p className="text-sm text-foreground">{report.review.comment}</p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 p-3 bg-surface rounded-md border border-border/50">
                        <p className="text-sm text-text-secondary">レビューが削除済みまたは見つかりません</p>
                      </div>
                    )}

                    {/* Report details */}
                    {report.description && (
                      <p className="mt-2 text-sm text-text-secondary">
                        通報理由: {report.description}
                      </p>
                    )}

                    <div className="flex items-center gap-4 mt-2 text-xs text-text-secondary">
                      <span>通報者: {report.reporterUid.slice(0, 8)}...</span>
                      <span>
                        通報日: {new Date(report.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                      {report.resolvedBy && (
                        <span>対応者: {report.resolvedBy}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  {isModerator && isOpen && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setResolveTarget(report.id)}
                        disabled={processing === report.id}
                        className="px-3 py-1.5 text-sm font-medium rounded-md bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
                      >
                        対応済み
                      </button>
                      <button
                        onClick={() => handleAction(report.id, 'dismiss')}
                        disabled={processing === report.id}
                        className="px-3 py-1.5 text-sm font-medium rounded-md bg-text-secondary/15 text-text-secondary hover:bg-text-secondary/25 disabled:opacity-50 transition-colors"
                      >
                        却下
                      </button>
                      {report.review && (
                        <button
                          onClick={() => handleAction(report.id, 'delete_review')}
                          disabled={processing === report.id}
                          className="px-3 py-1.5 text-sm font-medium rounded-md bg-fresh-red/15 text-fresh-red hover:bg-fresh-red/25 disabled:opacity-50 transition-colors"
                        >
                          レビュー削除
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Resolve note form */}
                {resolveTarget === report.id && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <label className="block text-sm text-text-secondary mb-1">
                      対応メモ（任意）
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={resolveNote}
                        onChange={(e) => setResolveNote(e.target.value)}
                        placeholder="例: ユーザーに警告済み、ガイドライン違反なし..."
                        className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => handleAction(report.id, 'resolve', resolveNote)}
                        disabled={processing === report.id}
                        className="px-3 py-1.5 text-sm font-medium rounded-md bg-success text-white hover:bg-success/80 disabled:opacity-50 transition-colors"
                      >
                        確定
                      </button>
                      <button
                        onClick={() => {
                          setResolveTarget(null);
                          setResolveNote('');
                        }}
                        className="px-3 py-1.5 text-sm rounded-md text-text-secondary hover:text-foreground transition-colors"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => cursor && fetchReports(cursor)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-card border border-border rounded-lg hover:bg-surface disabled:opacity-50 transition-colors"
          >
            {loading ? '読み込み中...' : 'もっと読み込む'}
          </button>
        </div>
      )}

      {loading && reports.length === 0 && (
        <div className="text-center py-12 text-text-secondary">読み込み中...</div>
      )}
    </div>
  );
}
