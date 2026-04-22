'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { UserResponse } from '@/lib/types';

type SortKey = 'createdAt' | 'lastActiveAt' | 'launchCount' | 'spotCount' | 'photoCount';

const SORT_LABELS: Record<SortKey, string> = {
  createdAt: '登録日',
  lastActiveAt: '最終ログイン',
  launchCount: '起動回数',
  spotCount: 'スポット数',
  photoCount: '写真数',
};

function formatDateTime(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('ja-JP');
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');

  const fetchUsers = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (cursor) params.set('cursor', cursor);
      params.set('limit', '20');
      params.set('sortBy', sortBy);
      params.set('order', order);
      if (submittedQuery) params.set('q', submittedQuery);

      const res = await fetch(`/api/users?${params}`);
      const data = await res.json();
      setUsers((prev) => (cursor ? [...prev, ...data.users] : data.users));
      setNextCursor(data.nextCursor);
      setLoading(false);
    },
    [sortBy, order, submittedQuery],
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setOrder((o) => (o === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setOrder('desc');
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortBy !== key) return '';
    return order === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">ユーザー管理</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQuery(query.trim());
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="表示名で検索..."
            className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="px-3 py-1.5 text-sm bg-accent/15 text-accent border border-accent/30 rounded-lg hover:bg-accent/25 transition-colors"
          >
            検索
          </button>
        </form>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-border text-text-secondary">
              <th className="text-left px-4 py-3 font-medium">表示名</th>
              <th className="text-left px-4 py-3 font-medium">ステータス</th>
              <SortableHeader label={SORT_LABELS.createdAt} active={sortBy === 'createdAt'} indicator={sortIndicator('createdAt')} onClick={() => toggleSort('createdAt')} />
              <SortableHeader label={SORT_LABELS.lastActiveAt} active={sortBy === 'lastActiveAt'} indicator={sortIndicator('lastActiveAt')} onClick={() => toggleSort('lastActiveAt')} />
              <SortableHeader label={SORT_LABELS.launchCount} active={sortBy === 'launchCount'} indicator={sortIndicator('launchCount')} onClick={() => toggleSort('launchCount')} align="right" />
              <SortableHeader label={SORT_LABELS.spotCount} active={sortBy === 'spotCount'} indicator={sortIndicator('spotCount')} onClick={() => toggleSort('spotCount')} align="right" />
              <SortableHeader label={SORT_LABELS.photoCount} active={sortBy === 'photoCount'} indicator={sortIndicator('photoCount')} onClick={() => toggleSort('photoCount')} align="right" />
              <th className="text-left px-4 py-3 font-medium">OS</th>
              <th className="text-left px-4 py-3 font-medium">端末 / アプリ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border/50 hover:bg-card/50 transition-colors">
                <td className="px-4 py-3 font-medium">
                  <Link href={`/users/${u.id}`} className="hover:text-accent transition-colors">
                    {u.displayName || '(名前未設定)'}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-medium ${
                      u.banStatus === 'banned'
                        ? 'bg-fresh-red/20 text-fresh-red'
                        : u.banStatus === 'suspended'
                          ? 'bg-fresh-yellow/20 text-fresh-yellow'
                          : 'bg-success/20 text-success'
                    }`}
                  >
                    {u.banStatus === 'banned' ? 'BAN' : u.banStatus === 'suspended' ? '停止' : '正常'}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary text-xs">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3 text-text-secondary text-xs">{formatDateTime(u.lastActiveAt)}</td>
                <td className="px-4 py-3 text-right text-xs">{u.launchCount ?? 0}</td>
                <td className="px-4 py-3 text-right text-xs">{u.spotCount ?? 0}</td>
                <td className="px-4 py-3 text-right text-xs">{u.photoCount ?? 0}</td>
                <td className="px-4 py-3 text-xs">
                  {u.lastPlatform ? (
                    <span className="px-2 py-0.5 rounded bg-card text-text-secondary">{u.lastPlatform}</span>
                  ) : (
                    '-'
                  )}
                  {u.lastOsVersion ? <span className="ml-1 text-text-secondary">{u.lastOsVersion}</span> : null}
                </td>
                <td className="px-4 py-3 text-xs text-text-secondary">
                  {u.lastDeviceModel || '-'}
                  {u.lastAppVersion ? <div className="text-text-secondary">v{u.lastAppVersion}</div> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && <div className="px-4 py-8 text-center text-text-secondary">読み込み中...</div>}
        {!loading && users.length === 0 && (
          <div className="px-4 py-8 text-center text-text-secondary">ユーザーが見つかりません</div>
        )}
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

function SortableHeader({
  label,
  active,
  indicator,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  indicator: string;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`${align === 'right' ? 'text-right' : 'text-left'} px-4 py-3 font-medium`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? 'text-accent' : ''}`}
      >
        {label}
        {indicator}
      </button>
    </th>
  );
}
