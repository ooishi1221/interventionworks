import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth, hasMinimumRole } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { checkNgWords } from '@/lib/ng-words';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────
// Geohash エンコード（座標更新時に自動再計算）
// ─────────────────────────────────────────────────────

function encodeGeohash(lat: number, lng: number, precision = 9): string {
  const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let idx = 0, bit = 0, even = true, hash = '';
  let latRange: [number, number] = [-90, 90];
  let lngRange: [number, number] = [-180, 180];
  while (hash.length < precision) {
    const range = even ? lngRange : latRange;
    const val = even ? lng : lat;
    const mid = (range[0] + range[1]) / 2;
    if (val >= mid) { idx = idx * 2 + 1; range[0] = mid; }
    else { idx = idx * 2; range[1] = mid; }
    even = !even;
    if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const { id } = await context.params;

    const doc = await adminDb.collection(COLLECTIONS.SPOTS).doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'スポットが見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    return NextResponse.json({
      id: doc.id,
      ...data,
      coordinate: data.coordinate
        ? { latitude: data.coordinate.latitude, longitude: data.coordinate.longitude }
        : null,
      updatedAt: data.updatedAt?.toDate().toISOString() || '',
      lastVerifiedAt: data.lastVerifiedAt?.toDate().toISOString() || '',
      createdAt: data.createdAt?.toDate().toISOString() || '',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('moderator');
    const { id } = await context.params;
    const updates = await request.json();

    // ── verificationLevel を 'official' に設定するには super_admin が必要 ──
    if (
      updates.verificationLevel === 'official' &&
      !hasMinimumRole(user.role, 'super_admin')
    ) {
      return NextResponse.json(
        { error: 'official への変更は super_admin のみ許可されています' },
        { status: 403 },
      );
    }

    // ── 許可フィールドのフィルタリング ──
    const allowedScalarFields = ['name', 'status', 'verificationLevel', 'priceInfo', 'openHours', 'isFree', 'pricePerHour', 'parkingCapacity'];
    const filtered: Record<string, unknown> = {};

    for (const key of allowedScalarFields) {
      if (key in updates) filtered[key] = updates[key];
    }

    // ── name フィールドの NG ワードチェック ──
    if (typeof filtered.name === 'string') {
      const ngResult = checkNgWords(filtered.name);
      if (ngResult.blocked) {
        return NextResponse.json(
          { error: `スポット名に不適切な表現が含まれています: ${ngResult.matchedWord}` },
          { status: 400 },
        );
      }
    }

    // payment の処理（cash / icCard / qrCode）
    if (updates.payment) {
      const { cash, icCard, qrCode } = updates.payment;
      filtered.payment = {
        cash: !!cash,
        icCard: !!icCard,
        qrCode: !!qrCode,
      };
    }

    // coordinate の処理（latitude / longitude 必須 → geohash 自動再計算）
    if (updates.coordinate) {
      const { latitude, longitude } = updates.coordinate;
      if (
        typeof latitude !== 'number' || typeof longitude !== 'number' ||
        latitude < -90 || latitude > 90 ||
        longitude < -180 || longitude > 180
      ) {
        return NextResponse.json(
          { error: '座標が不正です（latitude: -90〜90, longitude: -180〜180）' },
          { status: 400 },
        );
      }
      filtered.coordinate = { latitude, longitude };
      filtered.geohash = encodeGeohash(latitude, longitude);
    }

    if (Object.keys(filtered).length === 0) {
      return NextResponse.json({ error: '更新するフィールドがありません' }, { status: 400 });
    }

    const docRef = adminDb.collection(COLLECTIONS.SPOTS).doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return NextResponse.json({ error: 'スポットが見つかりません' }, { status: 404 });
    }

    // ── 以前の状態を記録 ──
    const previousState: Record<string, unknown> = {};
    const data = doc.data()!;
    for (const key of Object.keys(filtered)) {
      if (key === 'coordinate' && data.coordinate) {
        previousState.coordinate = {
          latitude: data.coordinate.latitude,
          longitude: data.coordinate.longitude,
        };
      } else {
        previousState[key] = data[key];
      }
    }

    await docRef.update({
      ...filtered,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // ── verificationLevel 変更時は専用アクションで監査ログを記録 ──
    const action =
      'verificationLevel' in filtered
        ? 'spot.verification_level_change'
        : 'coordinate' in filtered
          ? 'spot.coordinate_update'
          : 'spot.update';

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action,
      targetType: 'spot',
      targetId: id,
      reason: updates.reason,
      previousState,
      newState: filtered,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
