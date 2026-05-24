'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/components/auth-provider';

type Tab = 'anomalies' | 'multi' | 'photos' | 'appeals';

interface Anomaly {
  type: string;
  userId: string;
  detail: string;
  count: number;
  createdAt: string;
}

interface Suspect {
  userIdA: string;
  nameA: string;
  userIdB: string;
  nameB: string;
  reason: string;
  sharedSpots: number;
}

interface BanEvasion {
  bannedUserId: string;
  bannedUserName: string;
  banStatus: string;
  evasionUserId: string;
  evasionUserName: string;
  deviceId: string;
  reason: string;
}

interface PhotoItem {
  reviewId: string;
  spotId: string;
  spotName: string;
  userId: string;
  photoUrls: string[];
  score: number;
  comment: string | null;
  photoModeration: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface Appeal {
  id: string;
  userId: string;
  displayName: string;
  reason: string;
  status: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewNote: string | null;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'anomalies', label: '異常検知' },
  { id: 'multi', label: '複数アカウント' },
  { id: 'photos', label: '写真確認' },
  { id: 'appeals', label: 'BAN解除申請' },
];

const ANOMALY_TYPE: Record<string, { label: string; color: string }> = {
  spam: { label: 'スパム', color: 'text-fresh-red' },
  high_frequency: { label: '高頻度', color: 'text-fresh-yellow' },
  suspicious_score: { label: '評価操作疑い', color: 'text-accent' },
};

