import { NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import type { AdminRole } from '@/lib/types';

const VALID_ROLES: AdminRole[] = ['super_admin', 'moderator', 'viewer'];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth('super_admin');
    const { id } = await context.params;
    const { role } = await request.json();

    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: '無効なロールです' }, { status: 400 });
    }

    // 現在のカスタムクレームを取得
    const targetUser = await adminAuth.getUser(id);
    const previousRole = targetUser.customClaims?.role || 'none';

    // カスタムクレームを更新
    await adminAuth.setCustomUserClaims(id, { role });

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: 'admin.role.update',
      targetType: 'admin',
      targetId: id,
      previousState: { role: previousRole },
      newState: { role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
