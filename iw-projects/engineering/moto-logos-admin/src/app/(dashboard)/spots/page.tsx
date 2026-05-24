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

// ─── スポット詳細編集モーダル ───────────────────────
function SpotDetailModal({ spotId, onClose, onSaved }: { spotId: string; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<SpotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [form, setForm] = useState({
    priceInfo: '',
    openHours: '',
    pricePerHour: '',
    parkingCapacity: '',
    isFree: false,
    paymentCash: false,
    paymentIC: false,
    paymentQR: false,
  });
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [spotRes, reviewsRes] = await Promise.all([
        fetch(`/api/spots/${spotId}`),
        fetch(`/api/spots/${spotId}/reviews`).catch(() => null),
      ]);
      const spot = await spotRes.json();
      setDetail(spot);
      setForm({
        priceInfo: spot.priceInfo ?? '',
        openHours: spot.openHours ?? '',
        pricePerHour: spot.pricePerHour?.toString() ?? '',
        parkingCapacity: spot.parkingCapacity?.toString() ?? '',
        isFree: !!spot.isFree,
        paymentCash: spot.payment?.cash ?? false,
        paymentIC: spot.payment?.icCard ?? false,
        paymentQR: spot.payment?.qrCode ?? false,
      });
      if (reviewsRes?.ok) {
        const reviewData = await reviewsRes.json();
        const urls = (reviewData.reviews ?? [])
          .flatMap((r: { photoUrls?: string[] }) => r.photoUrls ?? [])
          .slice(0, 8);
        setPhotos(urls);
      }
      setLoading(false);
    })();
  }, [spotId]);

  const handleSave = async () => {
    setSaving(true);
    const body: Record<string, unknown> = {
      priceInfo: form.priceInfo || null,
      openHours: form.openHours || null,
      pricePerHour: form.pricePerHour ? Number(form.pricePerHour) : null,
      parkingCapacity: form.parkingCapacity ? Number(form.parkingCapacity) : null,
      isFree: form.isFree,
      payment: { cash: form.paymentCash, icCard: form.paymentIC, qrCode: form.paymentQR },
    };
    const res = await fetch(`/api/spots/${spotId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      onSaved();
      onClose();
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/spots/${spotId}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) {
      onSaved();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="p-8 text-center text-text-secondary">読み込み中...</div>
        ) : detail && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{detail.name}</h2>
              <button onClick={onClose} className="text-text-secondary hover:text-foreground text-xl">&times;</button>
            </div>
            {detail.address && <p className="text-sm text-text-secondary mb-4">{detail.address}</p>}

            {/* 写真ギャラリー */}
            {photos.length > 0 && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-text-secondary mb-2">看板・入口写真</label>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((url, i) => (
                    <img key={i} src={url} alt="" className="w-24 h-18 object-cover rounded-lg border border-border flex-shrink-0" />
                  ))}
                </div>
              </div>
            )}

            {/* フォーム */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">料金テキスト</label>
                <input
                  type="text"
                  value={form.priceInfo}
                  onChange={(e) => setForm((f) => ({ ...f, priceInfo: e.target.value }))}
                  placeholder="例: 100円/30分、1日最大800円"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-text-secondary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">料金（円/時間）</label>
                  <input
                    type="number"
                    value={form.pricePerHour}
                    onChange={(e) => setForm((f) => ({ ...f, pricePerHour: e.target.value }))}
                    placeholder="200"
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-text-secondary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">収容台数</label>
                  <input
                    type="number"
                    value={form.parkingCapacity}
                    onChange={(e) => setForm((f) => ({ ...f, parkingCapacity: e.target.value }))}
                    placeholder="20"
                    className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-text-secondary/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">営業時間</label>
                <input
                  type="text"
                  value={form.openHours}
                  onChange={(e) => setForm((f) => ({ ...f, openHours: e.target.value }))}
                  placeholder="例: 24時間、8:00-22:00"
                  className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-text-secondary/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">無料</label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isFree}
                    onChange={(e) => setForm((f) => ({ ...f, isFree: e.target.checked }))}
                    className="accent-accent w-4 h-4"
                  />
                  <span className="text-sm text-foreground">無料で駐輪可能</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">決済手段</label>
                <div className="flex gap-4">
                  {([
                    { key: 'paymentCash' as const, label: '現金' },
                    { key: 'paymentIC' as const, label: 'ICカード' },
                    { key: 'paymentQR' as const, label: 'QR決済' },
                  ]).map((m) => (
                    <label key={m.key} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form[m.key]}
                        onChange={(e) => setForm((f) => ({ ...f, [m.key]: e.target.checked }))}
                        className="accent-accent w-4 h-4"
                      />
                      <span className="text-sm text-foreground">{m.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-card border border-border rounded-lg text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                キャンセル
              </button>
            </div>

            {/* 削除 */}
            <div className="mt-4 pt-4 border-t border-border">
              {confirmDelete ? (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-danger">関連レビューも完全に削除されます</span>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs font-medium bg-danger text-white rounded-lg hover:bg-danger/90 transition-colors disabled:opacity-50"
                  >
                    {deleting ? '削除中...' : '本当に削除'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="px-3 py-1.5 text-xs text-text-secondary hover:text-foreground"
                  >
                    やめる
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-danger/60 hover:text-danger transition-colors"
                >
                  このスポットを削除
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SpotsPage() {
  const { user } = useAuth();
  const [spots, setSpots] = useState<SpotResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ created?: number; updated?: number; skipped?: number; errors: string[] } | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    const res = await fetch('/api/spots/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotIds: Array.from(selectedIds) }),
    });
    if (res.ok) {
      setSpots((prev) => prev.filter((s) => !selectedIds.has(s.id)));
      setSelectedIds(new Set());
    }
    setBulkLoading(false);
    setConfirmBulkDelete(false);
  };

  const fetchSpots = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (sourceFilter) params.set('source', sourceFilter);
    if (searchQuery) params.set('search', searchQuery);
    params.set('sortBy', sortBy);
    params.set('sortOrder', sortOrder);
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '20');

    const res = await fetch(`/api/spots?${params}`);
    const data = await res.json();
    setSpots(cursor ? (prev) => [...prev, ...data.spots] : data.spots);
    setNextCursor(data.nextCursor);
    setLoading(false);
  }, [statusFilter, sourceFilter, searchQuery, sortBy, sortOrder]);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(searchInput);
  };

  const toggleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const sortIcon = (field: string) => {
    if (sortBy !== field) return ' ↕';
    return sortOrder === 'asc' ? ' ↑' : ' ↓';
  };

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

      {/* Search & Filters */}
      <form onSubmit={handleSearch} className="flex items-center gap-3 mb-4">
        <div className="relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="名前・住所で検索"
            className="pl-3 pr-8 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-text-secondary/50 w-56"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchInput(''); setSearchQuery(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary hover:text-foreground text-sm"
            >
              ×
            </button>
          )}
        </div>
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
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全ソース</option>
          <option value="seed">Seed</option>
          <option value="user">User</option>
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
      </form>

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
          <div className="border-l border-border/50 pl-2">
            {confirmBulkDelete ? (
              <div className="flex items-center gap-2">
                <button
                  disabled={bulkLoading}
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 text-xs font-medium bg-danger text-white rounded-lg hover:bg-danger/90 disabled:opacity-50"
                >
                  {bulkLoading ? '削除中...' : `${selectedIds.size}件を完全削除`}
                </button>
                <button
                  onClick={() => setConfirmBulkDelete(false)}
                  className="px-3 py-1.5 text-xs text-text-secondary hover:text-foreground"
                >
                  やめる
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmBulkDelete(true)}
                className="px-3 py-1.5 text-xs font-medium text-danger/70 hover:text-danger transition-colors"
              >
                削除
              </button>
            )}
          </div>
          <button
            onClick={() => { setSelectedIds(new Set()); setConfirmBulkDelete(false); }}
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
              <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-accent select-none" onClick={() => toggleSort('name')}>名前{sortIcon('name')}</th>
              <th className="text-left px-4 py-3 font-medium">ステータス</th>
              <th className="text-left px-4 py-3 font-medium">検証レベル</th>
              <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-accent select-none" onClick={() => toggleSort('source')}>ソース{sortIcon('source')}</th>
              <th className="text-right px-4 py-3 font-medium cursor-pointer hover:text-accent select-none" onClick={() => toggleSort('goodCount')}>Good{sortIcon('goodCount')}</th>
              <th className="text-right px-4 py-3 font-medium">Bad</th>
              <th className="text-left px-4 py-3 font-medium cursor-pointer hover:text-accent select-none" onClick={() => toggleSort('updatedAt')}>更新日{sortIcon('updatedAt')}</th>
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
                        <div className="flex gap-2">
                          <button
                            onClick={() => setDetailId(spot.id)}
                            className="px-2 py-1 text-xs text-accent hover:underline"
                          >
                            詳細
                          </button>
                          <button
                            onClick={() => setEditingId(spot.id)}
                            className="px-2 py-1 text-xs text-text-secondary hover:underline"
                          >
                            状態
                          </button>
                          <a
                            href={`/audit-log?targetId=${spot.id}&targetType=spot`}
                            className="px-2 py-1 text-xs text-text-secondary hover:text-foreground hover:underline"
                          >
                            履歴
                          </a>
                        </div>
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

      {/* 詳細編集モーダル */}
      {detailId && (
        <SpotDetailModal
          spotId={detailId}
          onClose={() => setDetailId(null)}
          onSaved={() => fetchSpots()}
        />
      )}
    </div>
  );
}
