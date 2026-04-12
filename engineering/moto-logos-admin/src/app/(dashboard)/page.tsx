'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/stats-card';
import type { DashboardStats, KpiStats, ModerationLogResponse } from '@/lib/types';

const ACTION_LABELS: Record<string, string> = {
  'spot.update': 'スポット更新',
  'user.update': 'ユーザー更新',
  'admin.role.update': 'ロール変更',
};

function DailyTrendChart({ data }: { data: KpiStats['dailyTrend'] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-sm text-text-secondary mb-3">DAU 推移（過去30日）</h3>
      <div className="flex items-end gap-[2px] h-32">
        {data.map((d) => {
          const height = (d.count / max) * 100;
          const dateLabel = d.date.slice(5); // MM-DD
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end group relative"
            >
              <div
                className="w-full bg-accent rounded-sm min-h-[2px] transition-all"
                style={{ height: `${Math.max(height, 2)}%` }}
              />
              <div className="absolute bottom-full mb-1 hidden group-hover:block bg-surface border border-border rounded px-2 py-1 text-xs whitespace-nowrap z-10">
                {dateLabel}: {d.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-text-secondary">{data[0]?.date.slice(5)}</span>
        <span className="text-[10px] text-text-secondary">{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [kpi, setKpi] = useState<KpiStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<ModerationLogResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard/stats').then((r) => r.json()),
      fetch('/api/dashboard/kpi').then((r) => r.json()),
      fetch('/api/audit-log?limit=10').then((r) => r.json()),
    ])
      .then(([statsData, kpiData, logsData]) => {
        setStats(statsData);
        if (kpiData.dau !== undefined) setKpi(kpiData);
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

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <StatsCard label="DAU（今日）" value={kpi?.dau ?? 0} accent />
        <StatsCard label="WAU（7日間）" value={kpi?.wau ?? 0} />
        <StatsCard label="MAU（30日間）" value={kpi?.mau ?? 0} />
      </div>

      {/* DAU Trend Chart */}
      {kpi?.dailyTrend && (
        <div className="mb-8">
          <DailyTrendChart data={kpi.dailyTrend} />
        </div>
      )}

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
