import { useState, useCallback, useEffect, useRef, type ReactElement } from 'react'
import { useGesture } from '@use-gesture/react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, PersonStanding, FileText, Users, Settings, Mars, Venus, Trash2, Plus } from 'lucide-react'
import './App.css'

// ======= 感度定数 =======
const FLICK_MIN = 40

// ======= 外観データ — 男性版 =======

const PART_OPTIONS_MALE = {
  head: {
    label: '頭部',
    up:    { emoji: '💇', label: '髪型',    options: ['ツーブロック', '七三', 'ロマンスグレー', 'スキンヘッド', 'おでこ広め', 'ベリーショート', '黒髪', '茶髪'] },
    left:  { emoji: '👁',  label: '目元・眉', options: ['タレ目', '三白眼', '太眉', '細目', 'キリッ眉'] },
    tap:   { emoji: '👓', label: 'メガネ',   options: ['なし', '黒縁', '銀縁', 'ブランド', 'サングラス', '老眼鏡'] },
    right: { emoji: '✨', label: '肌質',     options: ['日焼け', '色白', '艶肌', 'シミ・そばかす', '普通'] },
    down:  { emoji: '🧔', label: '髭',       options: ['青ヒゲ', 'ダンディ髭', '剃ってる', '無精髭'] },
  },
  wrist: {
    label: '装飾 / ブランド',
    up:    { emoji: '⌚', label: '時計',     options: ['ロレックス', 'オメガ', 'ウブロ', 'ドレス時計', 'Apple Watch', 'なし'] },
    left:  { emoji: '🏷', label: 'ブランド', options: ['ロゴ強め', 'さりげ高級', '国産', 'ノーブランド', '不明'] },
    right: { emoji: '💍', label: '指輪',     options: ['結婚指輪', 'ゴツい指輪', 'なし'] },
    down:  { emoji: '👜', label: 'その他',   options: ['スマホ2台', '長財布', 'ブランド財布', '名刺入れ上質', '特になし'] },
  },
  neck: {
    label: '特徴',
    up:    { emoji: '🫳', label: '肩',        options: ['いかり肩', 'なで肩', 'がっしり', '普通'] },
    left:  { emoji: '🌫', label: '空気感',    options: ['威圧感', '親しみやすい', '神経質', '余裕あり', 'せっかち'] },
    right: { emoji: '🗣', label: '話し方・声', options: ['低音ゆっくり', '早口', 'よく笑う', '物静か', '声大きい'] },
    down:  { emoji: '🧍', label: 'シルエット', options: ['ガッチリ', 'ぽっちゃり', '細身', '姿勢いい', '小柄'] },
  },
  torso: {
    label: '上半身',
    up:    { emoji: '👔', label: 'スタイル', options: ['スリーピース', 'ジャケパン', 'オフィスカジュアル', '作業着', 'ハイブランド私服'] },
    down:  { emoji: '🎨', label: 'カラー',   options: ['ネイビー', 'グレー', '黒', '白', 'ベージュ', 'アースカラー'] },
  },
  shoes: {
    label: '下半身',
    up:    { emoji: '👖', label: 'ズボン', options: ['スラックス', 'チノパン', 'デニム', 'スーツパンツ', 'なし'] },
    down:  { emoji: '👞', label: '靴',    options: ['革靴', 'スニーカー', 'ブランドスニーカー', 'ローファー', 'ブーツ', 'なし'] },
  },
} as const

// ======= 外観データ — 女性版 =======

const PART_OPTIONS_FEMALE = {
  head: {
    label: '頭部',
    up:    { emoji: '💇', label: '髪型',    options: ['ロング', 'ミディアム', 'ショート', 'ボブ', '巻き髪', 'アップ', 'ポニテ'] },
    left:  { emoji: '👁',  label: '目元・眉', options: ['二重ナチュラル', 'バッチリ二重', '一重クール', '細眉', '太眉', 'マスカラ濃'] },
    tap:   { emoji: '💄', label: 'メイク印象', options: ['ナチュラル', '韓国系', '濃いめ', '清楚系', '個性的', 'すっぴん風'] },
    right: { emoji: '✨', label: '肌質',     options: ['マット', 'ツヤ肌', '色白', '健康的', '気になりあり'] },
    down:  { emoji: '🎨', label: '髪色',     options: ['黒', 'ダークブラウン', 'ブラウン', 'ハイトーン', 'インナーカラー', '金'] },
  },
  wrist: {
    label: '装飾 / ブランド',
    up:    { emoji: '👜', label: 'バッグ',   options: ['トート', 'クラッチ', 'ショルダー', 'ミニバッグ', 'ブランドロゴ', 'エコバッグ'] },
    left:  { emoji: '🏷', label: 'ブランド', options: ['ノーブランド', 'プチプラ混', 'セレクト系', 'ハイブランド', '韓国系'] },
    right: { emoji: '💍', label: 'アクセサリー', options: ['シンプル', 'ゴールド多め', 'ネイル派手', 'ネイルシンプル', 'ピアス大きめ', 'なし'] },
    down:  { emoji: '🕶', label: 'メガネ・他', options: ['メガネ', 'サングラス', '帽子', 'スカーフ', '時計'] },
  },
  neck: {
    label: '特徴',
    up:    { emoji: '🫳', label: '肩・デコルテ', options: ['細め', 'がっしり', 'なで肩', '目立つデコルテ'] },
    left:  { emoji: '🌫', label: '空気感',      options: ['明るい', 'クール', '知的', '癒し系', 'ミステリアス', 'ギャップあり'] },
    right: { emoji: '🗣', label: '話し方・声',   options: ['敬語丁寧', 'フランク', '低め落ち着く', '高め可愛い', '早口', '聞き上手'] },
    down:  { emoji: '🧍', label: 'シルエット',   options: ['スレンダー', 'グラマー', '小柄', '高身長', '標準'] },
  },
  torso: {
    label: '上半身',
    up:    { emoji: '👗', label: 'スタイル', options: ['フェミニン', 'カジュアル', '清楚', 'モード', '韓国系', 'スポーティ', 'ギャル系'] },
    down:  { emoji: '🎨', label: 'カラー',   options: ['モノトーン', 'アース系', 'パステル', 'ビビッド', '柄物多め'] },
  },
  shoes: {
    label: '下半身',
    up:    { emoji: '👗', label: 'ボトムス', options: ['ミニスカ', 'ミモレ', 'マキシ', 'スキニー', 'ワイドパンツ', 'ショーパン', 'デニム'] },
    down:  { emoji: '👠', label: '靴',      options: ['ヒール高め', 'ローヒール', 'フラット', 'ブーツ', 'スニーカー', 'サンダル'] },
  },
} as const

