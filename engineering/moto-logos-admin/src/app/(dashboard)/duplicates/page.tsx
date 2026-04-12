'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';

interface SpotInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  status: string;
  goodCount: number;
  source: string;
}

interface DupPair {
  spotA: SpotInfo;
  spotB: SpotInfo;
  distance: number;
  nameDist: number;
}

export default function DuplicatesPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin' || user?.role === 'moderator';

  const [pairs, setPairs] = useState<DupPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/spots/duplicates');
      if (res.ok) {
        const data = await res.json();
        setPairs(data.duplicates || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMerge = async (keepId: string, removeId: string, keepName: string, removeName: string) => {
    if (!confirm(`「${removeName}」を「${keepName}」にマージします。\n削除されたスポットは復元できません。\n\nよろしいですか？`)) return;

    const key = `${keepId}_${removeId}`;
    setMerging(key);
    try {
      const res = await fetch('/api/spots/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId, removeId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`マージ完了: レビュー${data.migratedReviews}件を移行しました`);
        setPairs((prev) => prev.filter((p) =>
          !(p.spotA.id === keepId && p.spotB.id === removeId) &&
          !(p.spotA.id === removeId && p.spotB.id === keepId)
        ));
      } else {
        alert(`エラー: ${data.error}`);
      }
    } finally {
      setMerging(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">重複候補スポット</h1>
          <p className="text-xs text-text-secondary mt-1">半径50m以内 + 名称類似度3未満のペア</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 text-sm bg-card border border-border rounded-lg hover:border-accent transition-colors disabled:opacity-50"
        >
          {loading ? '検出中...' : '再検出'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-secondary">検出中...</div>
      ) : pairs.length === 0 ? (
        <div className="text-center py-12 text-text-secondary">重複候補はありません</div>
      ) : (
        <div className="space-y-3">
          {pairs.map((pair, i) => {
            const key = `${pair.spotA.id}_${pair.spotB.id}`;
            return (
              <div key={i} className="bg-surface border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs px-2 py-0.5 bg-fresh-yellow/20 text-fresh-yellow rounded-full font-medium">
                    {pair.distance}m
                  </span>
                  <span className="text-xs text-text-secondary">
                    名称距離: {pair.nameDist}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Spot A */}
                  <div className="bg-card rounded-lg p-3">
                    <p className="font-medium text-sm">{pair.spotA.name}</p>
                    <p className="text-xs text-text-secondary mt-1">
                      {pair.spotA.source} / {pair.spotA.status} / Good: {pair.spotA.goodCount}
                    </p>
                    <p className="text-xs text-text-secondary font-mono">{pair.spotA.id.slice(0, 16)}...</p>
                    {canEdit && (
                      <button
                        onClick={() => handleMerge(pair.spotA.id, pair.spotB.id, pair.spotA.name, pair.spotB.name)}
                        disabled={merging === key}
                        className="mt-2 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        こちらを残す
                      </button>
                    )}
                  </div>

                  {/* Spot B */}
                  <div className="bg-card rounded-lg p-3">
                    <p className="font-medium text-sm">{pair.spotB.name}</p>
                    <p className="text-xs text-text-secondary mt-1">
                      {pair.spotB.source} / {pair.spotB.status} / Good: {pair.spotB.goodCount}
                    </p>
                    <p className="text-xs text-text-secondary font-mono">{pair.spotB.id.slice(0, 16)}...</p>
                    {canEdit && (
                      <button
                        onClick={() => handleMerge(pair.spotB.id, pair.spotA.id, pair.spotB.name, pair.spotA.name)}
                        disabled={merging === key}
                        className="mt-2 px-3 py-1.5 text-xs font-medium text-success hover:bg-success/10 rounded-lg transition-colors disabled:opacity-50"
                      >
                        こちらを残す
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
