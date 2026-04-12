'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { ModerationLogResponse } from '@/lib/types';

const ACTION_LABELS: Record<string, string> = {
  'spot.update': 'スポット更新',
  'user.update': 'ユーザー更新',
  'admin.role.update': 'ロール変更',
};

export default function AuditLogPage() {
  const searchParams = useSearchParams();
  const initialTargetId = searchParams.get('targetId') || '';
  const initialTargetType = searchParams.get('targetType') || '';

  const [logs, setLogs] = useState<ModerationLogResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>(initialTargetType);
  const [targetIdFilter, setTargetIdFilter] = useState<string>(initialTargetId);

  const fetchLogs = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (targetTypeFilter) params.set('targetType', targetTypeFilter);
    if (targetIdFilter) params.set('targetId', targetIdFilter);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '20');

    const res = await fetch(`/api/audit-log?${params}`);
    const data = await res.json();
    setLogs(cursor ? (prev) => [...prev, ...data.logs] : data.logs);
    setNextCursor(data.nextCursor);
    setLoading(false);
  }, [targetTypeFilter, targetIdFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">監査ログ</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <select
          value={targetTypeFilter}
          onChange={(e) => setTargetTypeFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全タイプ</option>
          <option value="spot">スポット</option>
          <option value="user">ユーザー</option>
          <option value="review">レビュー</option>
          <option value="admin">管理者</option>
        </select>
        {targetIdFilter && (
          <div className="flex items-center gap-2 px-3 py-2 bg-accent/10 border border-accent/30 rounded-lg text-xs text-accent">
            <span>ID: {targetIdFilter.slice(0, 12)}...</span>
            <button onClick={() => setTargetIdFilter('')} className="hover:text-foreground">&times;</button>
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="text-left px-4 py-3 font-medium">日時</th>
              <th className="text-left px-4 py-3 font-medium">管理者</th>
              <th className="text-left px-4 py-3 font-medium">アクション</th>
              <th className="text-left px-4 py-3 font-medium">対象</th>
              <th className="text-left px-4 py-3 font-medium">変更内容</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                <td className="px-4 py-3 text-xs text-text-secondary whitespace-nowrap">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString('ja-JP') : '-'}
                </td>
                <td className="px-4 py-3 text-sm">{log.adminEmail}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 bg-card rounded text-xs">
                    {ACTION_LABELS[log.action] || log.action}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-text-secondary">
                  {log.targetType}:{log.targetId.slice(0, 8)}...
                </td>
                <td className="px-4 py-3 text-xs font-mono">
                  {Object.entries(log.newState).map(([key, val]) => (
                    <span key={key} className="mr-2">
                      <span className="text-text-secondary">{key}:</span>{' '}
                      <span className="text-danger line-through">{String(log.previousState[key])}</span>
                      {' → '}
                      <span className="text-success">{String(val)}</span>
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && <div className="px-4 py-8 text-center text-text-secondary">読み込み中...</div>}
        {!loading && logs.length === 0 && <div className="px-4 py-8 text-center text-text-secondary">監査ログがありません</div>}
      </div>

      {nextCursor && !loading && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchLogs(nextCursor)}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm hover:border-accent transition-colors"
          >
            さらに読み込む
          </button>
        </div>
      )}
    </div>
  );
}