// ======= 情報チップ — 男性版 =======
const TOPICS_CHIPS_M  = ['仕事の話', '趣味', 'ゴルフ', '旅行', '家族', 'グルメ', 'スポーツ', '政治・経済', '車・バイク', '音楽'] as const
const DRINK_CHIPS_M   = ['ビール', 'ウイスキー', '焼酎', '日本酒', 'ワイン', 'シャンパン', 'ノンアル', 'ウーロン茶'] as const
const TOBACCO_CHIPS_M = ['紙巻き', '加熱式(IQOSなど)', '葉巻', '吸わない'] as const
const SERVICE_CHIPS_M = ['静かに過ごしたい', '話しかけてほしい', '褒めてほしい', 'ドリンクおすすめ多め', '放置気味でOK'] as const
const NG_CHIPS_M      = ['過去の話を掘り下げる', '仕事の質問', '年齢の話', '他のお客さんの話', '宗教・政治', '写真撮影'] as const

// ======= 情報チップ — 女性版 =======
const TOPICS_CHIPS_F  = ['仕事', '恋愛', '旅行', 'グルメ', '美容', 'ショッピング', 'SNS', '家族', '推し活'] as const
const DRINK_CHIPS_F   = ['ソフトドリンク', 'ワイン', 'シャンパン', 'カクテル', 'ビール', '飲まない'] as const
const TOBACCO_CHIPS_F = ['吸わない', '電子タバコ', '紙タバコ'] as const
const SERVICE_CHIPS_F = ['ベタ褒め', '共感優先', '知的に話す', '聞き役', 'いじる', '距離感大事'] as const
const NG_CHIPS_F      = ['容姿に触れない', '年齢聞かない', '競合NG', '仕事深掘りNG', 'プライベート立入禁止'] as const

// ======= 型 =======

type PartKey = keyof typeof PART_OPTIONS_MALE
type CategoryKey = 'up' | 'down' | 'left' | 'right' | 'tap'
type FlickDir = 'up' | 'down' | 'left' | 'right' | 'tap'
type AppMode = 'appearance' | 'info' | 'edit' | 'settings'
type Gender = 'male' | 'female'

type AnyPartCfg = typeof PART_OPTIONS_MALE[PartKey]
type CatCfg = { emoji: string; label: string; options: readonly string[] }

type PartOptionsTable = typeof PART_OPTIONS_MALE

function getPartOptions(gender: Gender): PartOptionsTable {
  // 男女で options リテラルが異なるため構造同型として扱う
  return (gender === 'female' ? PART_OPTIONS_FEMALE : PART_OPTIONS_MALE) as unknown as PartOptionsTable
}

function getCatCfg(cfg: AnyPartCfg, dir: CategoryKey): CatCfg | undefined {
  if (dir === 'up'    && 'up'    in cfg) return cfg.up    as CatCfg
  if (dir === 'down'  && 'down'  in cfg) return cfg.down  as CatCfg
  if (dir === 'left'  && 'left'  in cfg) return cfg.left  as CatCfg
  if (dir === 'right' && 'right' in cfg) return cfg.right as CatCfg
  if (dir === 'tap'   && 'tap'   in cfg) return cfg.tap   as CatCfg
  return undefined
}

interface ChipSet {
  topics:  readonly string[]
  drinks:  readonly string[]
  tobacco: readonly string[]
  service: readonly string[]
  ng:      readonly string[]
}

function getChipSet(gender: Gender): ChipSet {
  return gender === 'female'
    ? { topics: TOPICS_CHIPS_F, drinks: DRINK_CHIPS_F, tobacco: TOBACCO_CHIPS_F, service: SERVICE_CHIPS_F, ng: NG_CHIPS_F }
    : { topics: TOPICS_CHIPS_M, drinks: DRINK_CHIPS_M, tobacco: TOBACCO_CHIPS_M, service: SERVICE_CHIPS_M, ng: NG_CHIPS_M }
}

interface Entry {
  partKey: PartKey
  catKey: CategoryKey
  partLabel: string
  catLabel: string
  value: string
}

interface OpenPanel {
  partKey: PartKey
  catKey: CategoryKey
  title: string
  emoji: string
  options: readonly string[]
}

interface InfoData {
  nickname: string
  topics: string[]
  drinks: string[]
  tobacco: string[]
  serviceStyle: string[]
  ngTags: string[]
  memo: string
}

interface Customer {
  id: string
  gender: Gender
  entries: Entry[]
  info: InfoData
  createdAt: number
  updatedAt: number
}

