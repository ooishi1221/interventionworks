'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';

type Tab = 'ranking' | 'points' | 'badges';

interface RankEntry {
  rank: number;
  userId: string;
  displayName: string;
  reviews: number;
  spots: number;
  score: number;
}

interface PointRules {
  reviewPost: number;
  spotRegister: number;
  photoAttach: number;
  goodVote: number;
  badVote: number;
}

interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition: string;
  sortOrder: number;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'ranking', label: '貢献者ランキング' },
  { id: 'points', label: 'ポイントルール' },
  { id: 'badges', label: 'バッジ定義' },
];

export default function GamificationPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin' || user?.role === 'moderator';
  const [tab, setTab] = useState<Tab>('ranking');

  // Ranking
  const [ranking, setRanking] = useState<RankEntry[]>([]);
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [rankLoading, setRankLoading] = useState(false);

  // Points
  const [rules, setRules] = useState<PointRules | null>(null);
  const [rulesSaving, setRulesSaving] = useState(false);

  // Badges
  const [badges, setBadges] = useState<Badge[]>([]);
  const [newBadge, setNewBadge] = useState({ name: '', description: '', icon: '🏅', condition: '' });
  const [badgeSaving, setBadgeSaving] = useState(false);

  const loadRanking = useCallback(async () => {
    setRankLoading(true);
    try {
      const res = await fetch(`/api/users/ranking?period=${period}`);
      if (res.ok) setRanking((await res.json()).ranking || []);
    } finally { setRankLoading(false); }
  }, [period]);

  const loadRules = useCallback(async () => {
    const res = await fetch('/api/settings/point-rules');
    if (res.ok) setRules(await res.json());
  }, []);

  const loadBadges = useCallback(async () => {
    const res = await fetch('/api/settings/badges');
    if (res.ok) setBadges((await res.json()).badges || []);
  }, []);

  useEffect(() => {
    if (tab === 'ranking') loadRanking();
    if (tab === 'points') loadRules();
    if (tab === 'badges') loadBadges();
  }, [tab, loadRanking, loadRules, loadBadges]);

  const saveRules = async () => {
    if (!rules) return;
    setRulesSaving(true);
    try {
      const res = await fetch('/api/settings/point-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rules),
      });
      if (res.ok) alert('保存しました');
      else alert('エラーが発生しました');
    } finally { setRulesSaving(false); }
  };

  const addBadge = async () => {
    if (!newBadge.name.trim()) { alert('バッジ名を入力してください'); return; }
    setBadgeSaving(true);
    try {
      const res = await fetch('/api/settings/badges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newBadge, sortOrder: badges.length }),
      });
      if (res.ok) {
        setNewBadge({ name: '', description: '', icon: '🏅', condition: '' });
        loadBadges();
      }
    } finally { setBadgeSaving(false); }
  };

  const deleteBadge = async (id: string, name: string) => {
    if (!confirm(`バッジ「${name}」を削除しますか？`)) return;
    await fetch('/api/settings/badges', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setBadges((prev) => prev.filter((b) => b.id !== id));
  };

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">ゲーミフィケーション</h1>

      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id ? 'text-accent border-accent' : 'text-text-secondary border-transparent hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ランキング */}
      {tab === 'ranking' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'week' | 'month')}
              className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
            >
              <option value="week">週間</option>
              <option value="month">月間</option>
            </select>
            <button onClick={loadRanking} disabled={rankLoading} className="text-xs text-accent hover:underline disabled:opacity-50">
              {rankLoading ? '読み込み中...' : '更新'}
            </button>
          </div>

          {ranking.length === 0 ? (
            <p className="text-sm text-text-secondary py-8 text-center">期間内の活動がありません</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-secondary">
                  <th className="text-left px-3 py-2 font-medium w-12">#</th>
                  <th className="text-left px-3 py-2 font-medium">ユーザー</th>
                  <th className="text-right px-3 py-2 font-medium">レビュー</th>
                  <th className="text-right px-3 py-2 font-medium">スポット</th>
                  <th className="text-right px-3 py-2 font-medium">スコア</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => (
                  <tr key={r.userId} className="border-b border-border/50 hover:bg-card/50">
                    <td className="px-3 py-2.5 text-lg">{MEDAL[r.rank - 1] || r.rank}</td>
                    <td className="px-3 py-2.5 font-medium">{r.displayName}</td>
                    <td className="px-3 py-2.5 text-right text-text-secondary font-[family-name:var(--font-inter)]">{r.reviews}</td>
                    <td className="px-3 py-2.5 text-right text-text-secondary font-[family-name:var(--font-inter)]">{r.spots}</td>
                    <td className="px-3 py-2.5 text-right font-bold font-[family-name:var(--font-inter)]">{r.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ポイントルール */}
      {tab === 'points' && rules && (
        <div className="bg-surface border border-border rounded-xl p-6 max-w-md">
          <p className="text-xs text-text-secondary mb-4">各アクションに付与されるポイント数を設定</p>
          {(['reviewPost', 'spotRegister', 'photoAttach', 'goodVote', 'badVote'] as (keyof PointRules)[])
            .map((key) => {
              const val = rules[key];
              const labels: Record<string, string> = {
                reviewPost: 'レビュー投稿',
                spotRegister: 'スポット登録',
                photoAttach: '写真添付',
                goodVote: 'Good 投票',
                badVote: 'Bad 投票',
              };
              return (
                <div key={key} className="flex items-center justify-between py-2.5 border-b border-border/50">
                  <label className="text-sm">{labels[key] || key}</label>
                  <input
                    type="number"
                    value={val}
                    onChange={(e) => setRules({ ...rules, [key]: parseInt(e.target.value) || 0 })}
                    disabled={!canEdit}
                    className="w-20 px-2 py-1 bg-card border border-border rounded text-sm text-right text-foreground font-[family-name:var(--font-inter)]"
                  />
                </div>
              );
            })}
          {canEdit && (
            <button
              onClick={saveRules}
              disabled={rulesSaving}
              className="mt-4 w-full py-2.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
            >
              {rulesSaving ? '保存中...' : '保存'}
            </button>
          )}
        </div>
      )}

      {/* バッジ定義 */}
      {tab === 'badges' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          {/* 既存バッジ */}
          {badges.length > 0 && (
            <div className="space-y-2 mb-6">
              {badges.map((b) => (
                <div key={b.id} className="flex items-center gap-3 bg-card rounded-lg px-4 py-3">
                  <span className="text-2xl">{b.icon}</span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{b.name}</p>
                    <p className="text-xs text-text-secondary">{b.description}</p>
                    {b.condition && <p className="text-xs text-accent mt-0.5">条件: {b.condition}</p>}
                  </div>
                  {canEdit && (
                    <button
                      onClick={() => deleteBadge(b.id, b.name)}
                      className="text-xs text-fresh-red hover:underline"
                    >
                      削除
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 新規追加 */}
          {canEdit && (
            <div className="border-t border-border pt-4">
              <p className="text-sm font-medium mb-3">バッジを追加</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <input
                  value={newBadge.icon}
                  onChange={(e) => setNewBadge({ ...newBadge, icon: e.target.value })}
                  placeholder="アイコン"
                  maxLength={4}
                  className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground text-center text-2xl"
                />
                <input
                  value={newBadge.name}
                  onChange={(e) => setNewBadge({ ...newBadge, name: e.target.value })}
                  placeholder="バッジ名"
                  className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <input
                value={newBadge.description}
                onChange={(e) => setNewBadge({ ...newBadge, description: e.target.value })}
                placeholder="説明"
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground mb-3"
              />
              <input
                value={newBadge.condition}
                onChange={(e) => setNewBadge({ ...newBadge, condition: e.target.value })}
                placeholder="条件（例: 10スポット登録）"
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground mb-3"
              />
              <button
                onClick={addBadge}
                disabled={badgeSaving}
                className="w-full py-2.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {badgeSaving ? '追加中...' : '追加'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
