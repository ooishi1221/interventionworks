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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created?: number; updated?: number; skipped?: number; errors: string[] } | null>(null);

  const canEdit = user?.role === 'super_admin' || user?.role === 'moderator';

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === spots.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(spots.map((s) => s.id)));
    }
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    window.location.href = `/api/spots/export?${params}`;
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>, endpoint: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(endpoint, { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok) {
      setImportResult({ created: data.created, updated: data.updated, skipped: data.skipped, errors: data.errors });
      fetchSpots();
    } else {
      setImportResult({ errors: [data.error] });
    }
    setImporting(false);
    e.target.value = '';
  };

  const handleBulkStatus = async (newStatus: SpotStatus) => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const res = await fetch('/api/spots/bulk-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotIds: Array.from(selectedIds), status: newStatus }),
    });
    if (res.ok) {
      setSpots((prev) =>
        prev.map((s) => (selectedIds.has(s.id) ? { ...s, status: newStatus } : s))
      );
      setSelectedIds(new Set());
    }
    setBulkLoading(false);
  };

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

      {/* Filters & Actions */}
      <div className="flex items-center gap-3 mb-4">
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

        <div className="ml-auto flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-2 text-xs font-medium bg-card border border-border rounded-lg hover:border-accent transition-colors"
          >
            CSVエクスポート
          </button>
          {canEdit && (
            <>
              <label className="px-3 py-2 text-xs font-medium bg-card border border-border rounded-lg hover:border-accent transition-colors cursor-pointer">
                {importing ? '処理中...' : '新規インポート'}
                <input type="file" accept=".csv" onChange={(e) => handleCsvUpload(e, '/api/spots/import')} className="hidden" disabled={importing} />
              </label>
              <label className="px-3 py-2 text-xs font-medium bg-card border border-border rounded-lg hover:border-accent transition-colors cursor-pointer">
                {importing ? '処理中...' : '一括更新'}
                <input type="file" accept=".csv" onChange={(e) => handleCsvUpload(e, '/api/spots/bulk-update')} className="hidden" disabled={importing} />
              </label>
            </>
          )}
        </div>
      </div>

      {/* Import Result */}
      {importResult && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm ${importResult.errors.length > 0 ? 'bg-danger/10 border border-danger/30' : 'bg-success/10 border border-success/30'}`}>
          <div>
            {importResult.created ? `${importResult.created} 件作成` : ''}
            {importResult.updated ? `${importResult.updated} 件更新` : ''}
            {importResult.skipped ? ` / ${importResult.skipped} 件スキップ` : ''}
            {!importResult.created && !importResult.updated && importResult.errors.length === 0 && '変更なし'}
          </div>
          {importResult.errors.map((err, i) => (
            <div key={i} className="text-danger text-xs mt-1">{err}</div>
          ))}
        </div>
      )}

      {/* Bulk Action Bar */}
      {canEdit && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-accent/10 border border-accent/30 rounded-xl">
          <span className="text-sm font-medium">{selectedIds.size} 件選択中</span>
          <div className="flex gap-2 ml-auto">
            {(['active', 'pending', 'closed'] as SpotStatus[]).map((s) => (
              <button
                key={s}
                disabled={bulkLoading}
                onClick={() => handleBulkStatus(s)}
                className="px-3 py-1.5 text-xs font-medium bg-card border border-border rounded-lg hover:border-accent transition-colors disabled:opacity-50"
              >
                → {STATUS_BADGE[s].label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 text-xs text-text-secondary hover:text-foreground"
          >
            選択解除
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              {canEdit && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={spots.length > 0 && selectedIds.size === spots.length}
                    onChange={toggleSelectAll}
                    className="accent-accent w-4 h-4"
                  />
                </th>
              )}
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
                <tr key={spot.id} className={`border-b border-border/50 transition-colors ${selectedIds.has(spot.id) ? 'bg-accent/5' : 'hover:bg-card/50'}`}>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(spot.id)}
                        onChange={() => toggleSelect(spot.id)}
                        className="accent-accent w-4 h-4"
                      />
                    </td>
                  )}
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
