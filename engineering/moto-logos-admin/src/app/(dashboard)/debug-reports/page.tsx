'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DebugReportResponse } from '@/lib/types';

export default function DebugReportsPage() {
  const [reports, setReports] = useState<DebugReportResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReports = useCallback(async (cursorId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '20' });
      if (cursorId) params.set('cursor', cursorId);

      const res = await fetch(`/api/debug-reports?${params}`);
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
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">デバッグレポート</h1>
          <p className="text-text-secondary text-sm mt-1">
            設定画面「デバッグ情報を開発者に送信」ボタンから届いたレポート
          </p>
        </div>
      </div>

      {/* List */}
      {reports.length === 0 && !loading ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-text-secondary">レポートがありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const expanded = expandedId === r.id;
            return (
              <div
                key={r.id}
                className="bg-card border border-border rounded-lg p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Header: User + platform chip */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <code className="text-xs px-2 py-0.5 rounded bg-background text-foreground">
                        {r.userId.slice(0, 10)}
                      </code>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          r.platform === 'ios'
                            ? 'bg-fresh-blue/20 text-fresh-blue'
                            : 'bg-success/20 text-success'
                        }`}
                      >
                        {r.platform}
                      </span>
                      <span className="text-xs text-text-secondary">
                        v{r.appVersion}
                        {r.buildNumber ? ` (build ${r.buildNumber})` : ''}
                      </span>
                      <span className="text-xs text-text-secondary">
                        · channel: {r.channel}
                      </span>
                    </div>

                    {/* User note if any */}
                    {r.userNote && (
                      <div className="mb-2 p-2 bg-background rounded">
                        <p className="text-sm text-foreground">
                          💬 {r.userNote}
                        </p>
                      </div>
                    )}

                    {/* Device info */}
                    <p className="text-xs text-text-secondary mb-1">
                      {r.deviceBrand} {r.deviceModel} · {r.platform}{' '}
                      {r.osVersion}
                    </p>

                    {/* Update ID + runtime */}
                    <p className="text-xs text-text-secondary mb-2">
                      update:{' '}
                      <code className="text-foreground">
                        {r.updateId.slice(0, 12)}
                      </code>{' '}
                      · runtime: {r.runtimeVersion}
                    </p>

                    {/* Recent errors */}
                    {r.recentErrors.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() =>
                            setExpandedId(expanded ? null : r.id)
                          }
                          className="text-xs text-fresh-blue hover:underline"
                        >
                          直近エラー {r.recentErrors.length}件
                          {expanded ? '（閉じる）' : '（表示）'}
                        </button>
                        {expanded && (
                          <div className="mt-2 space-y-1">
                            {r.recentErrors.map((e, i) => (
                              <div
                                key={i}
                                className="p-2 bg-background rounded text-xs"
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-text-secondary">
                                    {new Date(e.ts).toLocaleString('ja-JP')}
                                  </span>
                                  {e.context && (
                                    <code className="text-fresh-yellow">
                                      {e.context}
                                    </code>
                                  )}
                                </div>
                                <p className="text-foreground font-mono whitespace-pre-wrap break-all">
                                  {e.message}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Timestamp */}
                    <p className="text-xs text-text-secondary mt-2">
                      {new Date(r.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
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
        <div className="text-center py-12 text-text-secondary">
          読み込み中...
        </div>
      )}
    </div>
  );
}
