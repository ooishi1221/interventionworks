import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/moderation/multi-account
 *
 * 複数アカウント検知 + BAN回避検知。
 *
 * 1) レビュー対象スポットの重複パターンから自作自演を検出
 * 2) push_tokens の deviceId を使い、BANユーザーの端末が別アカウントで
 *    活動していないかを検出（BAN回避検知）
 */
export async function GET() {
  try {
    await requireAuth();

    // 全ユーザーと全トークンを取得
    const [usersSnap, tokensSnap] = await Promise.all([
      adminDb.collection(COLLECTIONS.USERS).get(),
      adminDb.collection(COLLECTIONS.PUSH_TOKENS).get(),
    ]);

    const userNames = new Map<string, string>();
    const userBanStatus = new Map<string, string>();

    for (const d of usersSnap.docs) {
      const data = d.data();
      userNames.set(d.id, data.displayName || d.id);
      if (data.banStatus && data.banStatus !== 'active') {
        userBanStatus.set(d.id, data.banStatus);
      }
    }

    // ─────────────────────────────────────────────────
    // BAN回避検知: deviceId → userId[] のマッピングを構築
    // BANされたユーザーの deviceId が別アカウントにも紐付いていれば検出
    // ─────────────────────────────────────────────────

    interface BanEvasion {
      bannedUserId: string;
      bannedUserName: string;
      banStatus: string;
      evasionUserId: string;
      evasionUserName: string;
      deviceId: string;
      reason: string;
    }

    const deviceToUsers = new Map<string, Set<string>>();
    for (const d of tokensSnap.docs) {
      const data = d.data();
      const deviceId = data.deviceId || d.id;
      const userId = data.userId as string | undefined;
      if (!userId) continue;
      if (!deviceToUsers.has(deviceId)) deviceToUsers.set(deviceId, new Set());
      deviceToUsers.get(deviceId)!.add(userId);
    }

    // user_activity からも deviceId → userId のマッピングを収集
    // （push_tokens に登録していなくてもアクティビティで紐付く場合がある）
    const activitySnap = await adminDb
      .collection(COLLECTIONS.USER_ACTIVITY)
      .orderBy('date', 'desc')
      .limit(2000)
      .get();

    for (const d of activitySnap.docs) {
      const data = d.data();
      const deviceId = data.deviceId as string | undefined;
      const userId = data.userId as string | undefined;
      if (!deviceId || !userId) continue;
      if (!deviceToUsers.has(deviceId)) deviceToUsers.set(deviceId, new Set());
      deviceToUsers.get(deviceId)!.add(userId);
    }

    const banEvasions: BanEvasion[] = [];
    const checkedEvasion = new Set<string>();

    for (const [deviceId, userIds] of deviceToUsers.entries()) {
      if (userIds.size < 2) continue;

      // このデバイスに紐付くBANユーザーを探す
      const bannedOnDevice: string[] = [];
      const activeOnDevice: string[] = [];

      for (const uid of userIds) {
        if (userBanStatus.has(uid)) {
          bannedOnDevice.push(uid);
        } else {
          activeOnDevice.push(uid);
        }
      }

      // BANユーザーの端末で別のアクティブアカウントが存在する場合
      for (const bannedUid of bannedOnDevice) {
        for (const activeUid of activeOnDevice) {
          const key = [bannedUid, activeUid].sort().join('_');
          if (checkedEvasion.has(key)) continue;
          checkedEvasion.add(key);

          banEvasions.push({
            bannedUserId: bannedUid,
            bannedUserName: userNames.get(bannedUid) || bannedUid.slice(0, 8),
            banStatus: userBanStatus.get(bannedUid) || 'unknown',
            evasionUserId: activeUid,
            evasionUserName: userNames.get(activeUid) || activeUid.slice(0, 8),
            deviceId: deviceId.slice(0, 12) + '...',
            reason: `BAN済みユーザー「${userNames.get(bannedUid) || bannedUid.slice(0, 8)}」(${userBanStatus.get(bannedUid)})と同一端末で活動`,
          });
        }
      }
    }

    banEvasions.sort((a, b) => a.bannedUserId.localeCompare(b.bannedUserId));

    // ─────────────────────────────────────────────────
    // 複数アカウント検知: レビュー対象の重複パターン分析
    // ─────────────────────────────────────────────────

    // 直近のレビューからユーザーの投稿パターンを分析
    const recentReviews = await adminDb
      .collection(COLLECTIONS.REVIEWS)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    interface SuspectPair {
      userIdA: string;
      nameA: string;
      userIdB: string;
      nameB: string;
      reason: string;
      sharedSpots: number;
    }

    const suspects: SuspectPair[] = [];
    const checked = new Set<string>();

    // ユーザーペア間で共通レビュースポットが多い場合を検出
    const userSpots = new Map<string, Set<string>>();
    for (const d of recentReviews.docs) {
      const data = d.data();
      const uid = data.userId as string;
      const sid = data.spotId as string;
      if (!userSpots.has(uid)) userSpots.set(uid, new Set());
      userSpots.get(uid)!.add(sid);
    }

    const userIds = [...userSpots.keys()];
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const a = userIds[i], b = userIds[j];
        const key = [a, b].sort().join('_');
        if (checked.has(key)) continue;
        checked.add(key);

        const spotsA = userSpots.get(a)!;
        const spotsB = userSpots.get(b)!;
        let shared = 0;
        for (const s of spotsA) {
          if (spotsB.has(s)) shared++;
        }

        // 共通スポットが5件以上 & 両方のレビュー総数の50%以上が重複
        const overlapRatio = shared / Math.min(spotsA.size, spotsB.size);
        if (shared >= 5 && overlapRatio >= 0.5) {
          suspects.push({
            userIdA: a,
            nameA: userNames.get(a) || a.slice(0, 8),
            userIdB: b,
            nameB: userNames.get(b) || b.slice(0, 8),
            reason: `レビュー対象スポットの${Math.round(overlapRatio * 100)}%が重複（${shared}件共通）`,
            sharedSpots: shared,
          });
        }
      }
    }

    suspects.sort((a, b) => b.sharedSpots - a.sharedSpots);

    return NextResponse.json({
      suspects,
      banEvasions,
      total: suspects.length,
      totalBanEvasions: banEvasions.length,
      analyzedUsers: userIds.length,
      analyzedReviews: recentReviews.size,
      analyzedDevices: deviceToUsers.size,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