const INITIAL_INFO: InfoData = {
  nickname: '',
  topics: [],
  drinks: [],
  tobacco: [],
  serviceStyle: [],
  ngTags: [],
  memo: '',
}

const LS_KEY = 'gnh.customers.v1'

function makeCustomer(gender: Gender = 'male'): Customer {
  const now = Date.now()
  return { id: crypto.randomUUID(), gender, entries: [], info: { ...INITIAL_INFO }, createdAt: now, updatedAt: now }
}

function loadCustomers(): { customers: Customer[]; currentId: string } {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { customers: Customer[]; currentId: string }
      if (parsed.customers && parsed.customers.length > 0) {
        const customers = parsed.customers.map(c => ({ ...c, gender: (c.gender ?? 'male') as Gender }))
        const valid = customers.some(c => c.id === parsed.currentId)
        return { customers, currentId: valid ? parsed.currentId : customers[0].id }
      }
    }
  } catch (_) { /* ignore */ }
  const c = makeCustomer()
  return { customers: [c], currentId: c.id }
}

function formatTimeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60)   return 'たった今'
  if (diff < 3600) return `${Math.floor(diff / 60)}分前`
  if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`
  return `${Math.floor(diff / 86400)}日前`
}

function resolveFlick(dx: number, dy: number, dist: number): FlickDir {
  if (dist < FLICK_MIN) return 'tap'
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

// ======= Body SVG =======

function litFill(r: number): string {
  return `rgba(201,168,76,${(0.06 + r * 0.5).toFixed(3)})`
}
function litStroke(r: number): string {
  return r >= 1 ? '#f0d080' : r > 0 ? '#c9a84c' : '#3a2e10'
}
function litWidth(r: number): number {
  return r >= 1 ? 2.6 : r > 0 ? 1.9 : 1.1
}

function BodySVG({ ratios, gender }: { ratios: Record<PartKey, number>; gender: Gender }): ReactElement {
  const head  = ratios.head
  const neck  = ratios.neck
  const torso = ratios.torso
  const wrist = ratios.wrist
  const shoes = ratios.shoes

  if (gender === 'female') {
    return (
      <svg viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
        <ellipse cx="100" cy="42" rx="28" ry="34" fill={litFill(head)} stroke={litStroke(head)} strokeWidth={litWidth(head)} />
        <rect x="92" y="74" width="16" height="18" rx="4" fill={litFill(neck)} stroke={litStroke(neck)} strokeWidth={litWidth(neck)} />
        <ellipse cx="140" cy="94" rx="12" ry="9" fill={litFill(neck)} stroke={litStroke(neck)} strokeWidth={litWidth(neck)} />
        <ellipse cx="60" cy="94" rx="12" ry="9" fill={litFill(neck)} stroke={litStroke(neck)} strokeWidth={litWidth(neck)} />
        <path d="M64 94 Q58 120 56 150 Q54 170 60 190 L140 190 Q146 170 144 150 Q142 120 136 94 Z" fill={litFill(torso)} stroke={litStroke(torso)} strokeWidth={litWidth(torso)} />
        <path d="M64 98 Q50 122 44 172 Q40 182 44 188 Q52 194 58 186 Q60 154 74 122 Z" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
        <path d="M136 98 Q150 122 156 172 Q160 182 156 188 Q148 194 142 186 Q140 154 126 122 Z" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
        <ellipse cx="44" cy="190" rx="10" ry="7" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
        <ellipse cx="156" cy="190" rx="10" ry="7" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
        <path d="M60 190 Q54 210 52 240 Q50 270 56 310 Q60 340 68 352 Q80 360 88 350 Q94 338 96 298 Q98 258 100 210 Q102 258 104 298 Q106 338 112 350 Q120 360 132 352 Q140 340 144 310 Q150 270 148 240 Q146 210 140 190 Z" fill={litFill(shoes)} stroke={litStroke(shoes)} strokeWidth={litWidth(shoes)} />
        <ellipse cx="72" cy="356" rx="14" ry="7" fill={litFill(shoes)} stroke={litStroke(shoes)} strokeWidth={litWidth(shoes)} />
        <ellipse cx="128" cy="356" rx="14" ry="7" fill={litFill(shoes)} stroke={litStroke(shoes)} strokeWidth={litWidth(shoes)} />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 200 420" xmlns="http://www.w3.org/2000/svg" style={{ width: '100%', height: '100%' }}>
      <ellipse cx="100" cy="44" rx="32" ry="38" fill={litFill(head)} stroke={litStroke(head)} strokeWidth={litWidth(head)} />
      <rect x="88" y="80" width="24" height="18" rx="4" fill={litFill(neck)} stroke={litStroke(neck)} strokeWidth={litWidth(neck)} />
      <ellipse cx="148" cy="98" rx="14" ry="10" fill={litFill(neck)} stroke={litStroke(neck)} strokeWidth={litWidth(neck)} />
      <ellipse cx="52" cy="98" rx="14" ry="10" fill={litFill(neck)} stroke={litStroke(neck)} strokeWidth={litWidth(neck)} />
      <path d="M62 98 Q54 128 50 196 L150 196 Q146 128 138 98 Z" fill={litFill(torso)} stroke={litStroke(torso)} strokeWidth={litWidth(torso)} />
      <path d="M62 102 Q46 126 38 178 Q34 188 38 194 Q46 200 52 192 Q54 158 70 126 Z" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
      <path d="M138 102 Q154 126 162 178 Q166 188 162 194 Q154 200 148 192 Q146 158 130 126 Z" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
      <ellipse cx="40" cy="196" rx="12" ry="8" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
      <ellipse cx="160" cy="196" rx="12" ry="8" fill={litFill(wrist)} stroke={litStroke(wrist)} strokeWidth={litWidth(wrist)} />
      <path d="M74 196 Q68 258 64 318 Q62 338 70 350 Q82 358 90 348 Q96 336 98 298 Q100 258 100 196 Z" fill={litFill(shoes)} stroke={litStroke(shoes)} strokeWidth={litWidth(shoes)} />
      <path d="M126 196 Q132 258 136 318 Q138 338 130 350 Q118 358 110 348 Q104 336 102 298 Q100 258 100 196 Z" fill={litFill(shoes)} stroke={litStroke(shoes)} strokeWidth={litWidth(shoes)} />
      <ellipse cx="76" cy="358" rx="16" ry="8" fill={litFill(shoes)} stroke={litStroke(shoes)} strokeWidth={litWidth(shoes)} />
      <ellipse cx="124" cy="358" rx="16" ry="8" fill={litFill(shoes)} stroke={litStroke(shoes)} strokeWidth={litWidth(shoes)} />
    </svg>
  )
}

// ======= FlickGuides =======

interface GuideValue {
  cat: string
  val: string
}

interface DirGuide {
  dir: FlickDir
  emoji: string
  label: string
  values?: GuideValue[]
}

function FlickGuides({
  guides,
  flickHint,
  tapLabel,
  tapValues,
}: {
  guides: DirGuide[]
  flickHint: FlickDir | null
  tapLabel?: string
  tapValues?: GuideValue[]
}) {
  const byDir = Object.fromEntries(guides.map(g => [g.dir, g])) as Partial<Record<FlickDir, DirGuide>>

  const renderValues = (values?: GuideValue[]) =>
    values && values.length > 0 ? (
      <div className="flick-guide-values">
        {values.map((v, i) => (
          <span key={i} className="flick-guide-value">
            <span className="fv-cat">{v.cat}</span>{v.val}
          </span>
        ))}
      </div>
    ) : null

  const renderBadge = (dir: 'up' | 'down' | 'left' | 'right', pos: string, arrow: ReactElement) => {
    const g = byDir[dir]
    if (!g) return null
    const isActive = flickHint === dir
    const head = (
      <div className="flick-guide-head">
        {(dir === 'up' || dir === 'left')
          ? <><span className="flick-guide-arrow">{arrow}</span><span className="flick-guide-emoji">{g.emoji}</span><span className="flick-guide-label">{g.label}</span></>
          : <><span className="flick-guide-label">{g.label}</span><span className="flick-guide-emoji">{g.emoji}</span><span className="flick-guide-arrow">{arrow}</span></>}
      </div>
    )
    return (
      <div className={`flick-guide flick-guide--${pos} ${isActive ? 'active' : ''}`}>
        {head}
        {renderValues(g.values)}
      </div>
    )
  }

  return (
    <>
      {renderBadge('up',    'up',    <ChevronUp size={18} strokeWidth={2.5} />)}
      {renderBadge('down',  'down',  <ChevronDown size={18} strokeWidth={2.5} />)}
      {renderBadge('left',  'left',  <ChevronLeft size={18} strokeWidth={2.5} />)}
      {renderBadge('right', 'right', <ChevronRight size={18} strokeWidth={2.5} />)}
      {tapLabel && (
        <div className={`flick-guide flick-guide--center ${flickHint !== null ? 'dim' : ''}`}>
          <div className="flick-guide-head">
            <span className="tap-badge">TAP</span>
            <span className="flick-guide-label flick-guide-label--center">{tapLabel}</span>
          </div>
          {renderValues(tapValues)}
        </div>
      )}
    </>
  )
}

// ======= OptionList =======

function ValueFlickPicker({
  panel,
  onConfirm,
  onClose,
}: {
  panel: OpenPanel
  onConfirm: (value: string) => void
  onClose: () => void
}) {
  const [flickHint, setFlickHint] = useState<FlickDir | null>(null)
  const [showInput, setShowInput] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // options[0..3] を up/down/left/right に割当（4 個前提、足りない方向は guides から除外）
  const DIRS = ['up', 'down', 'left', 'right'] as const
  const opts = panel.options.slice(0, 4)

  const openFreeInput = () => {
    setShowInput(true)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleAdd = () => {
    const v = draft.trim()
    if (v) onConfirm(v)
  }

  const bindPicker = useGesture(
    {
      onDrag: ({ movement: [mx, my], last, tap }) => {
        if (tap) {
          openFreeInput()
          return
        }
        const dist = Math.hypot(mx, my)
        if (!last && dist > 20) {
          const dir = resolveFlick(mx, my, dist)
          if (dir !== 'tap') setFlickHint(dir)
        }
        if (last) {
          setFlickHint(null)
          const dir = resolveFlick(mx, my, dist)
          if (dir === 'tap') { openFreeInput(); return }
          const idx = DIRS.indexOf(dir as typeof DIRS[number])
          if (idx !== -1 && opts[idx]) onConfirm(opts[idx])
        }
      },
    },
    { drag: { filterTaps: true, threshold: 8, enabled: !showInput } }
  )

  const guides: DirGuide[] = DIRS
    .map((dir, i): DirGuide | null =>
      opts[i] ? { dir, emoji: '', label: opts[i] } : null
    )
    .filter((g): g is DirGuide => g !== null)

  const hintIdx = flickHint ? DIRS.indexOf(flickHint as typeof DIRS[number]) : -1
  const hintLabel = hintIdx !== -1 ? opts[hintIdx] : undefined

  return (
    <div className="opt-overlay" {...bindPicker()} style={{ touchAction: 'none' }}>
      <div className="opt-header">
        <span className="opt-emoji">{panel.emoji}</span>
        <span className="opt-title">{panel.title}</span>
      </div>

      <div className="zoom-icon-area zoom-icon-area--big">
        <FlickGuides guides={guides} flickHint={flickHint} tapLabel="自由入力" />

        <div className="zoom-icon-center">
          {!showInput && (
            <div className="value-center-prompt" onClick={openFreeInput}>
              タップ 自由入力
            </div>
          )}
          {hintLabel && !showInput && (
            <div className="flick-preview">{hintLabel}</div>
          )}
        </div>
      </div>

      {showInput && (
        <div className="opt-free-row opt-free-row--bottom" onPointerDown={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            className="opt-free-input"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="自由に入力"
          />
          <button className="opt-free-add-btn" onClick={handleAdd}>決定</button>
          <button
            className="opt-free-cancel-btn"
            onClick={() => { setShowInput(false); setDraft('') }}
            aria-label="自由入力をキャンセル"
          >×</button>
        </div>
      )}

      <button
        className="back-btn-wide"
        onClick={(e) => { e.stopPropagation(); onClose() }}
      ><ArrowLeft size={15} strokeWidth={2.5} /> 戻る</button>
    </div>
  )
}

// ======= PartZoom — gender(opts) を prop で受け取る =======

function PartZoom({
  partKey,
  opts,
  onOpenPanel,
  onBack,
}: {
  partKey: PartKey
  opts: typeof PART_OPTIONS_MALE
  onOpenPanel: (catKey: CategoryKey) => void
  onBack: () => void
}) {
  const cfg = opts[partKey]
  const [flickHint, setFlickHint] = useState<FlickDir | null>(null)

  const bindZoom = useGesture(
    {
      onDrag: ({ movement: [mx, my], last, tap }) => {
        if (tap) {
          if ('tap' in cfg) onOpenPanel('tap')
          return
        }
        const dist = Math.hypot(mx, my)
        if (!last && dist > 20) {
          const dir = resolveFlick(mx, my, dist)
          if (dir !== 'tap') setFlickHint(dir)
        }
        if (last) {
          setFlickHint(null)
          const dir = resolveFlick(mx, my, dist)
          const cat = getCatCfg(cfg, dir)
          if (cat && dir !== 'tap') { onOpenPanel(dir); return }
          if (dir === 'tap' && 'tap' in cfg) onOpenPanel('tap')
        }
      },
    },
    { drag: { filterTaps: true, threshold: 8 } }
  )

  const guides: DirGuide[] = (['up', 'down', 'left', 'right'] as const)
    .map((dir): DirGuide | null => {
      const cat = getCatCfg(cfg, dir)
      return cat ? { dir, emoji: cat.emoji, label: cat.label } : null
    })
    .filter((g): g is DirGuide => g !== null)

  const tapCat = getCatCfg(cfg, 'tap')

  return (
    <div className="zoom-overlay" {...bindZoom()} style={{ touchAction: 'none' }}>
      <div className="zoom-header">
        <h2>{cfg.label}</h2>
      </div>

      <div className="zoom-icon-area zoom-icon-area--big">
        <FlickGuides guides={guides} flickHint={flickHint} tapLabel={tapCat?.label} />

        <div className="zoom-icon-center">
          {tapCat && (
            <div className="zoom-center-badge" onClick={() => onOpenPanel('tap')}>
              <span className="zoom-center-emoji">{tapCat.emoji}</span>
              <span className="tap-badge">TAP</span>
            </div>
          )}
          {flickHint && flickHint !== 'tap' && (
            <div className="flick-preview">
              {getCatCfg(cfg, flickHint)?.emoji ?? ''} {getCatCfg(cfg, flickHint)?.label ?? ''}
            </div>
          )}
        </div>
      </div>

      <button className="back-btn-wide" onClick={(e) => { e.stopPropagation(); onBack() }}><ArrowLeft size={15} strokeWidth={2.5} /> 戻る</button>
    </div>
  )
}

// ======= ChipGroup =======

function ChipGroup({
  label,
  chips,
  selected,
  variant,
  onToggle,
  onAddFree,
}: {
  label: string
  chips: readonly string[]
  selected: string[]
  variant?: 'ng'
  onToggle: (v: string) => void
  onAddFree: (v: string) => void
}) {
  const [showInput, setShowInput] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const chipSet = new Set(chips as readonly string[])
  const freeSelected = selected.filter(v => !chipSet.has(v))
  const allChips = [...chips, ...freeSelected]

  const handleAdd = () => {
    const v = draft.trim()
    if (v) { onAddFree(v); setDraft('') }
    setShowInput(false)
  }

  return (
    <div className="info-section">
      <div className="info-section-label">{label}</div>
      <div className="chip-wrap">
        {allChips.map(chip => {
          const isSelected = selected.includes(chip)
          const cls = [
            'chip',
            isSelected ? 'chip--selected' : '',
            variant === 'ng' && isSelected ? 'chip--ng-selected' : '',
            variant === 'ng' ? 'chip--ng' : '',
          ].filter(Boolean).join(' ')
          return (
            <button key={chip} className={cls} onClick={() => onToggle(chip)}>
              {chip}
            </button>
          )
        })}
        {!showInput && (
          <button
            className="chip chip--add"
            onClick={() => { setShowInput(true); setTimeout(() => inputRef.current?.focus(), 50) }}
          >
            ＋自由入力
          </button>
        )}
        {showInput && (
          <div className="chip-free-input-row">
            <input
              ref={inputRef}
              className="chip-free-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
              placeholder="入力して追加"
            />
            <button className="chip-free-add-btn" onClick={handleAdd}>追加</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ======= InfoTab =======

function InfoTab({
  info,
  gender,
  onChange,
}: {
  info: InfoData
  gender: Gender
  onChange: (next: InfoData) => void
}) {
  const nicknameChips = ['社長', '専務', '先生', '会長', '部長', 'さん'] as const
  const cs = getChipSet(gender)

  const toggle = (field: keyof Pick<InfoData, 'topics'|'drinks'|'tobacco'|'serviceStyle'|'ngTags'>, v: string) => {
    const arr = info[field] as string[]
    onChange({ ...info, [field]: arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v] })
  }

  return (
    <div className="info-tab">
      <div className="info-section">
        <div className="info-section-label">呼び名</div>
        <div className="nickname-row">
          <input
            className="nickname-input"
            value={info.nickname}
            onChange={e => onChange({ ...info, nickname: e.target.value })}
            placeholder="例: 田中社長"
          />
          <div className="chip-wrap chip-wrap--inline">
            {nicknameChips.map(chip => (
              <button
                key={chip}
                className={`chip chip--small ${info.nickname.endsWith(chip) ? 'chip--selected' : ''}`}
                onClick={() => {
                  const base = info.nickname.replace(new RegExp(`(${nicknameChips.join('|')})$`), '')
                  onChange({ ...info, nickname: base + chip })
                }}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ChipGroup label="会話した話題" chips={cs.topics} selected={info.topics}
        onToggle={v => toggle('topics', v)}
        onAddFree={v => onChange({ ...info, topics: [...info.topics, v] })} />

      <ChipGroup label="好み — ドリンク" chips={cs.drinks} selected={info.drinks}
        onToggle={v => toggle('drinks', v)}
        onAddFree={v => onChange({ ...info, drinks: [...info.drinks, v] })} />

      <ChipGroup label="好み — タバコ" chips={cs.tobacco} selected={info.tobacco}
        onToggle={v => toggle('tobacco', v)}
        onAddFree={() => {}} />

      <ChipGroup label="好み — 接客スタイル" chips={cs.service} selected={info.serviceStyle}
        onToggle={v => toggle('serviceStyle', v)}
        onAddFree={v => onChange({ ...info, serviceStyle: [...info.serviceStyle, v] })} />

      <ChipGroup label="NG・地雷" chips={cs.ng} selected={info.ngTags} variant="ng"
        onToggle={v => toggle('ngTags', v)}
        onAddFree={v => onChange({ ...info, ngTags: [...info.ngTags, v] })} />

      <div className="info-section">
        <div className="info-section-label">自由メモ</div>
        <textarea
          className="info-memo"
          value={info.memo}
          onChange={e => onChange({ ...info, memo: e.target.value })}
          placeholder="気になったことを何でも..."
          rows={4}
        />
      </div>

      <div className="info-bottom-spacer" />
    </div>
  )
}

// ======= SettingsTab — 男女切替 =======

function SettingsTab({
  gender,
  onChangeGender,
}: {
  gender: Gender
  onChangeGender: (g: Gender) => void
}) {
  return (
    <div className="settings-tab">
      <div className="settings-section">
        <div className="settings-section-label">このお客様の性別</div>
        <div className="gender-toggle">
          <button
            className={`gender-btn ${gender === 'male' ? 'gender-btn--active' : ''}`}
            onClick={() => onChangeGender('male')}
          >
            <span className="gender-btn-emoji"><Mars size={28} strokeWidth={2} /></span>
            <span className="gender-btn-label">男性</span>
          </button>
          <button
            className={`gender-btn ${gender === 'female' ? 'gender-btn--active' : ''}`}
            onClick={() => onChangeGender('female')}
          >
            <span className="gender-btn-emoji"><Venus size={28} strokeWidth={2} /></span>
            <span className="gender-btn-label">女性</span>
          </button>
        </div>
        <p className="settings-note">切り替えると外観・情報の選択肢が変わります。<br />入力済みの値はそのまま保持されます。</p>
      </div>
      <div className="info-bottom-spacer" />
    </div>
  )
}

// ======= CustomerList =======

function CustomerList({
  customers,
  currentId,
  onSelect,
  onNew,
  onDelete,
}: {
  customers: Customer[]
  currentId: string
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}) {
  const sorted = [...customers].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <div className="customer-list">
      <button className="customer-new-btn" onClick={onNew}>
        <span><Plus size={18} strokeWidth={2} /> 新規のお客様</span>
      </button>

      {sorted.map((c) => {
        const isCurrent = c.id === currentId
        const displayName = c.info.nickname || `お客様 ${customers.length - customers.indexOf(c)}`
        const entriesCount = c.entries.length
        const infoCount =
          (c.info.nickname ? 1 : 0) +
          c.info.topics.length + c.info.drinks.length + c.info.tobacco.length +
          c.info.serviceStyle.length + c.info.ngTags.length + (c.info.memo ? 1 : 0)
        const genderLabel = c.gender === 'female'
          ? <Venus size={15} strokeWidth={2} />
          : <Mars size={15} strokeWidth={2} />

        return (
          <div
            key={c.id}
            className={`customer-card ${isCurrent ? 'customer-card--current' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="customer-card-main">
              <div className="customer-card-name">
                {isCurrent && <span className="customer-card-now">NOW</span>}
                <span className="customer-card-gender">{genderLabel}</span>
                {displayName}
              </div>
              <div className="customer-card-meta">
                外観 {entriesCount} 項目 / 情報 {infoCount} 件
                <span className="customer-card-time">{formatTimeAgo(c.updatedAt)}</span>
              </div>
            </div>
            <button
              className="customer-card-delete"
              onClick={e => { e.stopPropagation(); onDelete(c.id) }}
              aria-label="削除"
            >
              <Trash2 size={18} strokeWidth={2} />
            </button>
          </div>
        )
      })}

      {customers.length === 0 && (
        <p className="customer-list-empty">まだお客様がいません</p>
      )}

      <div className="info-bottom-spacer" />
    </div>
  )
}

