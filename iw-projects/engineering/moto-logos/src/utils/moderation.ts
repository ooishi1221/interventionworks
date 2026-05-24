/**
 * moderation — ワンショット写真の事前モデレーション
 *
 * Admin API (Gemini Vision) に画像を送信し、公序良俗違反かどうかを判定する。
 * Apple App Store Guideline 1.2 の事前フィルタ。
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { getFirebaseAuth } from '../firebase/config';
import { captureError } from './sentry';

const MOD_MAX_DIMENSION = 640; // 判定用は軽量で良い
const MOD_JPEG_QUALITY = 0.5;

const MODERATION_ENDPOINT =
  process.env.EXPO_PUBLIC_MODERATION_ENDPOINT ||
  'https://moto-logos-admin.vercel.app/api/public/moderate-photo';

export type ModerationResult = {
  approved: boolean;
  reason?: 'nudity' | 'violence' | 'illegal' | 'other';
  rationale?: string;
};

/**
 * 画像をモデレーションにかける。
 * ネットワークエラー / サーバーエラー時は approve を返す（ユーザー体験優先）。
 */
export async function moderatePhotoRemote(localUri: string): Promise<ModerationResult> {
  try {
    const idToken = await getFirebaseAuth().currentUser?.getIdToken();
    if (!idToken) return { approved: true };

    // 軽量版にリサイズ・圧縮（判定用途なので小さくてOK、帯域節約）
    const compressed = await manipulateAsync(
      localUri,
      [{ resize: { width: MOD_MAX_DIMENSION } }],
      { compress: MOD_JPEG_QUALITY, format: SaveFormat.JPEG, base64: true },
    );

    const base64 = compressed.base64;
    if (!base64) return { approved: true };

    const res = await fetch(MODERATION_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, base64, mimeType: 'image/jpeg' }),
    });

    if (!res.ok) {
      return { approved: true };
    }

    const data = (await res.json()) as ModerationResult;
    return { approved: data.approved !== false, reason: data.reason, rationale: data.rationale };
  } catch (e) {
    captureError(e, { context: 'moderation_check' });
    return { approved: true };
  }
}
