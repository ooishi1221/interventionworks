'use client';

import { useAuth } from '@/components/auth-provider';
import { StatsCard } from '@/components/stats-card';
import { useCallback, useEffect, useState } from 'react';
import type { BetaSignupResponse, InvitationStatus } from '@/lib/types';

const MAX_SLOTS = 100;

const STATUS_CONFIG: Record<
  InvitationStatus,
  { label: string; className: string }
> = {
  pending: {
    label: '未招待',
    className: 'bg-fresh-yellow/20 text-fresh-yellow',
  },
  invited: {
    label: '招待済み',
    className: 'bg-fresh-blue/20 text-fresh-blue',
  },
  active: {
    label: '参加中',
    className: 'bg-success/20 text-success',
  },
};

export default function BetaSignupsPage() {
  const { user } = useAuth();
  const [signups, setSignups] = useState<BetaSignupResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<InvitationStatus | ''>('');
  const [totalCount, setTotalCount] = useState(0);
  const [processing, setProcessing] = useState<string | null>(null);

  const isModerator =
    user?.role === 'moderator' || user?.role === 'super_admin';

  const fetchSignups = useCallback(
    async (cursorId?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        if (statusFilter) params.set('status', statusFilter);
        if (cursorId) params.set('cursor', cursorId);

        const res = await fetch(`/api/beta-signups?${params}`);
        const data = await res.json();

        if (cursorId) {
          setSignups((prev) => [...prev, ...data.signups]);
        } else {
          setSignups(data.signups);
        }
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
        setTotalCount(data.totalCount);
      } finally {
        setLoading(false);
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    fetchSignups();
  }, [fetchSignups]);

  const handleStatusChange = async (id: string, newStatus: InvitationStatus) => {
    setProcessing(id);
    try {
      const res = await fetch(`/api/beta-signups/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      setSignups((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, invitationStatus: newStatus } : s
        )
      );
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">事前登録者リスト</h1>
          <p className="text-text-secondary text-sm mt-1">
            LP経由のクローズドβ事前登録者を管理
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatsCard label="総登録数" value={totalCount} accent />
        <StatsCard label="残り枠" value={MAX_SLOTS - totalCount} />
        <StatsCard
          label="参加中"
          value={signups.filter((s) => s.invitationStatus === 'active').length}
        />
      </div>

      {/* Filter */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value as InvitationStatus | '')
          }
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全ステータス</option>
          <option value="pending">未招待</option>
          <option value="invited">招待済み</option>
          <option value="active">参加中</option>
        </select>
      </div>

      {/* Table */}
      {signups.length === 0 && !loading ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-text-secondary">登録者がいません</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="text-left px-4 py-3 font-medium">メール</th>
                <th className="text-left px-4 py-3 font-medium">OS</th>
                <th className="text-left px-4 py-3 font-medium">登録元</th>
                <th className="text-left px-4 py-3 font-medium">ステータス</th>
                <th className="text-left px-4 py-3 font-medium">登録日</th>
                {isModerator && (
                  <th className="text-left px-4 py-3 font-medium">操作</th>
                )}
              </tr>
            </thead>
            <tbody>
              {signups.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-border/50 hover:bg-card/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">{s.email}</td>
                  <td className="px-4 py-3">
                    {s.os === 'ios' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-fresh-blue/20 text-fresh-blue">iPhone</span>
                    ) : s.os === 'android' ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-success/20 text-success">Android</span>
                    ) : (
                      <span className="text-xs text-text-secondary">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{s.source}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[s.invitationStatus].className}`}
                    >
                      {STATUS_CONFIG[s.invitationStatus].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {new Date(s.createdAt).toLocaleDateString('ja-JP')}
                  </td>
                  {isModerator && (
                    <td className="px-4 py-3">
                      <select
                        value={s.invitationStatus}
                        onChange={(e) =>
                          handleStatusChange(
                            s.id,
                            e.target.value as InvitationStatus
                          )
                        }
                        disabled={processing === s.id}
                        className="px-2 py-1 bg-card border border-border rounded text-xs text-foreground disabled:opacity-50"
                      >
                        <option value="pending">未招待</option>
                        <option value="invited">招待済み</option>
                        <option value="active">参加中</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => cursor && fetchSignups(cursor)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-card border border-border rounded-lg hover:bg-surface disabled:opacity-50 transition-colors"
          >
            {loading ? '読み込み中...' : 'もっと読み込む'}
          </button>
        </div>
      )}

      {loading && signups.length === 0 && (
        <div className="text-center py-12 text-text-secondary">
          読み込み中...
        </div>
      )}
    </div>
  );
}
