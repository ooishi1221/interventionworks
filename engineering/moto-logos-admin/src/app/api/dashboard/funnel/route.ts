import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS } from '@/lib/types';

/**
 * GET /api/dashboard/funnel
 *
 * コンバージョンファネル分析。
 * 過去30日間のユーザー行動を5段階のファネルに分解して返す。
 *
 * Stage 1: アプリ起動 — user_activity に記録があるユニークユーザー数
 * Stage 2: マップ閲覧 — viewCount が記録されたスポットを閲覧したユーザー
 * Stage 3: スポット詳細閲覧 — スポット詳細を閲覧したユーザー（reviews or validations に足跡）
 * Stage 4: 足跡投稿 — レビューまたは報告を残したユーザー
 * Stage 5: 再訪問 — 2日以上アクティビティのあるユーザー
 */
export async function GET() {
  try {
    await requireAuth();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

    // 過去30日間のアクティビティを取得
    const [activitySnap, reviewsSnap, validationsSnap] = await Promise.all([
      adminDb
        .collection(COLLECTIONS.USER_ACTIVITY)
        .where('date', '>=', thirtyDaysAgoStr)
        .get(),
      adminDb
        .collection(COLLECTIONS.REVIEWS)
        .orderBy('createdAt', 'desc')
        .limit(2000)
        .get(),
      adminDb
        .collection(COLLECTIONS.VALIDATIONS)
        .orderBy('createdAt', 'desc')
        .limit(2000)
        .get(),
    ]);

    // Stage 1: アプリ起動 — user_activity のユニークユーザー
    const appOpenUsers = new Set<string>();
    // Stage 5 用: ユーザーごとのアクティブ日数
    const userDays = new Map<string, Set<string>>();

    for (const doc of activitySnap.docs) {
      const data = doc.data();
      const userId = (data.userId || data.deviceId) as string;
      const date = data.date as string;
      if (!userId) continue;

      appOpenUsers.add(userId);

      if (!userDays.has(userId)) userDays.set(userId, new Set());
      userDays.get(userId)!.add(date);
    }

    // Stage 2: マップ閲覧 — viewCount がインクリメントされたことがあるユーザー
    // user_activity にアクションタイプが含まれる場合はそれを使う
    // なければ、アプリ起動ユーザー全員がマップを見ていると仮定
    // （アプリのメイン画面がマップのため）
    const mapViewUsers = new Set(appOpenUsers);

    // Stage 3: スポット詳細閲覧 — validations に記録があるか、reviews に記録があるユーザー
    // (スポット詳細を開かないと投票・レビューはできない)
    const spotDetailUsers = new Set<string>();

    const thirtyDaysAgoDate = thirtyDaysAgo;

    for (const doc of validationsSnap.docs) {
      const data = doc.data();
      const userId = data.userId as string;
      const createdAt = data.createdAt?.toDate?.();
      if (!userId) continue;
      if (createdAt && createdAt >= thirtyDaysAgoDate) {
        spotDetailUsers.add(userId);
      }
    }

    // Stage 4: 足跡投稿 — レビューまたは報告を残したユーザー
    const footprintUsers = new Set<string>();

    for (const doc of reviewsSnap.docs) {
      const data = doc.data();
      const userId = data.userId as string;
      const createdAt = data.createdAt?.toDate?.();
      if (!userId) continue;
      if (createdAt && createdAt >= thirtyDaysAgoDate) {
        spotDetailUsers.add(userId); // スポット詳細も閲覧済みとみなす
        footprintUsers.add(userId);
      }
    }

    // Stage 5: 再訪問 — 2日以上のアクティビティ日がある
    const returnUsers = new Set<string>();
    for (const [userId, days] of userDays.entries()) {
      if (days.size >= 2) {
        returnUsers.add(userId);
      }
    }

    const funnel = [
      { stage: 1, label: 'アプリ起動', count: appOpenUsers.size },
      { stage: 2, label: 'マップ閲覧', count: mapViewUsers.size },
      { stage: 3, label: 'スポット詳細', count: spotDetailUsers.size },
      { stage: 4, label: '足跡投稿', count: footprintUsers.size },
      { stage: 5, label: '再訪問', count: returnUsers.size },
    ];

    return NextResponse.json({
      funnel,
      period: '過去30日間',
      periodStart: thirtyDaysAgoStr,
      periodEnd: new Date().toISOString().slice(0, 10),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
