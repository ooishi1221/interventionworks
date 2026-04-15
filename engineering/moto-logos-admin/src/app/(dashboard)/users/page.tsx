'use client';

import { useEffect, useState, useCallback } from 'react';
import type { UserResponse } from '@/lib/types';

export default function UsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

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

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">ユーザー管理</h1>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="text-left px-4 py-3 font-medium">表示名</th>
              <th className="text-left px-4 py-3 font-medium">ステータス</th>
              <th className="text-left px-4 py-3 font-medium">登録日</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
                <tr key={u.id} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                  <td className="px-4 py-3 font-medium">{u.displayName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.banStatus === 'banned' ? 'bg-fresh-red/20 text-fresh-red'
                        : u.banStatus === 'suspended' ? 'bg-fresh-yellow/20 text-fresh-yellow'
                        : 'bg-success/20 text-success'
                    }`}>
                      {u.banStatus === 'banned' ? 'BAN' : u.banStatus === 'suspended' ? '停止' : '正常'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString('ja-JP') : '-'}
                  </td>
                </tr>
            ))}
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