export default function SecurityPage() {
  const { user } = useAuth();
  const canEdit = user?.role === 'super_admin' || user?.role === 'moderator';
  const [tab, setTab] = useState<Tab>('anomalies');

  // Anomalies
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [anomLoading, setAnomLoading] = useState(false);

  // Multi-account
  const [suspects, setSuspects] = useState<Suspect[]>([]);
  const [multiLoading, setMultiLoading] = useState(false);

  // Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);

  // Photos moderation
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);
  const [photoProcessing, setPhotoProcessing] = useState<string | null>(null);
  const [photoFilter, setPhotoFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);

  // Appeals
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [appealsLoading, setAppealsLoading] = useState(false);
  const [appealProcessing, setAppealProcessing] = useState<string | null>(null);

  const loadAnomalies = useCallback(async () => {
    setAnomLoading(true);
    try {
      const res = await fetch('/api/moderation/anomalies');
      if (res.ok) setAnomalies((await res.json()).anomalies || []);
    } finally { setAnomLoading(false); }
  }, []);

  const loadMulti = useCallback(async () => {
    setMultiLoading(true);
    try {
      const res = await fetch('/api/moderation/multi-account');
      if (res.ok) setSuspects((await res.json()).suspects || []);
    } finally { setMultiLoading(false); }
  }, []);

  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true);
    try {
      const res = await fetch(`/api/moderation/photos?limit=30&status=${photoFilter}`);
      if (res.ok) setPhotos((await res.json()).photos || []);
    } finally { setPhotosLoading(false); }
  }, [photoFilter]);

  const loadPhotoCount = useCallback(async () => {
    try {
      const res = await fetch('/api/moderation/photos?count=true&status=pending');
      if (res.ok) {
        const data = await res.json();
        setPendingPhotoCount(data.count || 0);
      }
    } catch { /* ignore */ }
  }, []);

  const loadAppeals = useCallback(async () => {
    setAppealsLoading(true);
    try {
      const res = await fetch('/api/moderation/appeals?status=pending');
      if (res.ok) setAppeals((await res.json()).appeals || []);
    } finally { setAppealsLoading(false); }
  }, []);

  // Load photo count on mount for badge
  useEffect(() => { loadPhotoCount(); }, [loadPhotoCount]);

  useEffect(() => {
    if (tab === 'anomalies') loadAnomalies();
    if (tab === 'multi') loadMulti();
    if (tab === 'photos') loadPhotos();
    if (tab === 'appeals') loadAppeals();
  }, [tab, loadAnomalies, loadMulti, loadPhotos, loadAppeals]);

  // Reload photos when filter changes
  useEffect(() => {
    if (tab === 'photos') loadPhotos();
  }, [photoFilter, tab, loadPhotos]);

  const handleAppeal = async (appealId: string, action: 'approve' | 'reject') => {
    const note = action === 'reject' ? prompt('却下理由を入力:') : null;
    if (action === 'reject' && note === null) return;

    setAppealProcessing(appealId);
    try {
      const res = await fetch('/api/moderation/appeals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appealId, action, note }),
      });
      if (res.ok) {
        setAppeals((prev) => prev.filter((a) => a.id !== appealId));
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } finally {
      setAppealProcessing(null);
    }
  };

  const handlePhotoAction = async (reviewId: string, action: 'approve' | 'reject') => {
    if (action === 'reject' && !confirm('この写真を削除しますか？（レビューから写真が除去されます）')) return;

    setPhotoProcessing(reviewId);
    try {
      const res = await fetch('/api/moderation/photos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, action }),
      });
      if (res.ok) {
        setPhotos((prev) => prev.filter((p) => p.reviewId !== reviewId));
        setPendingPhotoCount((c) => Math.max(0, c - 1));
        setSelectedPhoto(null);
      } else {
        const data = await res.json();
        alert(data.error || '操作に失敗しました');
      }
    } finally {
      setPhotoProcessing(null);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">セキュリティ & モデレーション</h1>

      {/* タブ */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'text-accent border-accent'
                : 'text-text-secondary border-transparent hover:text-foreground'
            }`}
          >
            {t.label}
            {t.id === 'photos' && pendingPhotoCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-accent/20 text-accent rounded-full">
                {pendingPhotoCount}
              </span>
            )}
            {t.id === 'appeals' && appeals.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-fresh-red/20 text-fresh-red rounded-full">
                {appeals.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 異常検知 */}
      {tab === 'anomalies' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-text-secondary">直近24時間のレビュー投稿パターンを分析</p>
            <button onClick={loadAnomalies} disabled={anomLoading} className="text-xs text-accent hover:underline disabled:opacity-50">
              {anomLoading ? '分析中...' : '再分析'}
            </button>
          </div>
          {anomalies.length === 0 ? (
            <p className="text-sm text-text-secondary py-8 text-center">異常は検出されませんでした</p>
          ) : (
            <div className="space-y-2">
              {anomalies.map((a, i) => {
                const meta = ANOMALY_TYPE[a.type] || { label: a.type, color: 'text-text-secondary' };
                return (
                  <div key={i} className="flex items-start gap-3 bg-card rounded-lg px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.color} bg-current/10`}>
                      {meta.label}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm">{a.detail}</p>
                      <p className="text-xs text-text-secondary mt-1">
                        ユーザー: {a.userId.slice(0, 12)}... / {a.createdAt ? new Date(a.createdAt).toLocaleString('ja-JP') : '-'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 複数アカウント */}
      {tab === 'multi' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-text-secondary">レビュー対象スポットの重複パターンから自作自演を検出</p>
            <button onClick={loadMulti} disabled={multiLoading} className="text-xs text-accent hover:underline disabled:opacity-50">
              {multiLoading ? '分析中...' : '再分析'}
            </button>
          </div>
          {suspects.length === 0 ? (
            <p className="text-sm text-text-secondary py-8 text-center">疑わしいペアは検出されませんでした</p>
          ) : (
            <div className="space-y-2">
              {suspects.map((s, i) => (
                <div key={i} className="bg-card rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{s.nameA}</span>
                    <span className="text-text-secondary text-xs">&harr;</span>
                    <span className="text-sm font-medium">{s.nameB}</span>
                  </div>
                  <p className="text-xs text-text-secondary">{s.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 写真確認 */}
      {tab === 'photos' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <p className="text-xs text-text-secondary">写真付きレビューの目視確認キュー</p>
              <div className="flex gap-1">
                {(['pending', 'approved', 'rejected'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setPhotoFilter(f)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      photoFilter === f
                        ? f === 'pending'
                          ? 'bg-accent/20 text-accent'
                          : f === 'approved'
                          ? 'bg-success/20 text-success'
                          : 'bg-fresh-red/20 text-fresh-red'
                        : 'bg-card text-text-secondary hover:text-foreground'
                    }`}
                  >
                    {f === 'pending' ? '未審査' : f === 'approved' ? '承認済' : '削除済'}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={loadPhotos} disabled={photosLoading} className="text-xs text-accent hover:underline disabled:opacity-50">
              {photosLoading ? '読み込み中...' : '更新'}
            </button>
          </div>
          {photos.length === 0 ? (
            <p className="text-sm text-text-secondary py-8 text-center">
              {photoFilter === 'pending' ? '未審査の写真はありません' : photoFilter === 'approved' ? '承認済みの写真はありません' : '削除済みの写真はありません'}
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {photos.map((p) => (
                <div key={p.reviewId} className="bg-card rounded-lg overflow-hidden group relative">
                  {p.photoUrls[0] ? (
                    <button
                      type="button"
                      className="w-full"
                      onClick={() => setSelectedPhoto(p)}
                    >
                      <img
                        src={p.photoUrls[0]}
                        alt="review photo"
                        className="w-full h-36 object-cover transition-opacity group-hover:opacity-80"
                        loading="lazy"
                      />
                      {p.photoUrls.length > 1 && (
                        <span className="absolute top-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                          +{p.photoUrls.length - 1}
                        </span>
                      )}
                    </button>
                  ) : (
                    <div className="w-full h-36 bg-border/30 flex items-center justify-center text-text-secondary text-xs">
                      写真削除済
                    </div>
                  )}
                  <div className="p-2">
                    <p className="text-xs font-medium truncate">{p.spotName}</p>
                    <p className="text-xs text-text-secondary">
                      {p.createdAt ? new Date(p.createdAt).toLocaleDateString('ja-JP') : '-'}
                    </p>
                    <p className="text-xs text-text-secondary truncate">
                      ID: {p.userId.slice(0, 10)}...
                    </p>
                    {p.comment && <p className="text-xs text-text-secondary truncate mt-0.5">{p.comment}</p>}
                  </div>
                  {/* アクションボタン — pending のみ表示 */}
                  {canEdit && photoFilter === 'pending' && (
                    <div className="flex border-t border-border">
                      <button
                        onClick={() => handlePhotoAction(p.reviewId, 'approve')}
                        disabled={photoProcessing === p.reviewId}
                        className="flex-1 py-2 text-xs font-medium text-success hover:bg-success/10 transition-colors disabled:opacity-50"
                      >
                        {photoProcessing === p.reviewId ? '...' : '承認'}
                      </button>
                      <div className="w-px bg-border" />
                      <button
                        onClick={() => handlePhotoAction(p.reviewId, 'reject')}
                        disabled={photoProcessing === p.reviewId}
                        className="flex-1 py-2 text-xs font-medium text-fresh-red hover:bg-fresh-red/10 transition-colors disabled:opacity-50"
                      >
                        {photoProcessing === p.reviewId ? '...' : '削除'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 写真拡大モーダル */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="bg-surface rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 写真スライド */}
            <div className="flex gap-2 p-4 overflow-x-auto">
              {selectedPhoto.photoUrls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={`photo ${i + 1}`}
                  className="h-64 rounded-lg object-contain flex-shrink-0"
                />
              ))}
            </div>
            {/* 詳細 */}
            <div className="px-4 pb-2 space-y-1">
              <p className="text-sm font-medium">{selectedPhoto.spotName}</p>
              <p className="text-xs text-text-secondary">ユーザー: {selectedPhoto.userId}</p>
              <p className="text-xs text-text-secondary">
                投稿日: {selectedPhoto.createdAt ? new Date(selectedPhoto.createdAt).toLocaleString('ja-JP') : '-'}
              </p>
              {selectedPhoto.comment && (
                <p className="text-sm text-text-secondary mt-1">{selectedPhoto.comment}</p>
              )}
            </div>
            {/* アクション */}
            <div className="flex gap-3 p-4 border-t border-border">
              {canEdit && selectedPhoto.photoModeration === 'pending' ? (
                <>
                  <button
                    onClick={() => handlePhotoAction(selectedPhoto.reviewId, 'approve')}
                    disabled={photoProcessing === selectedPhoto.reviewId}
                    className="flex-1 py-2.5 text-sm font-medium text-success bg-success/10 hover:bg-success/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    承認
                  </button>
                  <button
                    onClick={() => handlePhotoAction(selectedPhoto.reviewId, 'reject')}
                    disabled={photoProcessing === selectedPhoto.reviewId}
                    className="flex-1 py-2.5 text-sm font-medium text-fresh-red bg-fresh-red/10 hover:bg-fresh-red/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    削除
                  </button>
                </>
              ) : (
                <p className="text-xs text-text-secondary">
                  {selectedPhoto.photoModeration === 'approved' ? '承認済み' : selectedPhoto.photoModeration === 'rejected' ? '削除済み' : ''}
                </p>
              )}
              <button
                onClick={() => setSelectedPhoto(null)}
                className="px-4 py-2.5 text-sm text-text-secondary hover:text-foreground transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BAN解除申請 */}
      {tab === 'appeals' && (
        <div className="bg-surface border border-border rounded-xl p-6">
          <p className="text-xs text-text-secondary mb-4">BANされたユーザーからの解除申請</p>
          {appeals.length === 0 ? (
            <p className="text-sm text-text-secondary py-8 text-center">審査待ちの申請はありません</p>
          ) : (
            <div className="space-y-3">
              {appeals.map((a) => (
                <div key={a.id} className="bg-card rounded-lg px-4 py-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium">{a.displayName || a.userId.slice(0, 12)}</p>
                      <p className="text-xs text-text-secondary mt-1">
                        申請日: {a.createdAt ? new Date(a.createdAt).toLocaleString('ja-JP') : '-'}
                      </p>
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAppeal(a.id, 'approve')}
                          disabled={appealProcessing === a.id}
                          className="px-3 py-1.5 text-xs font-medium text-success hover:bg-success/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          承認
                        </button>
                        <button
                          onClick={() => handleAppeal(a.id, 'reject')}
                          disabled={appealProcessing === a.id}
                          className="px-3 py-1.5 text-xs font-medium text-fresh-red hover:bg-fresh-red/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          却下
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 p-3 bg-surface rounded-lg">
                    <p className="text-sm">{a.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
