import { NextResponse, type NextRequest } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const APPEALS_COLLECTION = 'ban_appeals';
const APPEAL_COOLDOWN_DAYS = 30;

/**
 * GET /api/moderation/appeals
 * BAN解除申請の一覧（pending / approved / rejected）
 */
export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') || 'pending';

    const snap = await adminDb
      .collection(APPEALS_COLLECTION)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const appeals = snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        userId: data.userId,
        displayName: data.displayName || '',
        reason: data.reason || '',
        status: data.status,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || '',
        reviewedAt: data.reviewedAt?.toDate?.()?.toISOString() || null,
        reviewedBy: data.reviewedBy || null,
        reviewNote: data.reviewNote || null,
      };
    });

    return NextResponse.json({ appeals });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST /api/moderation/appeals
 * アプリからBAN解除申請を送信。
 *
 * 認可設計:
 * - admin session は不要（BANされたユーザーが管理画面にログインできないため）
 * - ただし Firebase ID トークンは必須。トークンから uid を抽出し、body の userId は信じない
 *   （body の userId を信じると、外部から誰でも任意 uid で申請レコードを量産できる）
 * - BAN は Firestore フラグであり Firebase Auth は生きているため、BAN されたユーザーも ID トークンは取得可能
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') ?? '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!idToken) {
      return NextResponse.json({ error: '認証トークンが必要です' }, { status: 401 });
    }

    let verifiedUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      verifiedUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: '認証トークンが無効です' }, { status: 401 });
    }

    const { displayName, reason } = (await request.json()) as {
      displayName?: string;
      reason?: string;
    };

    if (!reason?.trim()) {
      return NextResponse.json({ error: 'reason は必須です' }, { status: 400 });
    }

    // 既存の pending 申請があれば拒否
    const pending = await adminDb
      .collection(APPEALS_COLLECTION)
      .where('userId', '==', verifiedUid)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!pending.empty) {
      return NextResponse.json({ error: '既に審査中の申請があります' }, { status: 409 });
    }

    // 直近の rejected 申請があればクールダウン中として拒否（スパム防止）
    const cooldownSince = Timestamp.fromDate(
      new Date(Date.now() - APPEAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
    );
    const recentRejected = await adminDb
      .collection(APPEALS_COLLECTION)
      .where('userId', '==', verifiedUid)
      .where('status', '==', 'rejected')
      .where('reviewedAt', '>=', cooldownSince)
      .limit(1)
      .get();

    if (!recentRejected.empty) {
      return NextResponse.json(
        { error: `前回の申請から ${APPEAL_COOLDOWN_DAYS} 日間は再申請できません` },
        { status: 429 }
      );
    }

    await adminDb.collection(APPEALS_COLLECTION).add({
      userId: verifiedUid,
      displayName: displayName || '',
      reason: reason.trim(),
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, message: '申請を受け付けました' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/moderation/appeals
 * 管理者が申請を承認 / 却下
 */
export async function PATCH(request: Request) {
  try {
    const admin = await requireAuth('moderator');
    const { appealId, action, note } = (await request.json()) as {
      appealId?: string;
      action?: 'approve' | 'reject';
      note?: string;
    };

    if (!appealId || !action) {
      return NextResponse.json({ error: 'appealId と action は必須です' }, { status: 400 });
    }

    const ref = adminDb.collection(APPEALS_COLLECTION).doc(appealId);
    const doc = await ref.get();
    if (!doc.exists) {
      return NextResponse.json({ error: '申請が見つかりません' }, { status: 404 });
    }

    const data = doc.data()!;
    const userId = data.userId as string;

    await ref.update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewedAt: FieldValue.serverTimestamp(),
      reviewedBy: admin.email,
      reviewNote: note || null,
    });

    // 承認時は BAN 解除
    if (action === 'approve') {
      const userRef = adminDb.collection(COLLECTIONS.USERS).doc(userId);
      const userDoc = await userRef.get();
      if (userDoc.exists) {
        await userRef.update({
          banStatus: 'active',
          banReason: FieldValue.delete(),
          bannedAt: FieldValue.delete(),
          banUntil: FieldValue.delete(),
          bannedBy: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    await writeAuditLog({
      adminId: admin.uid,
      adminEmail: admin.email,
      action: `appeal.${action}`,
      targetType: 'user',
      targetId: userId,
      reason: note || `BAN解除申請を${action === 'approve' ? '承認' : '却下'}`,
      previousState: { appealId, status: 'pending' },
      newState: { status: action === 'approve' ? 'approved' : 'rejected' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
