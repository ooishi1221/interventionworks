import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

const BATCH_LIMIT = 499;

const UPDATABLE_FIELDS = [
  'name', 'address', 'status', 'verificationLevel',
  'isFree', 'pricePerHour', 'parkingCapacity',
] as const;

export async function POST(request: Request) {
  try {
    const user = await requireAuth('moderator');
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'CSV ファイルが必要です' }, { status: 400 });
    }

    const text = await file.text();
    const cleaned = text.replace(/^\uFEFF/, '');
    const lines = cleaned.split('\n').filter((l) => l.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: 'データ行がありません' }, { status: 400 });
    }

    const header = parseCsvLine(lines[0]);
    const idIdx = header.indexOf('id');
    if (idIdx === -1) {
      return NextResponse.json({ error: 'id 列が必要です' }, { status: 400 });
    }

    const results = { updated: 0, skipped: 0, errors: [] as string[] };
    const dataRows = lines.slice(1);

    for (let i = 0; i < dataRows.length; i += BATCH_LIMIT) {
      const chunk = dataRows.slice(i, i + BATCH_LIMIT);
      const batch = adminDb.batch();

      for (let j = 0; j < chunk.length; j++) {
        const cols = parseCsvLine(chunk[j]);
        const rowNum = i + j + 2;
        const id = cols[idIdx]?.trim();

        if (!id) {
          results.errors.push(`行${rowNum}: id が空です`);
          continue;
        }

        const ref = adminDb.collection(COLLECTIONS.SPOTS).doc(id);
        const doc = await ref.get();

        if (!doc.exists) {
          results.errors.push(`行${rowNum}: id=${id} が見つかりません`);
          results.skipped++;
          continue;
        }

        const updates: Record<string, unknown> = {};
        const prev = doc.data()!;

        for (const field of UPDATABLE_FIELDS) {
          const val = getCol(cols, header, field);
          if (val === '') continue;

          if (field === 'isFree') {
            updates[field] = val === 'true';
          } else if (field === 'pricePerHour' || field === 'parkingCapacity') {
            const num = parseFloat(val);
            if (!isNaN(num)) updates[field] = num;
          } else {
            updates[field] = val;
          }
        }

        if (Object.keys(updates).length === 0) {
          results.skipped++;
          continue;
        }

        batch.update(ref, { ...updates, updatedAt: FieldValue.serverTimestamp() });

        const previousState: Record<string, unknown> = {};
        for (const key of Object.keys(updates)) {
          previousState[key] = prev[key];
        }

        await writeAuditLog({
          adminId: user.uid,
          adminEmail: user.email,
          action: 'spot.bulk_update',
          targetType: 'spot',
          targetId: id,
          previousState,
          newState: updates,
        });

        results.updated++;
      }

      await batch.commit();
    }

    return NextResponse.json({ success: true, ...results, total: dataRows.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function getCol(cols: string[], header: string[], name: string): string {
  const idx = header.indexOf(name);
  return idx >= 0 ? (cols[idx] || '').trim() : '';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
