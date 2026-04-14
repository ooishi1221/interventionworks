'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';

type ResetTarget = 'user_spots' | 'reviews' | 'all_spots';

const TARGETS: { key: ResetTarget; label: string; description: string; danger: boolean }[] = [
  { key: 'user_spots', label: 'ユーザー投稿スポット', description: 'source="user" のスポットを全削除', danger: false },
  { key: 'reviews', label: 'レビュー・足跡', description: '全レビュー/コメントを削除', danger: false },
  { key: 'all_spots', label: '全スポット（シード含む）', description: 'シードデータ含めて全削除。再投入が必要', danger: true },
];

export default function DevToolsPage() {
  const { user } = useAuth();
  const [selected, setSelected] = useState<Set<ResetTarget>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSuperAdmin = user?.role === 'super_admin';

  const toggle = (key: ResetTarget) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleReset = async () => {
    if (selected.size === 0) return;
    const targets = Array.from(selected);
    const confirmMsg = targets.includes('all_spots')
      ? '⚠️ 全スポット（シード含む）を削除します。本当に実行しますか？'
      : `${targets.length}種類のデータを削除します。よろしいですか？`;
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    setResult(null);
    setError(null);

    const res = await fetch('/api/dev/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targets }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.ok) {
      setResult(data.deleted);
      setSelected(new Set());
    } else {
      setError(data.error);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center text-text-secondary">
        この機能は super_admin のみ使用できます
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">開発ツール</h1>
      <p className="text-sm text-text-secondary mb-6">テストデータのリセット・クリーンアップ</p>

      {/* リセット対象 */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">データリセット</h2>
        <div className="space-y-3">
          {TARGETS.map((t) => (
            <label
              key={t.key}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selected.has(t.key)
                  ? t.danger ? 'border-danger/50 bg-danger/5' : 'border-accent/50 bg-accent/5'
                  : 'border-border hover:border-text-secondary/30'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.has(t.key)}
                onChange={() => toggle(t.key)}
                className="accent-accent w-4 h-4 mt-0.5"
              />
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-text-secondary mt-0.5">{t.description}</div>
              </div>
              {t.danger && (
                <span className="ml-auto px-2 py-0.5 text-xs bg-danger/20 text-danger rounded-full">危険</span>
              )}
            </label>
          ))}
        </div>

        <button
          onClick={handleReset}
          disabled={loading || selected.size === 0}
          className="mt-4 px-6 py-2.5 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 transition-colors disabled:opacity-50"
        >
          {loading ? '削除中...' : `選択したデータを削除`}
        </button>
      </div>

      {/* 結果 */}
      {result && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-sm">
          <div className="font-medium text-success mb-1">削除完了</div>
          {Object.entries(result).map(([key, count]) => (
            <div key={key} className="text-text-secondary">
              {key}: {count}件 削除
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-danger">
          {error}
        </div>
      )}
    </div>
  );
}
