'use client';

import { Fragment, useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';

// ─────────────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────────────

interface FreshnessSpot {
  id: string;
  name: string;
  address?: string;
  status: string;
  updatedAt: string;
}

interface FreshnessCategory {
  label: string;
  count: number;
  spots: FreshnessSpot[];
}

interface FreshnessData {
  categories: {
    over6months: FreshnessCategory;
    over3months: FreshnessCategory;
    over1month: FreshnessCategory;
  };
}

type CategoryKey = 'over6months' | 'over3months' | 'over1month';

// ─────────────────────────────────────────────────────
// カテゴリカード設定
// ─────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<CategoryKey, { label: string; colorClass: string; borderClass: string; bgClass: string }> = {
  over6months: {
    label: '6ヶ月以上',
    colorClass: 'text-danger',
    borderClass: 'border-danger/30',
    bgClass: 'bg-danger/10',
  },
  over3months: {
    label: '3〜6ヶ月',
    colorClass: 'text-fresh-yellow',
    borderClass: 'border-fresh-yellow/30',
    bgClass: 'bg-fresh-yellow/10',
  },
  over1month: {
    label: '1〜3ヶ月',
    colorClass: 'text-fresh-blue',
    borderClass: 'border-fresh-blue/30',
    bgClass: 'bg-fresh-blue/10',
  },
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-success/20 text-success' },
  pending: { label: 'Pending', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
  closed: { label: 'Closed', className: 'bg-danger/20 text-danger' },
};

// ─────────────────────────────────────────────────────
// ページコンポーネント
// ─────────────────────────────────────────────────────

type ModerationAction = 'approve' | 'reject' | 'delete';

export default function FreshnessPage() {
  const { user } = useAuth();
  const [data, setData] = useState<FreshnessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<CategoryKey>('over6months');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [singleLoading, setSingleLoading] = useState<string | null>(null);
  const [moderating, setModerating] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const canEdit = user?.role === 'super_admin' || user?.role === 'moderator';

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/freshness');
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 一括 pending 化（6ヶ月以上カテゴリ）
  const handleBulkPending = async () => {
    if (!confirm('6ヶ月以上未更新の全スポットをpending化しますか？')) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/dashboard/freshness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: 'over6months' }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setBulkLoading(false);
    }
  };

  // 個別 pending 化
  const handleSinglePending = async (spotId: string) => {
    setSingleLoading(spotId);
    try {
      const res = await fetch('/api/dashboard/freshness', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spotIds: [spotId] }),
      });
      if (res.ok) {
        await fetchData();
      }
    } finally {
      setSingleLoading(null);
    }
  };

  // pending スポットの承認 / 却下 / 削除
  const handleModerate = async (spotId: string, action: ModerationAction, reason?: string) => {
    setModerating(spotId);
    try {
      const res = await fetch(`/api/spots/${spotId}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      setRejectTarget(null);
      setRejectReason('');
      setDeleteTarget(null);
      await fetchData();
    } finally {
      setModerating(null);
    }
  };

  if (loading) {
    return <div className="text-text-secondary">読み込み中...</div>;
  }

  if (!data) {
    return <div className="text-text-secondary">データの取得に失敗しました</div>;
  }

  const { categories } = data;
  const activeCategory = categories[activeTab];

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">鮮度アラート</h1>

      {/* カテゴリカード */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {(Object.keys(CATEGORY_CONFIG) as CategoryKey[]).map((key) => {
          const config = CATEGORY_CONFIG[key];
          const cat = categories[key];
          const isActive = activeTab === key;

          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`text-left bg-card border rounded-xl p-5 transition-colors ${
                isActive
                  ? `${config.borderClass} ${config.bgClass}`
                  : 'border-border hover:border-border/80'
              }`}
            >
              <p className="text-sm text-text-secondary mb-1">{config.label}</p>
              <p className={`text-3xl font-bold font-[family-name:var(--font-inter)] ${config.colorClass}`}>
                {cat.count.toLocaleString()}
              </p>
              <p className="text-xs text-text-secondary mt-1">件のスポット</p>
            </button>
          );
        })}
      </div>

      {/* 一括アクションバー */}
      {canEdit && activeTab === 'over6months' && categories.over6months.count > 0 && (
        <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-danger/10 border border-danger/30 rounded-xl">
          <span className="text-sm">
            <span className="font-medium text-danger">{categories.over6months.count}件</span>
            <span className="text-text-secondary ml-1">のスポットが6ヶ月以上未更新</span>
          </span>
          <button
            onClick={handleBulkPending}
            disabled={bulkLoading}
            className="ml-auto px-4 py-2 text-xs font-medium bg-danger/20 text-danger border border-danger/30 rounded-lg hover:bg-danger/30 transition-colors disabled:opacity-50"
          >
            {bulkLoading ? '処理中...' : '一括pending化'}
          </button>
        </div>
      )}

      {/* スポットテーブル */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="text-left px-4 py-3 font-medium">名前</th>
              <th className="text-left px-4 py-3 font-medium">住所</th>
              <th className="text-left px-4 py-3 font-medium">最終更新日</th>
              <th className="text-left px-4 py-3 font-medium">ステータス</th>
              {canEdit && <th className="px-4 py-3 font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {activeCategory.spots.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-4 py-8 text-center text-text-secondary">
                  このカテゴリに該当するスポットはありません
                </td>
              </tr>
            ) : (
              activeCategory.spots.map((spot) => {
                const badge = STATUS_BADGE[spot.status] || {
                  label: spot.status,
                  className: 'bg-text-secondary/20 text-text-secondary',
                };
                const isPending = spot.status === 'pending';
                const isBusy = moderating === spot.id;

                return (
                  <Fragment key={spot.id}>
                    <tr className="border-b border-border/50 hover:bg-card/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{spot.name}</div>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {spot.address || '-'}
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs">
                        {spot.updatedAt
                          ? new Date(spot.updatedAt).toLocaleDateString('ja-JP')
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {isPending ? (
                              <>
                                <button
                                  onClick={() => handleModerate(spot.id, 'approve')}
                                  disabled={isBusy}
                                  className="px-3 py-1.5 text-xs font-medium bg-success/15 text-success hover:bg-success/25 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  承認
                                </button>
                                <button
                                  onClick={() => setRejectTarget(spot.id)}
                                  disabled={isBusy}
                                  className="px-3 py-1.5 text-xs font-medium bg-danger/15 text-danger hover:bg-danger/25 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  却下
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(spot.id)}
                                  disabled={isBusy}
                                  className="px-3 py-1.5 text-xs font-medium bg-fresh-red/15 text-fresh-red hover:bg-fresh-red/25 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  削除
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleSinglePending(spot.id)}
                                disabled={singleLoading === spot.id}
                                className="px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 rounded-lg transition-colors disabled:opacity-50"
                              >
                                {singleLoading === spot.id ? '処理中...' : 'pending化'}
                              </button>
                            )}
                            <button
                              onClick={async () => {
                                const res = await fetch('/api/notifications/verify-spot', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ spotId: spot.id }),
                                });
                                const data = await res.json();
                                alert(res.ok ? `確認依頼を${data.sentCount}件送信しました` : data.error);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-fresh-blue hover:bg-fresh-blue/10 rounded-lg transition-colors"
                            >
                              確認依頼
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {canEdit && rejectTarget === spot.id && (
                      <tr className="border-b border-border/50 bg-danger/5">
                        <td colSpan={5} className="px-4 py-3">
                          <label className="block text-xs text-text-secondary mb-1">却下理由（必須）</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={rejectReason}
                              onChange={(e) => setRejectReason(e.target.value)}
                              placeholder="例: 恒久閉鎖を確認、重複..."
                              className="flex-1 bg-surface border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
                            />
                            <button
                              onClick={() => handleModerate(spot.id, 'reject', rejectReason)}
                              disabled={!rejectReason.trim() || isBusy}
                              className="px-3 py-1.5 text-xs font-medium bg-danger text-white hover:bg-danger/80 rounded-lg transition-colors disabled:opacity-50"
                            >
                              確定
                            </button>
                            <button
                              onClick={() => { setRejectTarget(null); setRejectReason(''); }}
                              className="px-3 py-1.5 text-xs text-text-secondary hover:text-foreground transition-colors"
                            >
                              取消
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {canEdit && deleteTarget === spot.id && (
                      <tr className="border-b border-border/50 bg-fresh-red/5">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-fresh-red">
                              このスポットを完全に削除しますか？この操作は取り消せません。
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleModerate(spot.id, 'delete')}
                                disabled={isBusy}
                                className="px-3 py-1.5 text-xs font-medium bg-fresh-red text-white hover:bg-fresh-red/80 rounded-lg transition-colors disabled:opacity-50"
                              >
                                削除する
                              </button>
                              <button
                                onClick={() => setDeleteTarget(null)}
                                className="px-3 py-1.5 text-xs text-text-secondary hover:text-foreground transition-colors"
                              >
                                取消
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
