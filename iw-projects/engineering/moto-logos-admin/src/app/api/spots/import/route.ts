import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';
import { COLLECTIONS } from '@/lib/types';
import { FieldValue } from 'firebase-admin/firestore';

const BATCH_LIMIT = 499;

export async function POST(request: Request) {
  try {
    const user = await requireAuth('moderator');
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'CSV ファイルが必要です' }, { status: 400 });
    }

    const text = await file.text();
    // BOM除去
    const cleaned = text.replace(/^\uFEFF/, '');
    const lines = cleaned.split('\n').filter((l) => l.trim());

    if (lines.length < 2) {
      return NextResponse.json({ error: 'データ行がありません' }, { status: 400 });
    }

    const header = parseCsvLine(lines[0]);
    const nameIdx = header.indexOf('name');
    const latIdx = header.indexOf('latitude');
    const lngIdx = header.indexOf('longitude');

    if (nameIdx === -1 || latIdx === -1 || lngIdx === -1) {
      return NextResponse.json(
        { error: '必須列が不足: name, latitude, longitude' },
        { status: 400 }
      );
    }

    const results = { created: 0, errors: [] as string[] };
    const dataRows = lines.slice(1);

    for (let i = 0; i < dataRows.length; i += BATCH_LIMIT) {
      const chunk = dataRows.slice(i, i + BATCH_LIMIT);
      const batch = adminDb.batch();

      for (let j = 0; j < chunk.length; j++) {
        const cols = parseCsvLine(chunk[j]);
        const rowNum = i + j + 2; // 1-indexed, header is row 1

        const name = getCol(cols, header, 'name');
        const lat = parseFloat(getCol(cols, header, 'latitude'));
        const lng = parseFloat(getCol(cols, header, 'longitude'));

        if (!name || isNaN(lat) || isNaN(lng)) {
          results.errors.push(`行${rowNum}: name/latitude/longitude が不正`);
          continue;
        }

        const geohash = getCol(cols, header, 'geohash') || '';
        const ref = adminDb.collection(COLLECTIONS.SPOTS).doc();

        batch.set(ref, {
          name,
          coordinate: { latitude: lat, longitude: lng },
          geohash,
          address: getCol(cols, header, 'address') || '',
          status: getCol(cols, header, 'status') || 'pending',
          verificationLevel: getCol(cols, header, 'verificationLevel') || 'community',
          source: 'seed',
          isFree: getCol(cols, header, 'isFree') === 'true',
          pricePerHour: parseFloat(getCol(cols, header, 'pricePerHour')) || null,
          parkingCapacity: parseInt(getCol(cols, header, 'parkingCapacity')) || null,
          capacity: { is50only: false, upTo125: true, upTo400: true, isLargeOk: true },
          payment: { cash: false, icCard: false, qrCode: false },
          goodCount: 0,
          badReportCount: 0,
          viewCount: 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        results.created++;
      }

      await batch.commit();
    }

    await writeAuditLog({
      adminId: user.uid,
      adminEmail: user.email,
      action: 'spot.bulk_import',
      targetType: 'spot',
      targetId: 'bulk',
      reason: `CSVインポート: ${results.created}件作成`,
      previousState: {},
      newState: { created: results.created },
    });

    return NextResponse.json({ success: true, ...results });
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
