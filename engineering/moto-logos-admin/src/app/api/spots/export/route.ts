import { NextResponse, type NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS, type SpotStatus } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status') as SpotStatus | null;

    let query: FirebaseFirestore.Query = adminDb.collection(COLLECTIONS.SPOTS);
    if (status) query = query.where('status', '==', status);
    query = query.orderBy('createdAt', 'desc');

    const snapshot = await query.get();

    const header = [
      'id', 'name', 'address', 'latitude', 'longitude', 'geohash',
      'status', 'verificationLevel', 'source',
      'isFree', 'pricePerHour', 'parkingCapacity',
      'goodCount', 'badReportCount', 'viewCount',
      'createdAt', 'updatedAt',
    ];

    const rows = snapshot.docs.map((doc) => {
      const d = doc.data();
      return [
        doc.id,
        csvEscape(d.name),
        csvEscape(d.address || ''),
        d.coordinate?.latitude ?? '',
        d.coordinate?.longitude ?? '',
        d.geohash || '',
        d.status,
        d.verificationLevel,
        d.source,
        d.isFree ? 'true' : 'false',
        d.pricePerHour ?? '',
        d.parkingCapacity ?? '',
        d.goodCount ?? 0,
        d.badReportCount ?? 0,
        d.viewCount ?? 0,
        d.createdAt?.toDate().toISOString() || '',
        d.updatedAt?.toDate().toISOString() || '',
      ].join(',');
    });

    const csv = [header.join(','), ...rows].join('\n');
    const bom = '\uFEFF';

    return new NextResponse(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="spots_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
