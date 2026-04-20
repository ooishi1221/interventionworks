import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiAnalysisResult } from '@/lib/types';

const GEMINI_MODEL = 'gemini-2.5-flash-lite';

const ANALYSIS_PROMPT = `あなたは日本のバイク駐車場の写真を解析するアシスタントです。
写真から読み取れる情報を抽出してください。

抽出対象:
- priceInfo: 料金テキスト（例: "100円/30分", "1日最大800円"）
- openHours: 営業時間（例: "24時間", "8:00-22:00"）
- parkingCapacity: バイク駐車台数（整数）
- isFree: 無料かどうか（boolean）
- payment: 支払方法 — cash（現金）, icCard（Suica/PASMO等）, qrCode（PayPay等）
- capacity: 排気量制限 — is50only（原付のみ）, upTo125（125cc以下）, upTo400（400cc以下）, isLargeOk（大型OK）
- confidence: 読み取りの確信度 0〜1

以下のJSON形式のみを返してください。読み取れないフィールドは省略してください:
{"priceInfo":"...","openHours":"...","parkingCapacity":0,"isFree":false,"payment":{"cash":true,"icCard":false,"qrCode":false},"capacity":{"is50only":false,"upTo125":false,"upTo400":false,"isLargeOk":true},"confidence":0.8}`;

const SIGN_EXTRA = '\n\nこの写真は駐車場の看板です。料金表や利用規約のテキストを重点的に読み取ってください。';

function getClient(): GoogleGenerativeAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY が設定されていません');
  }
  return new GoogleGenerativeAI(apiKey);
}

/**
 * 駐車場写真をGeminiで解析し、構造化データを返す。
 * photoUrlsの最初の1枚を解析対象とする。
 */
export async function analyzeSpotPhoto(
  photoUrls: string[],
  photoTag?: string,
): Promise<GeminiAnalysisResult> {
  if (photoUrls.length === 0) {
    throw new Error('写真URLが空です');
  }

  const client = getClient();
  const model = client.getGenerativeModel({ model: GEMINI_MODEL });

  // 写真をfetchしてbase64に変換
  const imageUrl = photoUrls[0];
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`写真の取得に失敗: ${imageResponse.status}`);
  }

  const imageBuffer = await imageResponse.arrayBuffer();
  const base64 = Buffer.from(imageBuffer).toString('base64');
  const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';

  const prompt = photoTag === 'sign' ? ANALYSIS_PROMPT + SIGN_EXTRA : ANALYSIS_PROMPT;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType, data: base64 } },
  ]);

  const responseText = result.response.text();

  // JSONを抽出（Geminiがmarkdownコードブロックで返すことがある）
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Geminiからの応答にJSONが含まれていません');
  }

  const parsed = JSON.parse(jsonMatch[0]) as GeminiAnalysisResult;

  // confidence が無い場合はデフォルト 0.5
  if (parsed.confidence === undefined) {
    parsed.confidence = 0.5;
  }

  return parsed;
}

// ─────────────────────────────────────────────────────
// 公序良俗違反モデレーション（ワンショット事前フィルタ）
// ─────────────────────────────────────────────────────

export type ModerationResult = {
  approved: boolean;
  reason?: 'nudity' | 'violence' | 'illegal' | 'other';
  rationale?: string;
};

const MODERATION_PROMPT = `あなたは画像の公序良俗判定を行うアシスタントです。
この写真が以下のいずれかに該当する場合は reject してください:
- ヌード・性的表現
- 暴力・流血・虐待
- 違法薬物・武器の明示
- 他者のプライバシーを侵害する撮影（明確な顔アップの盗撮など）

逆に、バイク・車両・駐車場・看板・建物・風景・食事・日常風景などはすべて approve してください。
駐車場以外の写真でもバイク文化に関連するものは approve です。判断に迷う場合は approve を優先してください。

以下のJSON形式のみを返してください:
{"approved": true/false, "reason": "nudity|violence|illegal|other", "rationale": "短い日本語の理由"}
approved が true のときは reason と rationale を省略して {"approved": true} だけでOK。`;

/**
 * 画像を Gemini Vision で解析し、公序良俗違反かどうか判定する。
 * Apple App Store Guideline 1.2 準拠の事前フィルタ。
 */
export async function moderatePhoto(
  base64: string,
  mimeType: string = 'image/jpeg',
): Promise<ModerationResult> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: GEMINI_MODEL });

  const result = await model.generateContent([
    { text: MODERATION_PROMPT },
    { inlineData: { mimeType, data: base64 } },
  ]);

  const responseText = result.response.text();
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // 応答パース失敗時は approve（ユーザー体験を優先）
    return { approved: true };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ModerationResult;
    return { approved: parsed.approved !== false, reason: parsed.reason, rationale: parsed.rationale };
  } catch {
    return { approved: true };
  }
}
