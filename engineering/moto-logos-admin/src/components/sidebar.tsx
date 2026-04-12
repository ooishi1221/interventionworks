'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './auth-provider';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { href: '/', label: 'ダッシュボード', icon: '📊' },
  { href: '/moderation', label: 'モデレーション', icon: '🛡️', badge: true },
  { href: '/reports', label: '通報管理', icon: '🚩' },
  { href: '/freshness', label: '鮮度アラート', icon: '🕐' },
  { href: '/spots', label: 'スポット管理', icon: '📍' },
  { href: '/users', label: 'ユーザー管理', icon: '👤' },
  { href: '/notifications', label: '通知管理', icon: '🔔' },
  { href: '/audit-log', label: '監査ログ', icon: '📋' },
  { href: '/roles', label: 'ロール管理', icon: '🔑', requireRole: 'super_admin' as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then((res) => res.json())
      .then((data) => setPendingCount(data.pendingSpots))
      .catch(() => {});
  }, []);

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
              {item.badge && pendingCount != null && pendingCount > 0 && (
                <span className="ml-auto text-xs font-medium bg-fresh-yellow/20 text-fresh-yellow px-1.5 py-0.5 rounded-full">
                  {pendingCount}
                </span>
              )}
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
