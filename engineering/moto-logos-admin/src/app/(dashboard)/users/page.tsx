'use client';

import { useEffect, useState, useCallback } from 'react';
import type { UserResponse, UserRank } from '@/lib/types';
import { useAuth } from '@/components/auth-provider';

const RANK_BADGE: Record<UserRank, { label: string; className: string }> = {
  novice: { label: 'Novice', className: 'bg-text-secondary/20 text-text-secondary' },
  rider: { label: 'Rider', className: 'bg-fresh-blue/20 text-fresh-blue' },
  patrol: { label: 'Patrol', className: 'bg-accent/20 text-accent' },
};

export default function UsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const canEdit = user?.role === 'super_admin' || user?.role === 'moderator';

  const fetchUsers = useCallback(async (cursor?: string) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    params.set('limit', '20');

    const res = await fetch(`/api/users?${params}`);
    const data = await res.json();
    setUsers(cursor ? (prev) => [...prev, ...data.users] : data.users);
    setNextCursor(data.nextCursor);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleRankChange = async (userId: string, newRank: UserRank) => {
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rank: newRank }),
    });
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, rank: newRank } : u)));
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">ユーザー管理</h1>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="text-left px-4 py-3 font-medium">表示名</th>
              <th className="text-right px-4 py-3 font-medium">信頼スコア</th>
              <th className="text-left px-4 py-3 font-medium">ランク</th>
              <th className="text-left px-4 py-3 font-medium">登録日</th>
              {canEdit && <th className="px-4 py-3 font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const rankBadge = RANK_BADGE[u.rank];
              return (
                <tr key={u.id} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{u.displayName}</td>
                  <td className="px-4 py-3 text-right font-[family-name:var(--font-inter)]">{u.trustScore}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${rankBadge.className}`}>
                      {rankBadge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ja-JP') : '-'}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3">
                      <select
                        value={u.rank}
                        onChange={(e) => handleRankChange(u.id, e.target.value as UserRank)}
                        className="px-2 py-1 bg-card border border-border rounded text-xs text-foreground"
                      >
                        <option value="novice">Novice</option>
                        <option value="rider">Rider</option>
                        <option value="patrol">Patrol</option>
                      </select>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {loading && <div className="px-4 py-8 text-center text-text-secondary">読み込み中...</div>}
        {!loading && users.length === 0 && <div className="px-4 py-8 text-center text-text-secondary">ユーザーが見つかりません</div>}
      </div>

      {nextCursor && !loading && (
        <div className="mt-4 text-center">
          <button
            onClick={() => fetchUsers(nextCursor)}
            className="px-4 py-2 bg-card border border-border rounded-lg text-sm hover:border-accent transition-colors"
          >
            さらに読み込む
          </button>
        </div>
      )}
    </div>
  );
}
