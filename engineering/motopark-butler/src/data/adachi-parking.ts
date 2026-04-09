import { ParkingPin } from '../types';

/**
 * 東京都バイク駐輪場データ（23区 + 多摩エリア）
 * maxCC: null = 制限なし（400cc以上OK）
 *        250  = 250cc以下
 *        125  = 125cc以下（小型二輪）
 *        50   = 原付（50cc以下）のみ
 */
export const ADACHI_PARKING: ParkingPin[] = [

  // ── 足立区 ────────────────────────────────────
  {
    id: 'seed_001',
    name: '北千住駅西口バイク駐輪場',
    address: '東京都足立区千住2丁目',
    latitude: 35.7494, longitude: 139.8044,
    maxCC: 125, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_002',
    name: '北千住駅東口バイク駐輪場',
    address: '東京都足立区千住橋戸町',
    latitude: 35.7502, longitude: 139.8075,
    maxCC: null, isFree: false, capacity: 60, source: 'seed',
  },
  {
    id: 'seed_003',
    name: '北千住駅前自転車・バイク駐輪場（原付）',
    address: '東京都足立区千住2丁目',
    latitude: 35.7487, longitude: 139.8051,
    maxCC: 50, isFree: false, capacity: 120, source: 'seed',
  },
  {
    id: 'seed_004',
    name: '西新井駅バイク駐輪場',
    address: '東京都足立区西新井1丁目',
    latitude: 35.7796, longitude: 139.7797,
    maxCC: 250, isFree: false, capacity: 50, source: 'seed',
  },
  {
    id: 'seed_005',
    name: '西新井大師周辺バイクパーキング',
    address: '東京都足立区西新井大師西1丁目',
    latitude: 35.7826, longitude: 139.7767,
    maxCC: null, isFree: true, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_006',
    name: '竹ノ塚駅バイク駐輪場',
    address: '東京都足立区竹の塚6丁目',
    latitude: 35.7937, longitude: 139.8012,
    maxCC: 125, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_007',
    name: '竹ノ塚駅東口二輪駐車場',
    address: '東京都足立区竹の塚6丁目',
    latitude: 35.7941, longitude: 139.8025,
    maxCC: null, isFree: false, capacity: 25, source: 'seed',
  },
  {
    id: 'seed_008',
    name: '綾瀬駅バイク駐輪場',
    address: '東京都足立区綾瀬1丁目',
    latitude: 35.7612, longitude: 139.8283,
    maxCC: 250, isFree: false, capacity: 45, source: 'seed',
  },
  {
    id: 'seed_009',
    name: '綾瀬駅西口自転車・原付駐輪場',
    address: '東京都足立区綾瀬1丁目',
    latitude: 35.7605, longitude: 139.8271,
    maxCC: 50, isFree: false, capacity: 200, source: 'seed',
  },
  {
    id: 'seed_010',
    name: '梅島駅バイク駐輪場',
    address: '東京都足立区梅田8丁目',
    latitude: 35.7663, longitude: 139.7931,
    maxCC: 125, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_011',
    name: '五反野駅バイク駐輪場',
    address: '東京都足立区足立3丁目',
    latitude: 35.7714, longitude: 139.8183,
    maxCC: 125, isFree: false, capacity: 28, source: 'seed',
  },
  {
    id: 'seed_012',
    name: '足立区役所前バイク駐輪場',
    address: '東京都足立区中央本町1丁目',
    latitude: 35.7779, longitude: 139.8046,
    maxCC: null, isFree: true, capacity: 15, source: 'seed',
  },
  {
    id: 'seed_013',
    name: '江北駅バイク駐輪場',
    address: '東京都足立区江北1丁目',
    latitude: 35.7839, longitude: 139.7941,
    maxCC: 250, isFree: false, capacity: 22, source: 'seed',
  },
  {
    id: 'seed_014',
    name: '鹿浜橋バイクパーキング',
    address: '東京都足立区鹿浜5丁目',
    latitude: 35.7881, longitude: 139.7755,
    maxCC: null, isFree: false, capacity: 18, source: 'seed',
  },
  {
    id: 'seed_015',
    name: '舎人公園バイク駐輪場',
    address: '東京都足立区舎人公園',
    latitude: 35.8037, longitude: 139.8103,
    maxCC: null, isFree: true, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_016',
    name: '扇大橋駅周辺バイク駐輪場',
    address: '東京都足立区扇1丁目',
    latitude: 35.7918, longitude: 139.7870,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },

  // ── 渋谷区（初台・新宿区境） ──────────────────
  {
    id: 'seed_017',
    name: '初台駅南口バイク駐輪場',
    address: '東京都渋谷区初台1丁目',
    latitude: 35.6831, longitude: 139.6878,
    maxCC: 125, isFree: false, capacity: 24, source: 'seed',
  },
  {
    id: 'seed_018',
    name: '新宿オペラシティ前バイクパーキング',
    address: '東京都新宿区西新宿3丁目',
    latitude: 35.6841, longitude: 139.6895,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_019',
    name: '初台中央バイクパーキング',
    address: '東京都渋谷区初台1丁目',
    latitude: 35.6822, longitude: 139.6862,
    maxCC: null, isFree: false, capacity: 15, source: 'seed',
  },
  {
    id: 'seed_020',
    name: '西新宿五丁目バイク駐輪場',
    address: '東京都新宿区西新宿5丁目',
    latitude: 35.6889, longitude: 139.6851,
    maxCC: 250, isFree: false, capacity: 18, source: 'seed',
  },
  {
    id: 'seed_021',
    name: '初台駅北口自転車・原付駐輪場',
    address: '東京都渋谷区初台1丁目',
    latitude: 35.6847, longitude: 139.6871,
    maxCC: 50, isFree: false, capacity: 80, source: 'seed',
  },

  // ── 江東区（東陽町） ──────────────────────────
  {
    id: 'seed_022',
    name: '東陽町駅バイク駐輪場',
    address: '東京都江東区東陽4丁目',
    latitude: 35.6716, longitude: 139.8180,
    maxCC: 125, isFree: false, capacity: 32, source: 'seed',
  },
  {
    id: 'seed_023',
    name: '東陽町駅東口二輪駐車場',
    address: '東京都江東区東陽4丁目',
    latitude: 35.6724, longitude: 139.8194,
    maxCC: null, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_024',
    name: '江東区東陽町バイク駐輪場',
    address: '東京都江東区東陽3丁目',
    latitude: 35.6736, longitude: 139.8165,
    maxCC: 250, isFree: false, capacity: 28, source: 'seed',
  },
  {
    id: 'seed_025',
    name: '東陽町公共バイクパーキング',
    address: '東京都江東区東陽5丁目',
    latitude: 35.6701, longitude: 139.8201,
    maxCC: null, isFree: true, capacity: 12, source: 'seed',
  },
  {
    id: 'seed_026',
    name: '東陽町駅西側原付駐輪場',
    address: '東京都江東区東陽3丁目',
    latitude: 35.6710, longitude: 139.8163,
    maxCC: 50, isFree: false, capacity: 60, source: 'seed',
  },

  // ── 渋谷区 ────────────────────────────────────
  {
    id: 'seed_027',
    name: '渋谷駅西口二輪駐車場',
    address: '東京都渋谷区道玄坂1丁目',
    latitude: 35.6585, longitude: 139.6991,
    maxCC: null, isFree: false, capacity: 45, source: 'seed',
  },
  {
    id: 'seed_028',
    name: '渋谷駅東口バイクパーキング',
    address: '東京都渋谷区渋谷2丁目',
    latitude: 35.6592, longitude: 139.7045,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_029',
    name: '渋谷マークシティ前バイク駐輪場',
    address: '東京都渋谷区道玄坂1丁目',
    latitude: 35.6571, longitude: 139.6979,
    maxCC: 125, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_030',
    name: '恵比寿駅バイク駐輪場',
    address: '東京都渋谷区恵比寿南1丁目',
    latitude: 35.6468, longitude: 139.7099,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_031',
    name: '恵比寿ガーデンプレイス二輪駐車場',
    address: '東京都渋谷区恵比寿4丁目',
    latitude: 35.6481, longitude: 139.7153,
    maxCC: null, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_032',
    name: '代官山バイクパーキング',
    address: '東京都渋谷区猿楽町',
    latitude: 35.6491, longitude: 139.7023,
    maxCC: 125, isFree: false, capacity: 15, source: 'seed',
  },
  {
    id: 'seed_033',
    name: '原宿駅バイク駐輪場',
    address: '東京都渋谷区神宮前1丁目',
    latitude: 35.6698, longitude: 139.7025,
    maxCC: 125, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_034',
    name: '表参道交差点バイクパーキング',
    address: '東京都渋谷区神宮前4丁目',
    latitude: 35.6658, longitude: 139.7122,
    maxCC: null, isFree: false, capacity: 25, source: 'seed',
  },

  // ── 新宿区 ────────────────────────────────────
  {
    id: 'seed_035',
    name: '新宿駅東口バイク駐輪場',
    address: '東京都新宿区新宿3丁目',
    latitude: 35.6921, longitude: 139.7036,
    maxCC: null, isFree: false, capacity: 60, source: 'seed',
  },
  {
    id: 'seed_036',
    name: '新宿駅南口二輪駐車場',
    address: '東京都新宿区新宿4丁目',
    latitude: 35.6877, longitude: 139.7003,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_037',
    name: '歌舞伎町バイクパーキング',
    address: '東京都新宿区歌舞伎町1丁目',
    latitude: 35.6946, longitude: 139.7023,
    maxCC: 125, isFree: false, capacity: 50, source: 'seed',
  },
  {
    id: 'seed_038',
    name: '四谷駅バイク駐輪場',
    address: '東京都新宿区四谷1丁目',
    latitude: 35.6862, longitude: 139.7237,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_039',
    name: '高田馬場駅バイク駐輪場',
    address: '東京都新宿区高田馬場1丁目',
    latitude: 35.7127, longitude: 139.7034,
    maxCC: 125, isFree: false, capacity: 35, source: 'seed',
  },

  // ── 港区 ──────────────────────────────────────
  {
    id: 'seed_040',
    name: '六本木ヒルズ二輪駐車場',
    address: '東京都港区六本木6丁目',
    latitude: 35.6607, longitude: 139.7294,
    maxCC: null, isFree: false, capacity: 50, source: 'seed',
  },
  {
    id: 'seed_041',
    name: '六本木駅前バイクパーキング',
    address: '東京都港区六本木5丁目',
    latitude: 35.6640, longitude: 139.7319,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_042',
    name: '麻布十番バイク駐輪場',
    address: '東京都港区麻布十番2丁目',
    latitude: 35.6557, longitude: 139.7375,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_043',
    name: '赤坂駅前二輪駐車場',
    address: '東京都港区赤坂4丁目',
    latitude: 35.6730, longitude: 139.7369,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_044',
    name: '品川駅高輪口バイク駐輪場',
    address: '東京都港区高輪3丁目',
    latitude: 35.6279, longitude: 139.7395,
    maxCC: null, isFree: false, capacity: 60, source: 'seed',
  },
  {
    id: 'seed_045',
    name: 'お台場パレットタウン二輪駐車場',
    address: '東京都江東区青海1丁目',
    latitude: 35.6289, longitude: 139.7761,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_046',
    name: '虎ノ門ヒルズバイクパーキング',
    address: '東京都港区虎ノ門1丁目',
    latitude: 35.6671, longitude: 139.7498,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },

  // ── 中央区 ────────────────────────────────────
  {
    id: 'seed_047',
    name: '銀座中央バイク駐輪場',
    address: '東京都中央区銀座4丁目',
    latitude: 35.6716, longitude: 139.7657,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_048',
    name: '銀座八丁目二輪駐車場',
    address: '東京都中央区銀座8丁目',
    latitude: 35.6692, longitude: 139.7617,
    maxCC: null, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_049',
    name: '有楽町駅前バイク駐輪場',
    address: '東京都千代田区有楽町2丁目',
    latitude: 35.6749, longitude: 139.7618,
    maxCC: null, isFree: false, capacity: 25, source: 'seed',
  },
  {
    id: 'seed_050',
    name: '築地場外市場バイクパーキング',
    address: '東京都中央区築地4丁目',
    latitude: 35.6658, longitude: 139.7706,
    maxCC: 125, isFree: false, capacity: 15, source: 'seed',
  },
  {
    id: 'seed_051',
    name: '月島バイク駐輪場',
    address: '東京都中央区月島2丁目',
    latitude: 35.6623, longitude: 139.7842,
    maxCC: 125, isFree: false, capacity: 18, source: 'seed',
  },

  // ── 千代田区 ──────────────────────────────────
  {
    id: 'seed_052',
    name: '秋葉原駅バイク駐輪場',
    address: '東京都千代田区外神田1丁目',
    latitude: 35.6982, longitude: 139.7732,
    maxCC: null, isFree: false, capacity: 55, source: 'seed',
  },
  {
    id: 'seed_053',
    name: '秋葉原電気街口二輪駐車場',
    address: '東京都千代田区外神田4丁目',
    latitude: 35.7001, longitude: 139.7758,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_054',
    name: '丸の内バイクパーキング',
    address: '東京都千代田区丸の内1丁目',
    latitude: 35.6812, longitude: 139.7638,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_055',
    name: '神保町バイクパーキング',
    address: '東京都千代田区神田神保町2丁目',
    latitude: 35.6965, longitude: 139.7577,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_056',
    name: '水道橋駅バイク駐輪場',
    address: '東京都千代田区三崎町1丁目',
    latitude: 35.7024, longitude: 139.7523,
    maxCC: 125, isFree: false, capacity: 25, source: 'seed',
  },

  // ── 台東区 ────────────────────────────────────
  {
    id: 'seed_057',
    name: '上野駅公園口バイク駐輪場',
    address: '東京都台東区上野7丁目',
    latitude: 35.7133, longitude: 139.7773,
    maxCC: null, isFree: false, capacity: 50, source: 'seed',
  },
  {
    id: 'seed_058',
    name: '上野公園前二輪駐車場',
    address: '東京都台東区上野公園',
    latitude: 35.7157, longitude: 139.7743,
    maxCC: null, isFree: true, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_059',
    name: '浅草駅バイク駐輪場',
    address: '東京都台東区浅草1丁目',
    latitude: 35.7116, longitude: 139.7964,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_060',
    name: '浅草寺前バイクパーキング',
    address: '東京都台東区浅草2丁目',
    latitude: 35.7148, longitude: 139.7967,
    maxCC: 125, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_061',
    name: '上野御徒町二輪駐車場',
    address: '東京都台東区上野4丁目',
    latitude: 35.7086, longitude: 139.7741,
    maxCC: 250, isFree: false, capacity: 35, source: 'seed',
  },

  // ── 豊島区 ────────────────────────────────────
  {
    id: 'seed_062',
    name: '池袋駅東口バイク駐輪場',
    address: '東京都豊島区東池袋1丁目',
    latitude: 35.7306, longitude: 139.7120,
    maxCC: null, isFree: false, capacity: 70, source: 'seed',
  },
  {
    id: 'seed_063',
    name: '池袋駅西口二輪駐車場',
    address: '東京都豊島区池袋2丁目',
    latitude: 35.7302, longitude: 139.7085,
    maxCC: null, isFree: false, capacity: 50, source: 'seed',
  },
  {
    id: 'seed_064',
    name: '池袋駅南口バイクパーキング',
    address: '東京都豊島区南池袋1丁目',
    latitude: 35.7278, longitude: 139.7103,
    maxCC: 125, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_065',
    name: '椎名町駅バイク駐輪場',
    address: '東京都豊島区長崎2丁目',
    latitude: 35.7248, longitude: 139.6958,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },

  // ── 墨田区 ────────────────────────────────────
  {
    id: 'seed_066',
    name: '錦糸町駅バイク駐輪場',
    address: '東京都墨田区江東橋3丁目',
    latitude: 35.6960, longitude: 139.8152,
    maxCC: null, isFree: false, capacity: 55, source: 'seed',
  },
  {
    id: 'seed_067',
    name: '東京スカイツリー二輪駐車場',
    address: '東京都墨田区押上1丁目',
    latitude: 35.7101, longitude: 139.8107,
    maxCC: null, isFree: false, capacity: 80, source: 'seed',
  },
  {
    id: 'seed_068',
    name: '両国駅バイク駐輪場',
    address: '東京都墨田区横綱1丁目',
    latitude: 35.6970, longitude: 139.7936,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_069',
    name: '押上（スカイツリー前）原付駐輪場',
    address: '東京都墨田区押上1丁目',
    latitude: 35.7108, longitude: 139.8093,
    maxCC: 50, isFree: false, capacity: 60, source: 'seed',
  },

  // ── 江東区（東陽町以外） ──────────────────────
  {
    id: 'seed_070',
    name: '豊洲駅バイクパーキング',
    address: '東京都江東区豊洲2丁目',
    latitude: 35.6545, longitude: 139.7959,
    maxCC: null, isFree: false, capacity: 60, source: 'seed',
  },
  {
    id: 'seed_071',
    name: '門前仲町バイク駐輪場',
    address: '東京都江東区富岡1丁目',
    latitude: 35.6726, longitude: 139.7949,
    maxCC: 125, isFree: false, capacity: 25, source: 'seed',
  },
  {
    id: 'seed_072',
    name: '有明テニスの森バイク駐輪場',
    address: '東京都江東区有明3丁目',
    latitude: 35.6307, longitude: 139.7850,
    maxCC: null, isFree: true, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_073',
    name: '木場公園バイクパーキング',
    address: '東京都江東区木場4丁目',
    latitude: 35.6729, longitude: 139.8077,
    maxCC: null, isFree: true, capacity: 15, source: 'seed',
  },

  // ── 品川区 ────────────────────────────────────
  {
    id: 'seed_074',
    name: '品川駅港南口バイク駐輪場',
    address: '東京都品川区港南2丁目',
    latitude: 35.6290, longitude: 139.7415,
    maxCC: null, isFree: false, capacity: 45, source: 'seed',
  },
  {
    id: 'seed_075',
    name: '大崎駅バイク駐輪場',
    address: '東京都品川区大崎1丁目',
    latitude: 35.6196, longitude: 139.7284,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_076',
    name: '五反田駅バイク駐輪場',
    address: '東京都品川区東五反田1丁目',
    latitude: 35.6255, longitude: 139.7233,
    maxCC: 125, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_077',
    name: '大井町駅バイクパーキング',
    address: '東京都品川区大井1丁目',
    latitude: 35.6099, longitude: 139.7307,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },

  // ── 目黒区 ────────────────────────────────────
  {
    id: 'seed_078',
    name: '目黒駅バイク駐輪場',
    address: '東京都目黒区下目黒1丁目',
    latitude: 35.6334, longitude: 139.7165,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_079',
    name: '中目黒バイク駐輪場',
    address: '東京都目黒区中目黒1丁目',
    latitude: 35.6439, longitude: 139.6993,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_080',
    name: '自由が丘駅二輪駐車場',
    address: '東京都目黒区自由が丘2丁目',
    latitude: 35.6068, longitude: 139.6694,
    maxCC: null, isFree: false, capacity: 25, source: 'seed',
  },

  // ── 世田谷区 ──────────────────────────────────
  {
    id: 'seed_081',
    name: '三軒茶屋バイク駐輪場',
    address: '東京都世田谷区太子堂4丁目',
    latitude: 35.6440, longitude: 139.6695,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_082',
    name: '下北沢駅バイク駐輪場',
    address: '東京都世田谷区北沢2丁目',
    latitude: 35.6611, longitude: 139.6680,
    maxCC: 125, isFree: false, capacity: 25, source: 'seed',
  },
  {
    id: 'seed_083',
    name: '二子玉川バイクパーキング',
    address: '東京都世田谷区玉川2丁目',
    latitude: 35.6134, longitude: 139.6274,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_084',
    name: '経堂駅バイク駐輪場',
    address: '東京都世田谷区経堂1丁目',
    latitude: 35.6463, longitude: 139.6431,
    maxCC: 125, isFree: false, capacity: 22, source: 'seed',
  },

  // ── 杉並区 ────────────────────────────────────
  {
    id: 'seed_085',
    name: '高円寺駅バイク駐輪場',
    address: '東京都杉並区高円寺北2丁目',
    latitude: 35.7054, longitude: 139.6495,
    maxCC: 125, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_086',
    name: '荻窪駅バイク駐輪場',
    address: '東京都杉並区荻窪5丁目',
    latitude: 35.7049, longitude: 139.6237,
    maxCC: null, isFree: false, capacity: 45, source: 'seed',
  },
  {
    id: 'seed_087',
    name: '阿佐ヶ谷駅バイク駐輪場',
    address: '東京都杉並区阿佐谷南1丁目',
    latitude: 35.7058, longitude: 139.6363,
    maxCC: 125, isFree: false, capacity: 25, source: 'seed',
  },
  {
    id: 'seed_088',
    name: '西荻窪駅バイク駐輪場',
    address: '東京都杉並区西荻北2丁目',
    latitude: 35.7059, longitude: 139.6016,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },

  // ── 中野区 ────────────────────────────────────
  {
    id: 'seed_089',
    name: '中野駅バイク駐輪場',
    address: '東京都中野区中野5丁目',
    latitude: 35.7075, longitude: 139.6659,
    maxCC: null, isFree: false, capacity: 50, source: 'seed',
  },
  {
    id: 'seed_090',
    name: '中野駅南口二輪駐車場',
    address: '東京都中野区中野4丁目',
    latitude: 35.7058, longitude: 139.6664,
    maxCC: 125, isFree: false, capacity: 30, source: 'seed',
  },

  // ── 練馬区 ────────────────────────────────────
  {
    id: 'seed_091',
    name: '練馬駅バイク駐輪場',
    address: '東京都練馬区豊玉北6丁目',
    latitude: 35.7358, longitude: 139.6525,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_092',
    name: '石神井公園駅バイク駐輪場',
    address: '東京都練馬区石神井町7丁目',
    latitude: 35.7311, longitude: 139.6079,
    maxCC: 125, isFree: false, capacity: 25, source: 'seed',
  },
  {
    id: 'seed_093',
    name: '光が丘バイクパーキング',
    address: '東京都練馬区光が丘5丁目',
    latitude: 35.7560, longitude: 139.6334,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },

  // ── 板橋区 ────────────────────────────────────
  {
    id: 'seed_094',
    name: '板橋駅バイク駐輪場',
    address: '東京都板橋区板橋3丁目',
    latitude: 35.7508, longitude: 139.7180,
    maxCC: 125, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_095',
    name: '成増駅バイク駐輪場',
    address: '東京都板橋区成増1丁目',
    latitude: 35.7673, longitude: 139.6446,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_096',
    name: '大山駅バイク駐輪場',
    address: '東京都板橋区大山町',
    latitude: 35.7476, longitude: 139.7047,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },

  // ── 北区 ──────────────────────────────────────
  {
    id: 'seed_097',
    name: '赤羽駅東口バイク駐輪場',
    address: '東京都北区赤羽1丁目',
    latitude: 35.7776, longitude: 139.7210,
    maxCC: null, isFree: false, capacity: 55, source: 'seed',
  },
  {
    id: 'seed_098',
    name: '赤羽駅西口二輪駐車場',
    address: '東京都北区赤羽西1丁目',
    latitude: 35.7781, longitude: 139.7191,
    maxCC: 250, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_099',
    name: '十条駅バイク駐輪場',
    address: '東京都北区中十条2丁目',
    latitude: 35.7620, longitude: 139.7211,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },

  // ── 荒川区 ────────────────────────────────────
  {
    id: 'seed_100',
    name: '日暮里駅バイク駐輪場',
    address: '東京都荒川区西日暮里2丁目',
    latitude: 35.7277, longitude: 139.7709,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_101',
    name: '三河島バイク駐輪場',
    address: '東京都荒川区荒川4丁目',
    latitude: 35.7306, longitude: 139.7820,
    maxCC: 125, isFree: false, capacity: 15, source: 'seed',
  },

  // ── 文京区 ────────────────────────────────────
  {
    id: 'seed_102',
    name: '後楽園・東京ドーム前バイクパーキング',
    address: '東京都文京区後楽1丁目',
    latitude: 35.7057, longitude: 139.7515,
    maxCC: null, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_103',
    name: '本郷三丁目バイク駐輪場',
    address: '東京都文京区本郷3丁目',
    latitude: 35.7080, longitude: 139.7601,
    maxCC: 125, isFree: false, capacity: 15, source: 'seed',
  },
  {
    id: 'seed_104',
    name: '春日駅バイク駐輪場',
    address: '東京都文京区春日2丁目',
    latitude: 35.7073, longitude: 139.7529,
    maxCC: 125, isFree: false, capacity: 18, source: 'seed',
  },

  // ── 葛飾区 ────────────────────────────────────
  {
    id: 'seed_105',
    name: '亀有駅バイク駐輪場',
    address: '東京都葛飾区亀有3丁目',
    latitude: 35.7699, longitude: 139.8469,
    maxCC: null, isFree: false, capacity: 45, source: 'seed',
  },
  {
    id: 'seed_106',
    name: '金町駅バイクパーキング',
    address: '東京都葛飾区金町5丁目',
    latitude: 35.7710, longitude: 139.8637,
    maxCC: 250, isFree: false, capacity: 30, source: 'seed',
  },
  {
    id: 'seed_107',
    name: '柴又帝釈天バイク駐輪場',
    address: '東京都葛飾区柴又7丁目',
    latitude: 35.7552, longitude: 139.8640,
    maxCC: null, isFree: true, capacity: 20, source: 'seed',
  },

  // ── 江戸川区 ──────────────────────────────────
  {
    id: 'seed_108',
    name: '小岩駅バイク駐輪場',
    address: '東京都江戸川区南小岩8丁目',
    latitude: 35.7360, longitude: 139.8803,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_109',
    name: '葛西駅バイク駐輪場',
    address: '東京都江戸川区中葛西4丁目',
    latitude: 35.6698, longitude: 139.8735,
    maxCC: 250, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_110',
    name: '葛西臨海公園バイクパーキング',
    address: '東京都江戸川区臨海町6丁目',
    latitude: 35.6392, longitude: 139.8693,
    maxCC: null, isFree: true, capacity: 25, source: 'seed',
  },

  // ── 大田区 ────────────────────────────────────
  {
    id: 'seed_111',
    name: '蒲田駅バイク駐輪場',
    address: '東京都大田区西蒲田7丁目',
    latitude: 35.5638, longitude: 139.7158,
    maxCC: null, isFree: false, capacity: 60, source: 'seed',
  },
  {
    id: 'seed_112',
    name: '雑色駅バイクパーキング',
    address: '東京都大田区仲六郷2丁目',
    latitude: 35.5534, longitude: 139.7085,
    maxCC: 125, isFree: false, capacity: 20, source: 'seed',
  },
  {
    id: 'seed_113',
    name: '羽田空港第3ターミナル二輪駐車場',
    address: '東京都大田区羽田空港2丁目',
    latitude: 35.5540, longitude: 139.7799,
    maxCC: null, isFree: false, capacity: 50, source: 'seed',
  },

  // ── 多摩エリア ────────────────────────────────
  {
    id: 'seed_114',
    name: '吉祥寺駅バイク駐輪場',
    address: '東京都武蔵野市吉祥寺南町1丁目',
    latitude: 35.7028, longitude: 139.5795,
    maxCC: null, isFree: false, capacity: 60, source: 'seed',
  },
  {
    id: 'seed_115',
    name: '吉祥寺駅北口二輪駐車場',
    address: '東京都武蔵野市吉祥寺北町1丁目',
    latitude: 35.7042, longitude: 139.5791,
    maxCC: 250, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_116',
    name: '三鷹駅バイク駐輪場',
    address: '東京都三鷹市下連雀3丁目',
    latitude: 35.7030, longitude: 139.5604,
    maxCC: null, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_117',
    name: '調布駅バイク駐輪場',
    address: '東京都調布市小島町1丁目',
    latitude: 35.6515, longitude: 139.5456,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_118',
    name: '府中駅バイク駐輪場',
    address: '東京都府中市宮西町2丁目',
    latitude: 35.6686, longitude: 139.4786,
    maxCC: null, isFree: false, capacity: 50, source: 'seed',
  },
  {
    id: 'seed_119',
    name: '立川駅北口バイク駐輪場',
    address: '東京都立川市柴崎町3丁目',
    latitude: 35.6979, longitude: 139.4138,
    maxCC: null, isFree: false, capacity: 80, source: 'seed',
  },
  {
    id: 'seed_120',
    name: '立川駅南口二輪駐車場',
    address: '東京都立川市錦町1丁目',
    latitude: 35.6958, longitude: 139.4152,
    maxCC: 250, isFree: false, capacity: 40, source: 'seed',
  },
  {
    id: 'seed_121',
    name: 'イケア立川バイクパーキング',
    address: '東京都立川市泉町935-1',
    latitude: 35.7091, longitude: 139.3961,
    maxCC: null, isFree: false, capacity: 25, source: 'seed',
  },
  {
    id: 'seed_122',
    name: '八王子駅バイク駐輪場',
    address: '東京都八王子市旭町',
    latitude: 35.6557, longitude: 139.3393,
    maxCC: null, isFree: false, capacity: 70, source: 'seed',
  },
  {
    id: 'seed_123',
    name: '八王子駅南口二輪駐車場',
    address: '東京都八王子市子安町1丁目',
    latitude: 35.6539, longitude: 139.3390,
    maxCC: 250, isFree: false, capacity: 45, source: 'seed',
  },
  {
    id: 'seed_124',
    name: '町田駅バイク駐輪場',
    address: '東京都町田市原町田6丁目',
    latitude: 35.5456, longitude: 139.4446,
    maxCC: null, isFree: false, capacity: 60, source: 'seed',
  },
  {
    id: 'seed_125',
    name: '多摩センター駅バイク駐輪場',
    address: '東京都多摩市落合1丁目',
    latitude: 35.6379, longitude: 139.4391,
    maxCC: null, isFree: false, capacity: 35, source: 'seed',
  },
  {
    id: 'seed_126',
    name: '国分寺駅バイク駐輪場',
    address: '東京都国分寺市本町2丁目',
    latitude: 35.7013, longitude: 139.4773,
    maxCC: null, isFree: false, capacity: 45, source: 'seed',
  },
  {
    id: 'seed_127',
    name: '武蔵小金井駅バイクパーキング',
    address: '東京都小金井市本町6丁目',
    latitude: 35.6987, longitude: 139.5117,
    maxCC: 125, isFree: false, capacity: 25, source: 'seed',
  },
];

/**
 * ユーザーのCCで駐輪場をフィルタリング
 *   50     (原付一種)  → 全駐輪場を表示
 *   125    (原付二種)  → 50cc専用を除外
 *   400    (普通二輪)  → 250cc以上または制限なしのみ
 *   null   (大型二輪)  → 制限なし（maxCC=null）のみ
 */
export function filterByCC(spots: ParkingPin[], userCC: number | null): ParkingPin[] {
  if (userCC === 50)   return spots;
  if (userCC === 125)  return spots.filter((s) => s.maxCC !== 50);
  if (userCC === 400)  return spots.filter((s) => s.maxCC === null || (s.maxCC !== null && s.maxCC >= 250));
  if (userCC === null) return spots.filter((s) => s.maxCC === null);
  return spots;
}
