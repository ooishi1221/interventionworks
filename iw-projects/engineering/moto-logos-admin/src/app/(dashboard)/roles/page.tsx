'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import type { AdminRole } from '@/lib/types';

const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'スーパー管理者',
  moderator: 'モデレーター',
  viewer: '閲覧者',
};

export default function RolesPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('viewer');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user?.role !== 'super_admin') {
    return (
      <div className="text-center py-12 text-text-secondary">
        このページにアクセスする権限がありません
      </div>
    );
  }

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);

    try {
      // まず Firebase Auth でユーザーを作成（サーバーサイドで処理）
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '作成に失敗しました');
      }

      setMessage(`管理者 ${email} を ${ROLE_LABELS[role]} として作成しました`);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '作成に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">ロール管理</h1>

      {/* Create Admin Form */}
      <div className="max-w-md bg-surface border border-border rounded-xl p-6">
        <h2 className="text-lg font-bold mb-4">新規管理者を追加</h2>

        <form onSubmit={handleCreateAdmin} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-sm text-text-secondary mb-1">
              メールアドレス
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-sm text-text-secondary mb-1">
              初期パスワード
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm focus:outline-none focus:border-accent"
              placeholder="8文字以上"
            />
          </div>

          <div>
            <label htmlFor="admin-role" className="block text-sm text-text-secondary mb-1">
              ロール
            </label>
            <select
              id="admin-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AdminRole)}
              className="w-full px-3 py-2.5 bg-card border border-border rounded-lg text-foreground text-sm"
            >
              <option value="viewer">閲覧者</option>
              <option value="moderator">モデレーター</option>
              <option value="super_admin">スーパー管理者</option>
            </select>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {message && <p className="text-sm text-success">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-accent hover:bg-accent-light text-white font-medium rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {loading ? '作成中...' : '管理者を作成'}
          </button>
        </form>
      </div>
    </div>
  );
}
