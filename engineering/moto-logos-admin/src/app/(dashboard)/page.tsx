'use client';

import { useEffect, useState } from 'react';
import { StatsCard } from '@/components/stats-card';
import type { DashboardStats, KpiStats, ModerationLogResponse } from '@/lib/types';

const ACTION_LABELS: Record<string, string> = {
  'spot.update': 'スポット更新',
  'user.update': 'ユーザー更新',
  'admin.role.update': 'ロール変更',
};

/** Format a number as a percentage string with 1 decimal place */
function pct(value: number | undefined | null): string {
  if (value == null) return '--';
  return `${value.toFixed(1)}%`;
}

/** Return a Tailwind text-color class based on stickiness thresholds */
function stickinessColor(value: number): string {
  if (value >= 20) return 'text-success';
  if (value >= 10) return 'text-fresh-yellow';
  return 'text-danger';
}

// ─────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────

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

function PercentCard({
  label,
  value,
  benchmark,
  colorClass,
}: {
  label: string;
  value: number | undefined | null;
  benchmark?: string;
  colorClass?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-sm text-text-secondary mb-1">{label}</p>
      <p
        className={`text-3xl font-bold font-[family-name:var(--font-inter)] ${colorClass ?? 'text-foreground'}`}
      >
        {pct(value)}
      </p>
      {benchmark && (
        <p className="text-xs text-text-secondary mt-1">{benchmark}</p>
      )}
    </div>
  );
}

function StackedBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <div className="h-8 rounded-lg bg-surface flex items-center justify-center">
        <span className="text-xs text-text-secondary">データなし</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex h-8 rounded-lg overflow-hidden">
        {segments.map((seg) => {
          const widthPct = (seg.value / total) * 100;
          if (widthPct === 0) return null;
          return (
            <div
              key={seg.label}
              className="flex items-center justify-center text-[11px] font-medium text-white transition-all"
              style={{
                width: `${widthPct}%`,
                backgroundColor: seg.color,
                minWidth: widthPct > 0 ? '24px' : '0',
              }}
              title={`${seg.label}: ${seg.value}`}
            >
              {widthPct >= 10 ? seg.value : ''}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-xs text-text-secondary">
              {seg.label}: {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopAreasTable({ areas }: { areas: KpiStats['topAreas'] | undefined | null }) {
  if (!areas || areas.length === 0) {
    return (
      <p className="text-sm text-text-secondary">データなし</p>
    );
  }

  return (
    <div className="space-y-1.5">
      {areas.map((item, i) => (
        <div
          key={item.area}
          className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-5 text-right">{i + 1}.</span>
            <span className="text-sm">{item.area}</span>
          </div>
          <span className="text-sm font-medium text-accent tabular-nums">
            {item.count.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────

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

      {/* KPI Cards — DAU / WAU / MAU */}
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

      {/* Row 1: Engagement Metrics */}
      <h2 className="text-lg font-bold mb-4">エンゲージメント</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <PercentCard
          label="スティッキネス（DAU/MAU）"
          value={kpi?.stickiness}
          colorClass={kpi?.stickiness != null ? stickinessColor(kpi.stickiness) : undefined}
        />
        <PercentCard label="投稿率" value={kpi?.postingRate} />
        <PercentCard label="検証率" value={kpi?.verificationRate} />
        <PercentCard label="レビュー投稿率" value={kpi?.reviewRate} />
        <PercentCard label="写真添付率" value={kpi?.photoAttachRate} />
      </div>

      {/* Row 2: Retention */}
      <h2 className="text-lg font-bold mb-4">リテンション</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <PercentCard
          label="D1 リテンション"
          value={kpi?.retention?.d1}
          benchmark="目標: 25%"
        />
        <PercentCard
          label="D7 リテンション"
          value={kpi?.retention?.d7}
          benchmark="目標: 10.7%"
        />
        <PercentCard
          label="D30 リテンション"
          value={kpi?.retention?.d30}
          benchmark="目標: 6%"
        />
      </div>

      {/* Row 3: Freshness & Rank Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm text-text-secondary mb-4">スポット鮮度分布</h3>
          <StackedBar
            segments={[
              { label: '新鮮', value: kpi?.freshness?.fresh ?? 0, color: 'var(--fresh-blue)' },
              { label: '古い', value: kpi?.freshness?.stale ?? 0, color: 'var(--fresh-yellow)' },
              { label: '要注意', value: kpi?.freshness?.critical ?? 0, color: 'var(--fresh-red)' },
            ]}
          />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm text-text-secondary mb-4">ランク分布</h3>
          <StackedBar
            segments={[
              { label: 'ノービス', value: kpi?.rankDistribution?.novice ?? 0, color: '#6B7280' },
              { label: 'ライダー', value: kpi?.rankDistribution?.rider ?? 0, color: 'var(--accent)' },
              { label: 'パトロール', value: kpi?.rankDistribution?.patrol ?? 0, color: 'var(--success)' },
            ]}
          />
        </div>
      </div>

      {/* Row 4: Top Areas & Moderation Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm text-text-secondary mb-4">エリア別スポット数 Top 10</h3>
          <TopAreasTable areas={kpi?.topAreas} />
        </div>
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm text-text-secondary mb-1">モデレーション処理速度</h3>
          <p className="text-3xl font-bold font-[family-name:var(--font-inter)] mt-4">
            {kpi?.moderationAvgDays != null
              ? `${kpi.moderationAvgDays.toFixed(1)} 日`
              : '--'}
          </p>
          <p className="text-xs text-text-secondary mt-2">
            審査待ちスポットの平均処理日数
          </p>
        </div>
      </div>

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
