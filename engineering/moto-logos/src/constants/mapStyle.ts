/**
 * Google Maps ダークテーマ — MotoPark Butler
 * アプリのダークUIに完全マッチするカスタムスタイル
 */
export const DARK_MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8e8e93' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#2c2c2e' }],
  },
  {
    featureType: 'administrative.country',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#636366' }],
  },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#aeaeb2' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#636366' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#1a2e1a' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3a5a3a' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#2c2c2e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1c1c1e' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#8e8e93' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#3a3a3c' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1c1c1e' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#aeaeb2' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2c2c2e' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#636366' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#0e1a2a' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#3a5a7a' }],
  },
];

/**
 * 星図マップスタイル — ライダーノート用
 * ラベル全消し・極暗。光点（StarMarker）だけが浮かび上がる
 */
export const STAR_MAP_STYLE = [
  // ── ベース: ほぼ黒 ──
  { elementType: 'geometry', stylers: [{ color: '#0a0a0a' }] },
  // ── ラベル全消し ──
  { elementType: 'labels', stylers: [{ visibility: 'off' as const }] },
  // ── 行政区境界: うっすら ──
  {
    featureType: 'administrative',
    elementType: 'geometry',
    stylers: [{ color: '#141414' }],
  },
  // ── POI: 消す ──
  {
    featureType: 'poi',
    stylers: [{ visibility: 'off' as const }],
  },
  // ── 公園: ほぼ消える ──
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ visibility: 'on' as const }, { color: '#0d0d0d' }],
  },
  // ── 道路: 東京の「形」が分かる程度 ──
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#181818' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#101010' }],
  },
  // ── 高速道路: 一般道よりわずかに明るい ──
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#1c1c1c' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#101010' }],
  },
  // ── 電車路線: かすか ──
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#111111' }],
  },
  // ── 水域: 東京湾・川の輪郭が分かる ──
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#060d14' }],
  },
];