// ======= Main App =======

export default function App() {
  const [mode,       setMode]       = useState<AppMode>('appearance')
  const [zoomedPart, setZoomedPart] = useState<PartKey | null>(null)
  const [openPanel,  setOpenPanel]  = useState<OpenPanel | null>(null)
  const [flickHint,  setFlickHint]  = useState<FlickDir | null>(null)

  const [initial] = useState(loadCustomers)
  const [customers,  setCustomers]  = useState<Customer[]>(initial.customers)
  const [currentId,  setCurrentId]  = useState<string>(initial.currentId)

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ customers, currentId }))
  }, [customers, currentId])

  const current = customers.find(c => c.id === currentId) ?? customers[0]
  const entries = current?.entries ?? []
  const info    = current?.info    ?? { ...INITIAL_INFO }
  const gender  = current?.gender  ?? 'male'

  const OPTS = getPartOptions(gender)

  const updateCurrent = useCallback((patch: Partial<Customer>) => {
    setCustomers(prev => prev.map(c =>
      c.id === currentId ? { ...c, ...patch, updatedAt: Date.now() } : c
    ))
  }, [currentId])

  const handleNewCustomer = useCallback(() => {
    const c = makeCustomer('male')
    setCustomers(prev => [...prev, c])
    setCurrentId(c.id)
    setMode('appearance')
    setZoomedPart(null)
    setOpenPanel(null)
  }, [])

  const handleSelectCustomer = useCallback((id: string) => {
    setCurrentId(id)
    setMode('appearance')
    setZoomedPart(null)
    setOpenPanel(null)
  }, [])

  const handleDeleteCustomer = useCallback((id: string) => {
    setCustomers(prev => {
      const next = prev.filter(c => c.id !== id)
      if (next.length === 0) {
        const c = makeCustomer('male')
        setCurrentId(c.id)
        return [c]
      }
      if (id === currentId) {
        setCurrentId(next[next.length - 1].id)
      }
      return next
    })
  }, [currentId])

  const bindTop = useGesture(
    {
      onDrag: ({ movement: [mx, my], last, tap }) => {
        if (tap) { setZoomedPart('torso'); return }
        const dist = Math.hypot(mx, my)
        if (!last && dist > 20) {
          const dir = resolveFlick(mx, my, dist)
          if (dir !== 'tap') setFlickHint(dir)
        }
        if (last) {
          setFlickHint(null)
          const dir = resolveFlick(mx, my, dist)
          if      (dir === 'up')    setZoomedPart('head')
          else if (dir === 'right') setZoomedPart('neck')
          else if (dir === 'left')  setZoomedPart('wrist')
          else if (dir === 'down')  setZoomedPart('shoes')
          else                      setZoomedPart('torso')
        }
      },
    },
    { drag: { filterTaps: true, threshold: 8 } }
  )

  const handleOpenPanel = useCallback((partKey: PartKey, catKey: CategoryKey) => {
    const cfg = OPTS[partKey]
    const cat = getCatCfg(cfg, catKey)
    if (!cat) return
    setOpenPanel({ partKey, catKey, title: cat.label, emoji: cat.emoji, options: cat.options })
  }, [OPTS])

  const handleConfirm = useCallback((value: string) => {
    if (!openPanel) return
    const { partKey, catKey } = openPanel
    const partLabel = OPTS[partKey].label
    const cat = getCatCfg(OPTS[partKey], catKey)
    const catLabel = cat?.label ?? catKey
    const newEntries = [
      ...entries.filter(e => !(e.partKey === partKey && e.catKey === catKey)),
      { partKey, catKey, partLabel, catLabel, value },
    ]
    updateCurrent({ entries: newEntries })
    setOpenPanel(null)
  }, [openPanel, entries, OPTS, updateCurrent])

  const backToTop = useCallback(() => { setOpenPanel(null); setZoomedPart(null) }, [])

  const CAT_KEYS: CategoryKey[] = ['up', 'down', 'left', 'right', 'tap']
  const ratios = (Object.keys(OPTS) as PartKey[]).reduce((acc, p) => {
    const total = CAT_KEYS.filter(k => k in OPTS[p]).length
    const filled = entries.filter(e => e.partKey === p).length
    acc[p] = total ? filled / total : 0
    return acc
  }, {} as Record<PartKey, number>)

  const valuesOf = (pk: PartKey): GuideValue[] =>
    entries.filter(e => e.partKey === pk).map(e => ({ cat: e.catLabel, val: e.value }))

  const topGuides: DirGuide[] = [
    { dir: 'up',    emoji: '👤', label: '頭部',          values: valuesOf('head') },
    { dir: 'right', emoji: '💬', label: '特徴',          values: valuesOf('neck') },
    { dir: 'left',  emoji: '⌚', label: '装飾 / ブランド', values: valuesOf('wrist') },
    { dir: 'down',  emoji: '👖', label: '下半身',        values: valuesOf('shoes') },
  ]

  const topFlickLabel: Partial<Record<FlickDir, string>> = {
    up:    '頭部',
    right: '特徴',
    left:  '装飾 / ブランド',
    down:  '下半身',
  }

  const infoCount =
    (info.nickname ? 1 : 0) +
    info.topics.length + info.drinks.length + info.tobacco.length +
    info.serviceStyle.length + info.ngTags.length + (info.memo ? 1 : 0)

  const currentName = current?.info.nickname || `お客様`
  const genderLabel = gender === 'female'
    ? <Venus size={16} strokeWidth={2} />
    : <Mars size={16} strokeWidth={2} />

  return (
    <div className="app">
      <div className="header">
        <h1>GnH</h1>
        {mode !== 'edit' && (
          <div className="header-customer-name">
            <span className="header-gender-badge">{genderLabel}</span>
            {currentName}
          </div>
        )}
      </div>

      {/* 外観モード */}
      {mode === 'appearance' && (
        <>
          <div className="figure-area" {...bindTop()} style={{ touchAction: 'none' }}>
            {info.nickname && <div className="ov-nickname">{info.nickname}</div>}

            <FlickGuides guides={topGuides} flickHint={flickHint} tapLabel="上半身" tapValues={valuesOf('torso')} />
            <div className="body-svg-wrapper">
              <BodySVG ratios={ratios} gender={gender} />
            </div>

            {(() => {
              const prefs = [
                ...info.topics.map(v => ({ cat: '話題', val: v })),
                ...info.drinks.map(v => ({ cat: 'ドリンク', val: v })),
                ...info.tobacco.map(v => ({ cat: 'タバコ', val: v })),
                ...info.serviceStyle.map(v => ({ cat: '接客', val: v })),
              ]
              return prefs.length > 0 ? (
                <div className="ov-info-col">
                  <div className="ov-info-title">情報</div>
                  <div className="ov-prefs">
                    {prefs.map((p, i) => (
                      <span key={i} className="flick-guide-value">
                        <span className="fv-cat">{p.cat}</span>{p.val}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            })()}

            {info.ngTags.length > 0 && (
              <div className="ov-ng">
                <span className="ov-ng-label">NG</span>
                <span className="ov-ng-items">{info.ngTags.join(' ・ ')}</span>
              </div>
            )}

            {flickHint && flickHint !== 'tap' && (
              <div className="flick-preview">{topFlickLabel[flickHint]}</div>
            )}
          </div>
        </>
      )}

      {/* 情報モード */}
      {mode === 'info' && (
        <>
          <InfoTab
            info={info}
            gender={gender}
            onChange={next => updateCurrent({ info: next })}
          />
          <div className="result-log">
            <h2>情報 — {infoCount} 件</h2>
            {infoCount === 0 ? (
              <p className="result-empty">まだ入力がありません</p>
            ) : (
              <div className="result-item-scroll">
                {info.nickname && <div className="result-item"><span className="part-label">呼び名</span><span>{info.nickname}</span></div>}
                {info.topics.length > 0 && <div className="result-item"><span className="part-label">話題</span><span>{info.topics.join(' / ')}</span></div>}
                {info.drinks.length > 0 && <div className="result-item"><span className="part-label">ドリンク</span><span>{info.drinks.join(' / ')}</span></div>}
                {info.tobacco.length > 0 && <div className="result-item"><span className="part-label">タバコ</span><span>{info.tobacco.join(' / ')}</span></div>}
                {info.serviceStyle.length > 0 && <div className="result-item"><span className="part-label">接客</span><span>{info.serviceStyle.join(' / ')}</span></div>}
                {info.ngTags.length > 0 && <div className="result-item result-item--ng"><span className="part-label">NG</span><span>{info.ngTags.join(' / ')}</span></div>}
                {info.memo && <div className="result-item"><span className="part-label">メモ</span><span>{info.memo}</span></div>}
              </div>
            )}
          </div>
        </>
      )}

      {/* 編集 = 客リスト */}
      {mode === 'edit' && (
        <CustomerList
          customers={customers}
          currentId={currentId}
          onSelect={handleSelectCustomer}
          onNew={handleNewCustomer}
          onDelete={handleDeleteCustomer}
        />
      )}

      {/* 設定 = 男女切替 */}
      {mode === 'settings' && (
        <SettingsTab
          gender={gender}
          onChangeGender={g => updateCurrent({ gender: g })}
        />
      )}

      {/* フッターナビ */}
      <div className="footer-nav">
        {([
          { m: 'appearance', icon: <PersonStanding size={20} strokeWidth={2} />, label: '外観' },
          { m: 'info',       icon: <FileText size={20} strokeWidth={2} />, label: '情報' },
          { m: 'edit',       icon: <Users size={20} strokeWidth={2} />, label: '客リスト' },
          { m: 'settings',   icon: <Settings size={20} strokeWidth={2} />, label: '設定' },
        ] as const).map(t => (
          <button
            key={t.m}
            className={`footer-tab ${mode === t.m ? 'footer-tab--active' : ''}`}
            onClick={() => { setMode(t.m); backToTop() }}
          >
            <span className="footer-tab-emoji">{t.icon}</span>
            <span className="footer-tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Overlays */}
      {mode === 'appearance' && zoomedPart && !openPanel && (
        <PartZoom
          partKey={zoomedPart}
          opts={OPTS}
          onOpenPanel={(catKey) => handleOpenPanel(zoomedPart, catKey)}
          onBack={() => setZoomedPart(null)}
        />
      )}

      {mode === 'appearance' && openPanel && (
        <ValueFlickPicker
          panel={openPanel}
          onConfirm={handleConfirm}
          onClose={() => setOpenPanel(null)}
        />
      )}
    </div>
  )
}
