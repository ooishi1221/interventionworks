'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';

const NAV_ITEMS = [
  { href: '/', label: 'ダッシュボード', icon: '📊' },
  { href: '/reports', label: '通報管理', icon: '🚩' },
  { href: '/freshness', label: '鮮度アラート', icon: '🕐' },
  { href: '/map-updates', label: '地図更新', icon: '🗺️' },
  { href: '/spots', label: 'スポット管理', icon: '📍' },
  { href: '/duplicates', label: '重複検出', icon: '🔄' },
  { href: '/users', label: 'ユーザー管理', icon: '👤' },
{ href: '/security', label: 'セキュリティ', icon: '🔒' },
  { href: '/notifications', label: '通知管理', icon: '🔔' },
  { href: '/audit-log', label: '監査ログ', icon: '📋' },
  { href: '/beta-signups', label: '事前登録者', icon: '📝' },
  { href: '/beta-feedback', label: 'βフィードバック', icon: '💬' },
  { href: '/beta-errors', label: 'βエラー', icon: '🚨' },
  { href: '/debug-reports', label: 'デバッグレポート', icon: '🐛' },
  { href: '/roles', label: 'ロール管理', icon: '🔑', requireRole: 'super_admin' as const },
  { href: '/dev-tools', label: '開発ツール', icon: '🛠️', requireRole: 'super_admin' as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 min-h-screen bg-surface border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-accent">Moto-Logos</h1>
        <p className="text-xs text-text-secondary">Admin Dashboard</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2">
        {NAV_ITEMS.map((item) => {
          if (item.requireRole && user?.role !== item.requireRole) return null;

          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-secondary hover:text-foreground hover:bg-card'
              }`}
            >
              <span>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-4 border-t border-border">
        <div className="text-sm text-foreground truncate">{user?.email}</div>
        <div className="text-xs text-text-secondary mb-2">{user?.role}</div>
        <button
          onClick={logout}
          className="text-xs text-text-secondary hover:text-danger transition-colors"
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}
