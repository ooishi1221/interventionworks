import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// ─────────────────────────────────────────────────────
// 鮮度カテゴリの閾値
// ─────────────────────────────────────────────────────

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

interface FreshnessSpot {
  id: string;
  name: string;
  address?: string;
  status: string;
  updatedAt: string;
}

interface FreshnessCategory {
  label: string;
  count: number;
  spots: FreshnessSpot[];
}

// ─────────────────────────────────────────────────────
// GET: 鮮度カテゴリ別スポット取得
// ─────────────────────────────────────────────────────

export async function GET() {
  try {
    await requireAuth();

    const sixMonthsAgo = Timestamp.fromDate(monthsAgo(6));
    const threeMonthsAgo = Timestamp.fromDate(monthsAgo(3));
    const oneMonthAgo = Timestamp.fromDate(monthsAgo(1));

    // updatedAt が 1ヶ月以上前のスポットを一括取得（古い順）
    const snapshot = await adminDb
      .collection(COLLECTIONS.SPOTS)
      .where('updatedAt', '<', oneMonthAgo)
      .orderBy('updatedAt', 'asc')
      .get();

    const categories: Record<'over6months' | 'over3months' | 'over1month', FreshnessCategory> = {
      over6months: { label: '6ヶ月以上', count: 0, spots: [] },
      over3months: { label: '3〜6ヶ月', count: 0, spots: [] },
      over1month: { label: '1〜3ヶ月', count: 0, spots: [] },
    };

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const updatedAt: Timestamp | undefined = data.updatedAt;
      if (!updatedAt) continue;

      const spot: FreshnessSpot = {
        id: doc.id,
        name: data.name,
        address: data.address,
        status: data.status,
        updatedAt: updatedAt.toDate().toISOString(),
      };

      if (updatedAt.toMillis() < sixMonthsAgo.toMillis()) {
        categories.over6months.count++;
        categories.over6months.spots.push(spot);
      } else if (updatedAt.toMillis() < threeMonthsAgo.toMillis()) {
        categories.over3months.count++;
        categories.over3months.spots.push(spot);
      } else {
        categories.over1month.count++;
        categories.over1month.spots.push(spot);
      }
    }

    return NextResponse.json({ categories });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ─────────────────────────────────────────────────────
// POST: 古いスポットを一括 pending 化
// body: { spotIds?: string[], category?: 'over6months' }
// spotIds 指定時はそのスポットのみ、category 指定時はカテゴリ全体
// ─────────────────────────────────────────────────────

const BATCH_LIMIT = 499;

export async function POST(request: Request) {
  try {
    const user = await requireAuth('moderator');
    const body = await request.json();
    const { spotIds, category, reason } = body as {
      spotIds?: string[];
      category?: string;
      reason?: string;
    };

    let targetIds: string[] = [];

    if (spotIds && Array.isArray(spotIds) && spotIds.length > 0) {
      // 個別指定
      targetIds = spotIds;
    } else if (category === 'over6months') {
      // 6ヶ月以上のスポットを自動取得
      const sixMonthsAgo = Timestamp.fromDate(monthsAgo(6));
      const snapshot = await adminDb
        .collection(COLLECTIONS.SPOTS)
        .where('updatedAt', '<', sixMonthsAgo)
        .where('status', '==', 'active')
        .get();
      targetIds = snapshot.docs.map((doc) => doc.id);
    } else {
      return NextResponse.json(
        { error: 'spotIds または category を指定してください' },
        { status: 400 },
      );
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ success: true, updated: 0, skipped: 0 });
    }

    const results = { updated: 0, skipped: 0 };

    for (let i = 0; i < targetIds.length; i += BATCH_LIMIT) {
      const chunk = targetIds.slice(i, i + BATCH_LIMIT);
      const batch = adminDb.batch();
      const auditPromises: Promise<string>[] = [];

      for (const id of chunk) {
        const ref = adminDb.collection(COLLECTIONS.SPOTS).doc(id);
        const doc = await ref.get();

        if (!doc.exists) {
          results.skipped++;
          continue;
        }

        const prev = doc.data()!;
        if (prev.status === 'pending') {
          results.skipped++;
          continue;
        }

        batch.update(ref, {
          status: 'pending',
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.updated++;

        auditPromises.push(
          writeAuditLog({
            adminId: user.uid,
            adminEmail: user.email,
            action: 'spot.freshness_pending',
            targetType: 'spot',
            targetId: id,
            reason: reason || '鮮度アラート: 長期未更新のためpending化',
            previousState: { status: prev.status },
            newState: { status: 'pending' },
          }),
        );
      }

      await batch.commit();
      await Promise.all(auditPromises);
    }

    return NextResponse.json({ success: true, ...results, total: targetIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
