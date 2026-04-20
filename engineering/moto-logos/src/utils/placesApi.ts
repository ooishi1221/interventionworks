/**
 * Google Places API (New) — Autocomplete + Details
 *
 * 無料枠: Maps Platform の $200/月クレジット = 約70,000セッション/月。
 * セッション = Autocomplete 複数回 + Details 1回 を同じ sessionToken で叩くと1回課金。
 *
 * 使い方:
 *   const token = generateSessionToken();
 *   const suggestions = await autocompletePlaces('渋谷', token);
 *   const { latitude, longitude, name } = await getPlaceDetails(suggestions[0].placeId, token);
 */

const API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
  'AIzaSyAqLnpZ8tiuP0YfsLMkLuRvd2TvUuwb98o'; // app.json の android.config.googleMaps.apiKey と同じ

export interface PlaceSuggestion {
  placeId: string;
  primaryText: string; // 「渋谷駅」など
  secondaryText: string; // 「東京都渋谷区」など
  fullText: string; // フル表記
}

export interface PlaceDetails {
  latitude: number;
  longitude: number;
  name: string;
}

/** 1つの検索セッション (タイプ開始〜選択) を識別するトークン */
export function generateSessionToken(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  );
}

/**
 * オートコンプリート候補を取得。
 * locationBias があれば周辺を優先。
 */
export async function autocompletePlaces(
  input: string,
  sessionToken: string,
  biasLatitude?: number,
  biasLongitude?: number,
): Promise<PlaceSuggestion[]> {
  const body: Record<string, unknown> = {
    input,
    sessionToken,
    languageCode: 'ja',
    regionCode: 'JP',
  };
  if (biasLatitude != null && biasLongitude != null) {
    body.locationBias = {
      circle: {
        center: { latitude: biasLatitude, longitude: biasLongitude },
        radius: 50000, // 50km圏
      },
    };
  }

  const res = await fetch(
    'https://places.googleapis.com/v1/places:autocomplete',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
      },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`autocomplete ${res.status}: ${text}`);
  }
  const data = await res.json();
  type RawSuggestion = {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  };
  const suggestions = (data.suggestions as RawSuggestion[] | undefined) ?? [];
  return suggestions
    .map((s) => ({
      placeId: s.placePrediction?.placeId ?? '',
      primaryText: s.placePrediction?.structuredFormat?.mainText?.text ?? '',
      secondaryText:
        s.placePrediction?.structuredFormat?.secondaryText?.text ?? '',
      fullText: s.placePrediction?.text?.text ?? '',
    }))
    .filter((s) => s.placeId);
}

/** 選択した place の座標を取得。sessionToken は autocomplete と同じものを渡す。 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken: string,
): Promise<PlaceDetails> {
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken)}`,
    {
      headers: {
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': 'location,displayName',
      },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`placeDetails ${res.status}: ${text}`);
  }
  const data = await res.json();
  const lat = data?.location?.latitude;
  const lng = data?.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('placeDetails: missing location');
  }
  return {
    latitude: lat,
    longitude: lng,
    name: data?.displayName?.text ?? '',
  };
}
