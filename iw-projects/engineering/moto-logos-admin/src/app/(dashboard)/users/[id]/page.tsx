'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth-provider';
import type { BanStatus } from '@/lib/types';

interface UserDetail {
  id: string;
  displayName: string;
  photoUrl?: string | null;
  banStatus?: BanStatus;
  banReason?: string;
  bannedAt?: string;
  banUntil?: string | null;
  bannedBy?: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  launchCount?: number;
  lastPlatform?: string;
  lastDeviceModel?: string;
  lastDeviceBrand?: string;
  lastOsVersion?: string;
  lastAppVersion?: string;
  spotCount?: number;
  photoCount?: number;
}

interface SpotItem {
  id: string;
  name: string;
  status: string;
  createdAt: string;
}

interface ReviewItem {
  id: string;
  spotId: string;
  score: number;
  comment?: string;
  createdAt: string;
}

const BAN_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  active: { label: '正常', className: 'bg-success/20 text-success' },
  suspended: { label: '一時停止', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
  banned: { label: 'BAN', className: 'bg-fresh-red/20 text-fresh-red' },
};

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user: admin } = useAuth();
  const userId = params.id as string;

  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [spots, setSpots] = useState<SpotItem[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);

  // BAN モーダル
  const [showBanModal, setShowBanModal] = useState(false);
  const [banType, setBanType] = useState<'suspended' | 'banned'>('suspended');
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('');
  const [processing, setProcessing] = useState(false);

  // 通知モーダル
  const [showNotifyModal, setShowNotifyModal] = useState(false);
  const [notifyTitle, setNotifyTitle] = useState('');
  const [notifyBody, setNotifyBody] = useState('');
  const [notifySending, setNotifySending] = useState(false);

  const canEdit = admin?.role === 'super_admin' || admin?.role === 'moderator';
  const canDelete = admin?.role === 'super_admin';

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deleting, setDeleting] = useState(false);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (!res.ok) {
        router.push('/users');
        return;
      }
      const data = await res.json();
      setUserDetail(data);
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  const fetchSpots = useCallback(async () => {
    try {
      const res = await fetch(`/api/spots?createdBy=${userId}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setSpots(data.spots || []);
      }
    } catch {
      // スポット取得失敗は無視
    }
  }, [userId]);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${userId}/reviews`);
      if (res.ok) {
        const data = await res.json();
        setReviews(data.reviews || []);
      }
    } catch {
      // レビュー取得失敗は無視
    }
  }, [userId]);

  // 行動ログ
  const [activityLog, setActivityLog] = useState<{ type: string; id: string; detail: string; createdAt: string }[]>([]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch(`/api/users/${userId}/activity`);
      if (res.ok) {
        const data = await res.json();
        setActivityLog(data.activity || []);
      }
    } catch {}
  }, [userId]);

  useEffect(() => {
    fetchUser();
    fetchSpots();
    fetchReviews();
    fetchActivity();
  }, [fetchUser, fetchSpots, fetchReviews, fetchActivity]);

  const handleBan = async () => {
    if (!banReason.trim()) {
      alert('BAN理由を入力してください');
      return;
    }
    setProcessing(true);
    try {
      const body: Record<string, unknown> = {
        type: banType,
        reason: banReason.trim(),
      };
      if (banDuration) {
        const days = parseInt(banDuration);
        if (days > 0) body.durationDays = days;
      }

      const res = await fetch(`/api/users/${userId}/ban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      const updated = await res.json();
      setUserDetail((prev) => (prev ? { ...prev, ...updated } : prev));
      setShowBanModal(false);
      setBanReason('');
      setBanDuration('');
    } finally {
      setProcessing(false);
    }
  };

  const handleSendNotification = async () => {
    if (!notifyTitle.trim() || !notifyBody.trim()) {
      alert('タイトルと本文を入力してください');
      return;
    }
    setNotifySending(true);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: notifyTitle.trim(),
          body: notifyBody.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '通知の送信に失敗しました');
        return;
      }

      alert('通知を送信しました');
      setShowNotifyModal(false);
      setNotifyTitle('');
      setNotifyBody('');
    } finally {
      setNotifySending(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteReason.trim()) {
      alert('削除理由を入力してください');
      return;
    }
    setDeleting(true);
    try {
      const params = new URLSearchParams({ reason: deleteReason.trim() });
      const res = await fetch(`/api/users/${userId}?${params}`, { method: 'DELETE' });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || '削除に失敗しました');
        return;
      }

      alert('ユーザーを削除しました');
      router.push('/users');
    } finally {
      setDeleting(false);
    }
  };

  const handleUnban = async () => {
    if (!confirm('このユーザーのBANを解除しますか？')) return;
    setProcessing(true);
    try {
      const res = await fetch(`/api/users/${userId}/unban`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'エラーが発生しました');
        return;
      }

      const updated = await res.json();
      setUserDetail((prev) =>
        prev
          ? {
              ...prev,
              ...updated,
              banReason: undefined,
              bannedAt: undefined,
              banUntil: undefined,
              bannedBy: undefined,
            }
          : prev
      );
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-text-secondary">読み込み中...</div>;
  }

  if (!userDetail) {
    return <div className="text-center py-12 text-text-secondary">ユーザーが見つかりません</div>;
  }

  const banBadge = BAN_STATUS_BADGE[userDetail.banStatus || 'active'] || BAN_STATUS_BADGE.active;
  const isBanned = userDetail.banStatus === 'suspended' || userDetail.banStatus === 'banned';

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/users')}
          className="px-3 py-1.5 text-sm bg-card border border-border rounded-lg hover:border-accent transition-colors"
        >
          &larr; ユーザー一覧
        </button>
        <h1 className="text-xl font-bold">ユーザー詳細</h1>
      </div>

      {/* プロフィールカード */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {userDetail.photoUrl ? (
              <img
                src={userDetail.photoUrl}
                alt={userDetail.displayName}
                className="w-16 h-16 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-card border-2 border-border flex items-center justify-center text-2xl text-text-secondary">
                {userDetail.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold">{userDetail.displayName}</h2>
              <p className="text-xs text-text-secondary mt-0.5">ID: {userDetail.id}</p>
            </div>
          </div>

          {/* BAN / UNBAN / 通知 / 削除ボタン */}
          {canEdit && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowNotifyModal(true)}
                disabled={processing}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
              >
                通知を送信
              </button>
              {isBanned ? (
                <button
                  onClick={handleUnban}
                  disabled={processing}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-success/15 text-success hover:bg-success/25 disabled:opacity-50 transition-colors"
                >
                  BAN解除
                </button>
              ) : (
                <button
                  onClick={() => setShowBanModal(true)}
                  disabled={processing}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-fresh-red/15 text-fresh-red hover:bg-fresh-red/25 disabled:opacity-50 transition-colors"
                >
                  BAN
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  disabled={processing || deleting}
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-fresh-red text-white hover:bg-fresh-red/80 disabled:opacity-50 transition-colors"
                >
                  削除
                </button>
              )}
            </div>
          )}
        </div>

        {/* ステータス情報 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">BANステータス</p>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${banBadge.className}`}>
              {banBadge.label}
            </span>
          </div>
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">登録日</p>
            <p className="text-sm">
              {userDetail.createdAt ? new Date(userDetail.createdAt).toLocaleDateString('ja-JP') : '-'}
            </p>
          </div>
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">最終ログイン</p>
            <p className="text-sm">
              {userDetail.lastActiveAt
                ? new Date(userDetail.lastActiveAt).toLocaleString('ja-JP')
                : '-'}
            </p>
          </div>
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">起動回数</p>
            <p className="text-sm font-[family-name:var(--font-inter)]">
              {userDetail.launchCount ?? 0}
            </p>
          </div>
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">スポット投稿</p>
            <p className="text-sm font-[family-name:var(--font-inter)]">
              {userDetail.spotCount ?? 0}
            </p>
          </div>
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">写真投稿</p>
            <p className="text-sm font-[family-name:var(--font-inter)]">
              {userDetail.photoCount ?? 0}
            </p>
          </div>
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">OS</p>
            <p className="text-sm">
              {userDetail.lastPlatform ?? '-'}
              {userDetail.lastOsVersion ? ` / ${userDetail.lastOsVersion}` : ''}
            </p>
          </div>
          <div className="bg-card rounded-lg p-3">
            <p className="text-xs text-text-secondary mb-1">端末 / アプリ</p>
            <p className="text-sm truncate">
              {userDetail.lastDeviceModel ?? '-'}
            </p>
            {userDetail.lastAppVersion && (
              <p className="text-xs text-text-secondary mt-0.5">v{userDetail.lastAppVersion}</p>
            )}
          </div>
        </div>

        {/* BAN情報（BANされている場合） */}
        {isBanned && (
          <div className="mt-4 p-4 bg-fresh-red/5 border border-fresh-red/20 rounded-lg">
            <h3 className="text-sm font-medium text-fresh-red mb-2">BAN情報</h3>
            <div className="space-y-1 text-sm">
              <p>
                <span className="text-text-secondary">理由:</span>{' '}
                {userDetail.banReason || '-'}
              </p>
              <p>
                <span className="text-text-secondary">実行日:</span>{' '}
                {userDetail.bannedAt
                  ? new Date(userDetail.bannedAt).toLocaleString('ja-JP')
                  : '-'}
              </p>
              <p>
                <span className="text-text-secondary">期限:</span>{' '}
                {userDetail.banUntil
                  ? new Date(userDetail.banUntil).toLocaleString('ja-JP')
                  : '無期限'}
              </p>
              {userDetail.bannedBy && (
                <p>
                  <span className="text-text-secondary">実行者:</span>{' '}
                  {userDetail.bannedBy}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ユーザーの投稿スポット */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <h3 className="text-base font-bold mb-4">投稿スポット（最新10件）</h3>
        {spots.length === 0 ? (
          <p className="text-sm text-text-secondary">投稿スポットはありません</p>
        ) : (
          <div className="space-y-2">
            {spots.map((spot) => (
              <div
                key={spot.id}
                className="flex items-center justify-between bg-card rounded-lg px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{spot.name}</p>
                  <p className="text-xs text-text-secondary">
                    {spot.createdAt
                      ? new Date(spot.createdAt).toLocaleDateString('ja-JP')
                      : '-'}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-medium ${
                    spot.status === 'active'
                      ? 'bg-success/20 text-success'
                      : spot.status === 'pending'
                        ? 'bg-fresh-yellow/20 text-fresh-yellow'
                        : 'bg-text-secondary/20 text-text-secondary'
                  }`}
                >
                  {spot.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ユーザーのレビュー */}
      <div className="bg-surface border border-border rounded-xl p-6">
        <h3 className="text-base font-bold mb-4">レビュー（最新10件）</h3>
        {reviews.length === 0 ? (
          <p className="text-sm text-text-secondary">レビューはありません</p>
        ) : (
          <div className="space-y-2">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="bg-card rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-fresh-yellow text-sm">
                    {'★'.repeat(review.score)}{'☆'.repeat(5 - review.score)}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {review.createdAt
                      ? new Date(review.createdAt).toLocaleDateString('ja-JP')
                      : '-'}
                  </span>
                </div>
                {review.comment && (
                  <p className="text-sm text-foreground">{review.comment}</p>
                )}
                <p className="text-xs text-text-secondary mt-1">
                  スポットID: {review.spotId}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 行動ログ */}
      <div className="bg-surface border border-border rounded-xl p-6 mb-6">
        <h3 className="text-base font-bold mb-4">行動ログ（最新50件）</h3>
        {activityLog.length === 0 ? (
          <p className="text-sm text-text-secondary">行動履歴はありません</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {activityLog.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 bg-card rounded-lg px-4 py-2.5">
                <span className="text-xs mt-0.5">
                  {entry.type === 'review' ? '💬' : entry.type === 'spot' ? '📍' : '📋'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground truncate">{entry.detail}</p>
                  <p className="text-xs text-text-secondary">
                    {entry.createdAt ? new Date(entry.createdAt).toLocaleString('ja-JP') : '-'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 通知送信モーダル */}
      {showNotifyModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">通知を送信</h3>
            <p className="text-sm text-text-secondary mb-4">
              対象: <span className="text-foreground font-medium">{userDetail.displayName}</span>
            </p>

            {/* タイトル */}
            <label className="block text-sm text-text-secondary mb-1">タイトル（必須）</label>
            <input
              type="text"
              value={notifyTitle}
              onChange={(e) => setNotifyTitle(e.target.value)}
              placeholder="例: Moto-Logos からのお知らせ"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent mb-3"
            />

            {/* 本文 */}
            <label className="block text-sm text-text-secondary mb-1">本文（必須）</label>
            <textarea
              value={notifyBody}
              onChange={(e) => setNotifyBody(e.target.value)}
              placeholder="通知の本文を入力..."
              rows={4}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNotifyModal(false);
                  setNotifyTitle('');
                  setNotifyBody('');
                }}
                className="px-4 py-2 text-sm rounded-lg text-text-secondary hover:text-foreground transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleSendNotification}
                disabled={notifySending || !notifyTitle.trim() || !notifyBody.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent/80 disabled:opacity-50 transition-colors"
              >
                {notifySending ? '送信中...' : '送信'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 削除モーダル */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4 text-fresh-red">ユーザーを削除</h3>
            <p className="text-sm text-text-secondary mb-4">
              対象: <span className="text-foreground font-medium">{userDetail.displayName}</span>
            </p>
            <div className="mb-4 p-3 bg-fresh-red/10 border border-fresh-red/30 rounded-lg text-xs text-fresh-red">
              Firestore の users ドキュメントと Firebase Auth アカウントを削除します。
              投稿済みのスポット・レビューは残存（createdBy は残りますが匿名扱い）。この操作は取り消せません。
            </div>

            <label className="block text-sm text-text-secondary mb-1">削除理由（必須）</label>
            <textarea
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="削除理由を入力..."
              rows={3}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteReason('');
                }}
                className="px-4 py-2 text-sm rounded-lg text-text-secondary hover:text-foreground transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting || !deleteReason.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-fresh-red text-white hover:bg-fresh-red/80 disabled:opacity-50 transition-colors"
              >
                {deleting ? '削除中...' : '削除を実行'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BAN モーダル */}
      {showBanModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-surface border border-border rounded-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-bold mb-4">ユーザーをBANする</h3>
            <p className="text-sm text-text-secondary mb-4">
              対象: <span className="text-foreground font-medium">{userDetail.displayName}</span>
            </p>

            {/* BAN種別 */}
            <label className="block text-sm text-text-secondary mb-1">BAN種別</label>
            <select
              value={banType}
              onChange={(e) => setBanType(e.target.value as 'suspended' | 'banned')}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground mb-3"
            >
              <option value="suspended">一時停止（suspended）</option>
              <option value="banned">永久BAN（banned）</option>
            </select>

            {/* BAN理由 */}
            <label className="block text-sm text-text-secondary mb-1">理由（必須）</label>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="BAN理由を入力..."
              rows={3}
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:border-accent mb-3"
            />

            {/* 期間（日数） */}
            <label className="block text-sm text-text-secondary mb-1">
              期間（日数） — 空欄で無期限
            </label>
            <input
              type="number"
              value={banDuration}
              onChange={(e) => setBanDuration(e.target.value)}
              placeholder="例: 30"
              min="1"
              className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-accent mb-4"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setBanReason('');
                  setBanDuration('');
                }}
                className="px-4 py-2 text-sm rounded-lg text-text-secondary hover:text-foreground transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={handleBan}
                disabled={processing || !banReason.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-fresh-red text-white hover:bg-fresh-red/80 disabled:opacity-50 transition-colors"
              >
                {processing ? '処理中...' : 'BANを実行'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
