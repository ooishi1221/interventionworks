'use client';

import { useEffect, useState, useCallback } from 'react';
import type { SpotResponse, SpotStatus, VerificationLevel } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';

const STATUS_BADGE: Record<SpotStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-success/20 text-success' },
  pending: { label: 'Pending', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
  closed: { label: 'Closed', className: 'bg-danger/20 text-danger' },
};

const VERIFICATION_BADGE: Record<VerificationLevel, { label: string; className: string }> = {
  official: { label: 'Official', className: 'bg-fresh-blue/20 text-fresh-blue' },
  trusted: { label: 'Trusted', className: 'bg-success/20 text-success' },
  community: { label: 'Community', className: 'bg-text-secondary/20 text-text-secondary' },
};

export default function SpotsPage() {
  const { user } = useAuth();
  const [spots, setSpots] = useState<SpotResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const canEdit = user?.role === 'super_admin' || user?.role === 'moderator';

  const fetchSpots = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '20');

    const res = await fetch(`/api/spots?${params}`);
    const data = await res.json();
    setSpots(cursor ? (prev) => [...prev, ...data.spots] : data.spots);
    setNextCursor(data.nextCursor);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const handleStatusChange = async (spotId: string, newStatus: SpotStatus) => {
    const res = await fetch(`/api/spots/${spotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      setSpots((prev) => prev.map((s) => (s.id === spotId ? { ...s, status: newStatus } : s)));
      setEditingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">スポット管理</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全ステータス</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="text-left px-4 py-3 font-medium">名前</th>
              <th className="text-left px-4 py-3 font-medium">ステータス</th>
              <th className="text-left px-4 py-3 font-medium">検証レベル</th>
              <th className="text-left px-4 py-3 font-medium">ソース</th>
              <th className="text-right px-4 py-3 font-medium">Good</th>
              <th className="text-right px-4 py-3 font-medium">Bad</th>
              <th className="text-left px-4 py-3 font-medium">更新日</th>
              {canEdit && <th className="px-4 py-3 font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {spots.map((spot) => {
              const statusBadge = STATUS_BADGE[spot.status];
              const verBadge = VERIFICATION_BADGE[spot.verificationLevel];
              return (
                <tr key={spot.id} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{spot.name}</div>
                    {spot.address && <div className="text-xs text-text-secondary">{spot.address}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.className}`}>
                      {statusBadge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${verBadge.className}`}>
                      {verBadge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{spot.source}</td>
                  <td className="px-4 py-3 text-right font-[family-name:var(--font-inter)]">{spot.goodCount}</td>
                  <td className="px-4 py-3 text-right font-[family-name:var(--font-inter)]">{spot.badReportCount}</td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {spot.updatedAt ? new Date(spot.updatedAt).toLocaleDateString('ja-JP') : '-'}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      {editingId === spot.id ? (
                        <div className="flex gap-1">
                          {(['active', 'pending', 'closed'] as SpotStatus[])
                            .filter((s) => s !== spot.status)
                            .map((s) => (
                              <button
                                key={s}
                                onClick={() => handleStatusChange(spot.id, s)}
                                className="px-2 py-1 text-xs bg-card border border-border rounded hover:border-accent transition-colors"
                              >
                                {s}
                              </button>
                            ))}
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-xs text-text-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingId(spot.id)}
                          className="px-2 py-1 text-xs text-accent hover:underline"
                        >
                          編集
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading && <div className="px-4 py-8 text-center text-text-secondary">読み込み中...</div>}
        {!loading && spots.length === 0 && <div className="px-4 py-8 text-center text-text-secondary">スポットが見つかりません</div>}
      </div>

      {/* Load More */}
      {nextCursor && !loading && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchSpots(nextCursor)}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm hover:border-accent transition-colors"
          >
            さらに読み込む
          </button>
        </div>
      )}
    </div>
  );
}
