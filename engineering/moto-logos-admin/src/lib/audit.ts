import { adminDb } from './firebase-admin';
import { COLLECTIONS } from './types';
import { FieldValue } from 'firebase-admin/firestore';

interface AuditLogParams {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: 'spot' | 'user' | 'review' | 'admin';
  targetId: string;
  reason?: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
}

export async function writeAuditLog(params: AuditLogParams): Promise<string> {
  const docRef = await adminDb.collection(COLLECTIONS.MODERATION_LOGS).add({
    ...params,
    createdAt: FieldValue.serverTimestamp(),
  });
  return docRef.id;
}
