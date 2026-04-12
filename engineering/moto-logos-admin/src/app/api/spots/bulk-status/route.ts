import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS, type SpotStatus } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

const VALID_STATUSES: SpotStatus[] = ['active', 'pending', 'closed'];
const BATCH_LIMIT = 499;

export async function POST(request: Request) {
  try {
    const user = await requireAuth('moderator');
    const { spotIds, status, reason } = await request.json();

    if (!Array.isArray(spotIds) || spotIds.length === 0) {
      return NextResponse.json({ error: 'spotIds は必須です' }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json({ error: '無効なステータスです' }, { status: 400 });
    }

    // Firestore のバッチ書き込みは 500件まで
    const results = { updated: 0, skipped: 0, errors: [] as string[] };

    for (let i = 0; i < spotIds.length; i += BATCH_LIMIT) {
      const chunk = spotIds.slice(i, i + BATCH_LIMIT);
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
        if (prev.status === status) {
          results.skipped++;
          continue;
        }

        batch.update(ref, { status, updatedAt: FieldValue.serverTimestamp() });
        results.updated++;

        auditPromises.push(
          writeAuditLog({
            adminId: user.uid,
            adminEmail: user.email,
            action: 'spot.bulk_status_update',
            targetType: 'spot',
            targetId: id,
            reason,
            previousState: { status: prev.status },
            newState: { status },
          })
        );
      }

      await batch.commit();
      await Promise.all(auditPromises);
    }

    return NextResponse.json({
      success: true,
      ...results,
      total: spotIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
