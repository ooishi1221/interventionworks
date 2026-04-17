'use client';

import { useAuth } from '@/components/auth-provider';
import { useCallback, useEffect, useState } from 'react';
import type {
  MapUpdateReviewResponse,
  MapUpdateStatus,
  GeminiAnalysisResult,
} from '@/lib/types';

const STATUS_CONFIG: Record<MapUpdateStatus, { label: string; className: string }> = {
  pending: { label: '未処理', className: 'bg-text-secondary/20 text-text-secondary' },
  analyzed: { label: '解析済み', className: 'bg-fresh-yellow/20 text-fresh-yellow' },
  applied: { label: '適用済み', className: 'bg-success/20 text-success' },
  skipped: { label: 'スキップ', className: 'bg-text-secondary/20 text-text-secondary' },
};

const PHOTO_TAG_LABEL: Record<string, string> = {
  sign: '看板',
  entrance: '入口',
  general: '写真',
};

export default function MapUpdatesPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<MapUpdateReviewResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<MapUpdateStatus | ''>('pending');
  const [error, setError] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<Record<string, Set<string>>>({});

  const isModerator = user?.role === 'moderator' || user?.role === 'super_admin';

  const fetchReviews = useCallback(
    async (cursorId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '20' });
        if (statusFilter) params.set('status', statusFilter);
        if (cursorId) params.set('cursor', cursorId);

        const res = await fetch(`/api/map-updates?${params}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          setError(err.error || `APIエラー (${res.status})`);
          return;
        }
        const data = await res.json();
        const items = data.reviews || [];

        if (cursorId) {
          setReviews((prev) => [...prev, ...items]);
        } else {
          setReviews(items);
        }
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : '通信エラー');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // ── AI解析 ──
  const handleAnalyze = async (reviewId: string) => {
    setAnalyzingId(reviewId);
    try {
      const res = await fetch(`/api/map-updates/${reviewId}/analyze`, {
        method: 'POST',
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'AI解析に失敗しました');
        return;
      }

      // レビューを更新
      setReviews((prev) =>
        prev.map((r) =>
          r.reviewId === reviewId
            ? { ...r, mapUpdateStatus: 'analyzed' as const, mapUpdateAnalysis: data.analysis }
            : r,
        ),
      );

      // 全フィールドをデフォルト選択
      const analysis = data.analysis as GeminiAnalysisResult;
      const fields = new Set<string>();
      if (analysis.priceInfo !== undefined) fields.add('priceInfo');
      if (analysis.openHours !== undefined) fields.add('openHours');
      if (analysis.parkingCapacity !== undefined) fields.add('parkingCapacity');
      if (analysis.isFree !== undefined) fields.add('isFree');
      if (analysis.payment !== undefined) fields.add('payment');
      if (analysis.capacity !== undefined) fields.add('capacity');
      setSelectedFields((prev) => ({ ...prev, [reviewId]: fields }));
      setExpandedId(reviewId);
    } finally {
      setAnalyzingId(null);
    }
  };

  // ── 更新適用 ──
  const handleApply = async (reviewId: string, analysis: GeminiAnalysisResult) => {
    const selected = selectedFields[reviewId];
    if (!selected || selected.size === 0) {
      alert('適用するフィールドを選択してください');
      return;
    }

    setApplyingId(reviewId);
    try {
      const fields: Record<string, unknown> = {};
      if (selected.has('priceInfo') && analysis.priceInfo !== undefined) fields.priceInfo = analysis.priceInfo;
      if (selected.has('openHours') && analysis.openHours !== undefined) fields.openHours = analysis.openHours;
      if (selected.has('parkingCapacity') && analysis.parkingCapacity !== undefined) fields.parkingCapacity = analysis.parkingCapacity;
      if (selected.has('isFree') && analysis.isFree !== undefined) fields.isFree = analysis.isFree;
      if (selected.has('payment') && analysis.payment !== undefined) fields.payment = analysis.payment;
      if (selected.has('capacity') && analysis.capacity !== undefined) fields.capacity = analysis.capacity;

      const res = await fetch(`/api/map-updates/${reviewId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '更新に失敗しました');
        return;
      }

      setReviews((prev) =>
        prev.map((r) =>
          r.reviewId === reviewId ? { ...r, mapUpdateStatus: 'applied' as const } : r,
        ),
      );
      setExpandedId(null);
    } finally {
      setApplyingId(null);
    }
  };

  // ── スキップ ──
  const handleSkip = async (reviewId: string) => {
    const res = await fetch(`/api/map-updates/${reviewId}/skip`, {
      method: 'POST',
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'スキップに失敗しました');
      return;
    }

    setReviews((prev) =>
      prev.map((r) =>
        r.reviewId === reviewId ? { ...r, mapUpdateStatus: 'skipped' as const } : r,
      ),
    );
    setExpandedId(null);
  };

  // ── フィールド選択トグル ──
  const toggleField = (reviewId: string, field: string) => {
    setSelectedFields((prev) => {
      const current = prev[reviewId] || new Set<string>();
      const next = new Set(current);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return { ...prev, [reviewId]: next };
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">地図更新</h1>
          <p className="text-text-secondary text-sm mt-1">
            ユーザー写真からAI解析でスポット情報を更新
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as MapUpdateStatus | '')}
          className="px-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
        >
          <option value="">全ステータス</option>
          <option value="pending">未処理</option>
          <option value="analyzed">解析済み</option>
          <option value="applied">適用済み</option>
          <option value="skipped">スキップ</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 mb-4">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      {/* List */}
      {reviews.length === 0 && !loading && !error ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <p className="text-text-secondary">写真付きレビューがありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.reviewId} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start gap-4">
                {/* Photo thumbnail */}
                {r.photoUrls.length > 0 && (
                  <a
                    href={r.photoUrls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0"
                  >
                    <img
                      src={r.photoUrls[0]}
                      alt="レビュー写真"
                      className="w-24 h-24 object-cover rounded border border-border"
                    />
                  </a>
                )}

                <div className="flex-1 min-w-0">
                  {/* Badges */}
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[r.mapUpdateStatus].className}`}
                    >
                      {STATUS_CONFIG[r.mapUpdateStatus].label}
                    </span>
                    {r.photoTag && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-fresh-blue/20 text-fresh-blue">
                        {PHOTO_TAG_LABEL[r.photoTag] || r.photoTag}
                      </span>
                    )}
                    {r.score === 1 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-success/20 text-success">
                        停めた
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-danger/20 text-danger">
                        停められなかった
                      </span>
                    )}
                  </div>

                  {/* Spot name */}
                  <p className="text-sm font-medium text-foreground mb-1">{r.spotName}</p>

                  {/* Comment */}
                  {r.comment && (
                    <p className="text-sm text-text-secondary mb-2">{r.comment}</p>
                  )}

                  {/* Meta */}
                  <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                    <span>User: {r.userId.slice(0, 8)}...</span>
                    <span>{new Date(r.createdAt).toLocaleString('ja-JP')}</span>
                  </div>
                </div>

                {/* Actions */}
                {isModerator && (
                  <div className="flex flex-col gap-1 shrink-0">
                    {r.mapUpdateStatus === 'pending' && (
                      <>
                        <button
                          onClick={() => handleAnalyze(r.reviewId)}
                          disabled={analyzingId === r.reviewId}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-50 transition-colors"
                        >
                          {analyzingId === r.reviewId ? '解析中...' : 'AI解析'}
                        </button>
                        <button
                          onClick={() => handleSkip(r.reviewId)}
                          className="px-3 py-1.5 text-xs font-medium rounded-md bg-text-secondary/15 text-text-secondary hover:bg-text-secondary/25 transition-colors"
                        >
                          スキップ
                        </button>
                      </>
                    )}
                    {r.mapUpdateStatus === 'analyzed' && (
                      <button
                        onClick={() =>
                          setExpandedId(expandedId === r.reviewId ? null : r.reviewId)
                        }
                        className="px-3 py-1.5 text-xs font-medium rounded-md bg-fresh-yellow/15 text-fresh-yellow hover:bg-fresh-yellow/25 transition-colors"
                      >
                        {expandedId === r.reviewId ? '閉じる' : '詳細確認'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Expanded analysis panel */}
              {expandedId === r.reviewId && r.mapUpdateAnalysis && (
                <AnalysisPanel
                  reviewId={r.reviewId}
                  analysis={r.mapUpdateAnalysis}
                  currentSpot={r.currentSpot}
                  selectedFields={selectedFields[r.reviewId] || new Set()}
                  onToggleField={(field) => toggleField(r.reviewId, field)}
                  onApply={() => handleApply(r.reviewId, r.mapUpdateAnalysis!)}
                  onSkip={() => handleSkip(r.reviewId)}
                  applying={applyingId === r.reviewId}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={() => cursor && fetchReviews(cursor)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-card border border-border rounded-lg hover:bg-surface disabled:opacity-50 transition-colors"
          >
            {loading ? '読み込み中...' : 'もっと読み込む'}
          </button>
        </div>
      )}

      {loading && reviews.length === 0 && (
        <div className="text-center py-12 text-text-secondary">読み込み中...</div>
      )}
    </div>
  );
}

// ─── 解析結果パネル ───────────────────────────────────

interface AnalysisPanelProps {
  reviewId: string;
  analysis: GeminiAnalysisResult;
  currentSpot?: MapUpdateReviewResponse['currentSpot'];
  selectedFields: Set<string>;
  onToggleField: (field: string) => void;
  onApply: () => void;
  onSkip: () => void;
  applying: boolean;
}

function AnalysisPanel({
  analysis,
  currentSpot,
  selectedFields,
  onToggleField,
  onApply,
  onSkip,
  applying,
}: AnalysisPanelProps) {
  const confidenceColor =
    analysis.confidence >= 0.8
      ? 'text-success'
      : analysis.confidence >= 0.5
        ? 'text-fresh-yellow'
        : 'text-danger';

  const fields: {
    key: string;
    label: string;
    newValue: string | undefined;
    currentValue: string | undefined;
  }[] = [];

  if (analysis.priceInfo !== undefined) {
    fields.push({
      key: 'priceInfo',
      label: '料金',
      newValue: analysis.priceInfo,
      currentValue: currentSpot?.priceInfo || '未設定',
    });
  }
  if (analysis.openHours !== undefined) {
    fields.push({
      key: 'openHours',
      label: '営業時間',
      newValue: analysis.openHours,
      currentValue: currentSpot?.openHours || '未設定',
    });
  }
  if (analysis.parkingCapacity !== undefined) {
    fields.push({
      key: 'parkingCapacity',
      label: '台数',
      newValue: String(analysis.parkingCapacity),
      currentValue: currentSpot?.parkingCapacity ? String(currentSpot.parkingCapacity) : '未設定',
    });
  }
  if (analysis.isFree !== undefined) {
    fields.push({
      key: 'isFree',
      label: '無料',
      newValue: analysis.isFree ? 'はい' : 'いいえ',
      currentValue: currentSpot?.isFree !== undefined ? (currentSpot.isFree ? 'はい' : 'いいえ') : '未設定',
    });
  }
  if (analysis.payment) {
    const p = analysis.payment;
    const payStr = [p.cash && '現金', p.icCard && 'IC', p.qrCode && 'QR'].filter(Boolean).join(', ') || 'なし';
    const cp = currentSpot?.payment;
    const cpStr = cp
      ? [cp.cash && '現金', cp.icCard && 'IC', cp.qrCode && 'QR'].filter(Boolean).join(', ') || 'なし'
      : '未設定';
    fields.push({ key: 'payment', label: '支払方法', newValue: payStr, currentValue: cpStr });
  }
  if (analysis.capacity) {
    const c = analysis.capacity;
    const capStr = c.isLargeOk
      ? '大型OK'
      : c.upTo400
        ? '400cc以下'
        : c.upTo125
          ? '125cc以下'
          : c.is50only
            ? '原付のみ'
            : '不明';
    const cc = currentSpot?.capacity;
    const ccStr = cc
      ? cc.isLargeOk
        ? '大型OK'
        : cc.upTo400
          ? '400cc以下'
          : cc.upTo125
            ? '125cc以下'
            : cc.is50only
              ? '原付のみ'
              : '不明'
      : '未設定';
    fields.push({ key: 'capacity', label: '排気量', newValue: capStr, currentValue: ccStr });
  }

  return (
    <div className="mt-4 pt-4 border-t border-border">
      {/* Confidence */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs text-text-secondary">AI確信度:</span>
        <span className={`text-sm font-medium ${confidenceColor}`}>
          {Math.round(analysis.confidence * 100)}%
        </span>
      </div>

      {/* Comparison table */}
      {fields.length > 0 ? (
        <div className="space-y-2 mb-4">
          <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 text-xs">
            <div className="text-text-secondary font-medium px-1">適用</div>
            <div className="text-text-secondary font-medium">項目</div>
            <div className="text-text-secondary font-medium">現在</div>
            <div className="text-text-secondary font-medium">AI解析</div>
          </div>
          {fields.map((f) => {
            const changed = f.newValue !== f.currentValue;
            return (
              <div
                key={f.key}
                className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 text-sm items-center"
              >
                <div className="px-1">
                  <input
                    type="checkbox"
                    checked={selectedFields.has(f.key)}
                    onChange={() => onToggleField(f.key)}
                    className="rounded border-border"
                  />
                </div>
                <div className="text-text-secondary">{f.label}</div>
                <div className="text-foreground/60">{f.currentValue}</div>
                <div className={changed ? 'text-accent font-medium' : 'text-foreground'}>
                  {f.newValue}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-secondary mb-4">
          写真から抽出できる情報がありませんでした
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onApply}
          disabled={applying || selectedFields.size === 0}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-light disabled:opacity-50 transition-colors"
        >
          {applying ? '更新中...' : '選択項目を更新'}
        </button>
        <button
          onClick={onSkip}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-text-secondary/15 text-text-secondary hover:bg-text-secondary/25 transition-colors"
        >
          スキップ
        </button>
      </div>
    </div>
  );
}
