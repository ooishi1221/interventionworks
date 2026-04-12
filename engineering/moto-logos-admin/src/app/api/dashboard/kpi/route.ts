import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { requireAuth } from '@/lib/auth';
import { COLLECTIONS, type KpiStats } from '@/lib/types';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  try {
    await requireAuth();

    const todayStr = today();
    const thirtyDaysAgo = daysAgo(30);
    const sevenDaysAgo = daysAgo(7);

    // 過去30日間のアクティビティを一括取得
    const snap = await adminDb
      .collection(COLLECTIONS.USER_ACTIVITY)
      .where('date', '>=', thirtyDaysAgo)
      .get();

    // 日別のユニークデバイス数を集計
    const dailyDevices = new Map<string, Set<string>>();
    const wauDevices = new Set<string>();
    const mauDevices = new Set<string>();
    let dau = 0;

    for (const doc of snap.docs) {
      const { deviceId, date } = doc.data() as { deviceId: string; date: string };

      // MAU (全30日間)
      mauDevices.add(deviceId);

      // WAU (直近7日間)
      if (date >= sevenDaysAgo) {
        wauDevices.add(deviceId);
      }

      // 日別集計
      if (!dailyDevices.has(date)) {
        dailyDevices.set(date, new Set());
      }
      dailyDevices.get(date)!.add(deviceId);
    }

    dau = dailyDevices.get(todayStr)?.size ?? 0;

    // 30日分のトレンドデータを生成（データがない日は0）
    const dailyTrend: { date: string; count: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = daysAgo(i);
      dailyTrend.push({
        date: d,
        count: dailyDevices.get(d)?.size ?? 0,
      });
    }

    const stats: KpiStats = {
      dau,
      wau: wauDevices.size,
      mau: mauDevices.size,
      dailyTrend,
    };

    return NextResponse.json(stats);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    const status = message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
