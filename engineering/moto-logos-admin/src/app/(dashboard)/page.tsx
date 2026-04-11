'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/stats-card';
import type { DashboardStats, ModerationLogResponse } from '@/lib/types';

const ACTION_LABELS: Record<string, string> = {
  'spot.update': 'スポット更新',
  'user.update': 'ユーザー更新',
  'admin.role.update': 'ロール変更',
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<ModerationLogResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then((r) => r.json()),
      fetch('/api/audit-log?limit=10').then((r) => r.json()),
    ])
      .then(([statsData, logsData]) => {
        setStats(statsData);
        setRecentLogs(logsData.logs || []);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-text-secondary">読み込み中...</div>;
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">ダッシュボード</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard label="スポット総数" value={stats?.totalSpots ?? 0} />
        <StatsCard label="ユーザー総数" value={stats?.totalUsers ?? 0} />
        <StatsCard label="審査待ち" value={stats?.pendingSpots ?? 0} accent />
        <StatsCard label="レビュー総数" value={stats?.totalReviews ?? 0} />
      </div>

      {/* Recent Activity */}
      <div>
        <h2 className="text-lg font-bold mb-4">最近のアクティビティ</h2>
        {recentLogs.length === 0 ? (
          <p className="text-text-secondary text-sm">まだアクティビティはありません</p>
        ) : (
          <div className="space-y-2">
            {recentLogs.map((log) => (
              <div key={log.id} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium">{ACTION_LABELS[log.action] || log.action}</span>
                  <span className="text-text-secondary text-sm ml-2">by {log.adminEmail}</span>
                </div>
                <span className="text-xs text-text-secondary">
                  {new Date(log.createdAt).toLocaleString('ja-JP')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
