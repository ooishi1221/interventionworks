import { NextResponse } from 'next/server';
import { processStaleSpots, type StaleSpotResult } from '@/lib/cron/stale-spots';
import { processSendScheduled, type SendScheduledResult } from '@/lib/cron/send-scheduled';
import { processRetentionNotify, type RetentionNotifyResult } from '@/lib/cron/retention-notify';

export const maxDuration = 60;

/**
 * GET /api/cron/daily
 *
 * 統合 Cron Job: 全日次タスクを並列実行する。
 * 毎日 3:00 UTC（12:00 JST）に Vercel Cron で実行。
 *
 * タスク:
 * 1. stale-spots — 古いスポットの自動 pending/archive
 * 2. send-scheduled — 予約配信の送信
 * 3. retention-notify — リテンション通知（到着まとめ + 閲覧インパクト）
 */
export async function GET(request: Request) {
  try {
    // ── Cron シークレット検証 ──
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[cron/daily] CRON_SECRET が設定されていません');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const start = Date.now();

    // ── 全タスクを並列実行 ──
    const [staleResult, scheduledResult, retentionResult] = await Promise.allSettled([
      processStaleSpots(),
      processSendScheduled(),
      processRetentionNotify(),
    ]);

    const duration = Date.now() - start;

    const formatResult = <T>(r: PromiseSettledResult<T>) =>
      r.status === 'fulfilled'
        ? { status: 'ok' as const, result: r.value }
        : { status: 'error' as const, error: r.reason instanceof Error ? r.reason.message : String(r.reason) };

    const tasks = {
      staleSpots: formatResult<StaleSpotResult>(staleResult),
      sendScheduled: formatResult<SendScheduledResult>(scheduledResult),
      retentionNotify: formatResult<RetentionNotifyResult>(retentionResult),
    };

    const allOk = Object.values(tasks).every((t) => t.status === 'ok');

    console.log(`[cron/daily] 完了 (${duration}ms): ${allOk ? '全タスク成功' : '一部エラーあり'}`);

    return NextResponse.json({ ok: allOk, tasks, duration });
  } catch (error) {
    console.error('[cron/daily] エラー:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
