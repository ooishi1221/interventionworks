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
    up:    { emoji: '💇', label: '髪型',        options: ['ツーブロック', '七三/きっちり', 'スキンヘッド', '長め/ロマンスグレー'] },
    left:  { emoji: '👓', label: '目元・メガネ', options: ['タレ目', '鋭い目/三白眼', '黒縁メガネ', 'サングラス系'] },
    right: { emoji: '✨', label: '肌質',        options: ['日焼け', '色白', '艶肌', '普通'] },
    down:  { emoji: '🧔', label: '髭',          options: ['青ヒゲ', 'ダンディ髭', '剃ってる', '無精髭'] },
  },
  wrist: {
    label: '装飾 / ブランド',
    up:    { emoji: '⌚', label: '時計',     options: ['ロレックス系高級', 'Apple Watch', 'ドレス時計', 'なし'] },
    left:  { emoji: '🏷', label: 'ブランド', options: ['ロゴ強め', 'さりげ高級', 'ノーブランド', '不明'] },
    right: { emoji: '💍', label: '指輪',     options: ['結婚指輪', 'ゴツい指輪', 'シンプル指輪', 'なし'] },
    down:  { emoji: '👜', label: '小物',     options: ['スマホ2台', '長財布', 'ブランド財布', '名刺入れ上質'] },
  },
  neck: {
    label: '特徴',
    up:    { emoji: '🫳', label: '肩',         options: ['いかり肩', 'なで肩', 'がっしり', '普通'] },
    left:  { emoji: '🌫', label: '空気感',     options: ['威圧感', '親しみやすい', '余裕あり', 'せっかち'] },
    right: { emoji: '🗣', label: '話し方・声', options: ['低音ゆっくり', '早口', 'よく笑う', '物静か'] },
    down:  { emoji: '🧍', label: 'シルエット', options: ['ガッチリ', 'ぽっちゃり', '細身', '姿勢いい'] },
  },
  torso: {
    label: '上半身',
    up:   { emoji: '👔', label: 'スタイル', options: ['スリーピース', 'ジャケパン', 'オフィスカジュアル', 'ハイブランド私服'] },
    down: { emoji: '🎨', label: 'カラー',   options: ['ネイビー', 'グレー', '黒', 'アースカラー'] },
  },
  shoes: {
    label: '下半身',
    up:   { emoji: '👖', label: 'ズボン', options: ['スラックス', 'チノパン', 'デニム', 'スーツパンツ'] },
    down: { emoji: '👞', label: '靴',     options: ['革靴', 'スニーカー', 'ローファー', 'ブーツ'] },
  },
} as const

// ======= 外観データ — 女性版 =======

const PART_OPTIONS_FEMALE = {
  head: {
    label: '頭部',
    up:    { emoji: '💇', label: '髪型',       options: ['ロング', 'ボブ', '巻き髪', 'ショート/ベリショ'] },
    left:  { emoji: '💄', label: 'メイク印象', options: ['ナチュラル', '韓国系', '濃いめ', '清楚系'] },
    right: { emoji: '✨', label: '肌質',       options: ['ツヤ肌', '色白', 'マット', '健康的'] },
    down:  { emoji: '🎨', label: '髪色',       options: ['黒', 'ブラウン', 'ハイトーン/金', 'インナーカラー'] },
  },
  wrist: {
    label: '装飾 / ブランド',
    up:    { emoji: '👜', label: 'バッグ',       options: ['トート', 'ショルダー', 'ブランドロゴ', 'ミニバッグ'] },
    left:  { emoji: '🏷', label: 'ブランド',     options: ['ハイブランド', 'プチプラ混', 'セレクト系', '韓国系'] },
    right: { emoji: '💍', label: 'アクセサリー', options: ['シンプル', 'ゴールド多め', 'ネイル派手', 'ピアス大きめ'] },
    down:  { emoji: '🕶', label: 'メガネ・他',   options: ['メガネ', 'サングラス', '帽子', '時計'] },
  },
  neck: {
    label: '特徴',
    up:    { emoji: '🫳', label: '肩・デコルテ', options: ['細め', 'がっしり', 'なで肩', '目立つデコルテ'] },
    left:  { emoji: '🌫', label: '空気感',       options: ['明るい', 'クール', '癒し系', 'ミステリアス'] },
    right: { emoji: '🗣', label: '話し方・声',   options: ['敬語丁寧', 'フランク', '高め可愛い', '聞き上手'] },
    down:  { emoji: '🧍', label: 'シルエット',   options: ['スレンダー', 'グラマー', '小柄', '高身長'] },
  },
  torso: {
    label: '上半身',
    up:   { emoji: '👗', label: 'スタイル', options: ['フェミニン', 'カジュアル', '韓国系', 'モード'] },
    down: { emoji: '🎨', label: 'カラー',   options: ['モノトーン', 'パステル', 'ビビッド', 'アース系'] },
  },
  shoes: {
    label: '下半身',
    up:   { emoji: '👗', label: 'ボトムス', options: ['ミニスカ', 'ワイドパンツ', 'デニム', 'スキニー'] },
    down: { emoji: '👠', label: '靴',       options: ['ヒール高め', 'スニーカー', 'ブーツ', 'フラット'] },
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

// ======= 情報チップ — BtoB営業版 (gender共通) =======
const TOPICS_CHIPS_BTOB  = ['AI活用', '技術課題', '採用・組織', '予算感', '新タイトル', '競合動向', '業界話', 'DX推進'] as const
const AUTHORITY_CHIPS    = ['決裁者', '推薦者', '実務担当', '情報収集中'] as const
const COMPANY_SIZE_CHIPS = ['大手', '中堅', 'インディー', 'スタートアップ'] as const
const DEAL_TEMP_CHIPS    = ['今すぐ検討', '3ヶ月以内', '中長期', '情報収集のみ'] as const
const NG_CHIPS_BTOB      = ['前職批判', '競合を下げる', '役職を間違える', '価格を急ぐ', '過剰な売り込み'] as const

// ======= 型 =======

type PartKey = keyof typeof PART_OPTIONS_MALE
type CategoryKey = 'up' | 'down' | 'left' | 'right' | 'tap'
type FlickDir = 'up' | 'down' | 'left' | 'right' | 'tap'
type AppMode = 'appearance' | 'info' | 'edit' | 'settings'
type Gender = 'male' | 'female'
type IndustryPreset = 'hospitality' | 'btob_sales'

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
  labels: { topics: string; drinks: string; tobacco: string; service: string }
}

function getChipSet(gender: Gender, preset: IndustryPreset = 'hospitality'): ChipSet {
  if (preset === 'btob_sales') {
    return {
      topics:  TOPICS_CHIPS_BTOB,
      drinks:  AUTHORITY_CHIPS,
      tobacco: COMPANY_SIZE_CHIPS,
      service: DEAL_TEMP_CHIPS,
      ng:      NG_CHIPS_BTOB,
      labels:  { topics: '商談トピック', drinks: '決裁権限', tobacco: '会社規模', service: '商談温度' },
    }
  }
  const hospitality_labels = { topics: '会話した話題', drinks: '好み — ドリンク', tobacco: '好み — タバコ', service: '好み — 接客スタイル' }
  return gender === 'female'
    ? { topics: TOPICS_CHIPS_F, drinks: DRINK_CHIPS_F, tobacco: TOBACCO_CHIPS_F, service: SERVICE_CHIPS_F, ng: NG_CHIPS_F, labels: hospitality_labels }
    : { topics: TOPICS_CHIPS_M, drinks: DRINK_CHIPS_M, tobacco: TOBACCO_CHIPS_M, service: SERVICE_CHIPS_M, ng: NG_CHIPS_M, labels: hospitality_labels }
}

interface Entry {
  partKey: PartKey
  catKey: CategoryKey
  partLabel: string
  catLabel: string
  value: string
}

interface Visit {
  id: string
  date: number
  note: string
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
  preset: IndustryPreset
  entries: Entry[]
  info: InfoData
  visits: Visit[]
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
  return { id: crypto.randomUUID(), gender, preset: 'hospitality', entries: [], info: { ...INITIAL_INFO }, visits: [], createdAt: now, updatedAt: now }
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function loadCustomers(): { customers: Customer[]; currentId: string } {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { customers: Customer[]; currentId: string }
      if (parsed.customers && parsed.customers.length > 0) {
        const customers = parsed.customers.map(c => ({ ...c, gender: (c.gender ?? 'male') as Gender, preset: ((c as { preset?: string }).preset ?? 'hospitality') as IndustryPreset, visits: ((c as { visits?: Visit[] }).visits ?? []) as Visit[] }))
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

// ======= ProgressBar =======

function ProgressBar({ ratios, opts }: { ratios: Record<PartKey, number>; opts: PartOptionsTable }) {
  const parts = Object.keys(opts) as PartKey[]
  const CAT_CHECK = ['up', 'down', 'left', 'right', 'tap'] as const
  return (
    <div className="progress-bar">
      {parts.map(pk => {
        const total = CAT_CHECK.filter(k => k in opts[pk]).length
        const filled = Math.round(ratios[pk] * total)
        return (
          <div key={pk} className="progress-item">
            <div className="progress-dots">
              {Array.from({ length: total }).map((_, i) => (
                <div key={i} className={`progress-dot ${i < filled ? 'progress-dot--filled' : ''}`} />
              ))}
            </div>
            <div className="progress-label">{opts[pk].label}</div>
          </div>
        )
      })}
    </div>
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
        {dir !== 'down'
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
  const [flashOn, setFlashOn] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // options[0..3] を up/down/left/right に割当（4 個前提、足りない方向は guides から除外）
  const DIRS = ['up', 'down', 'left', 'right'] as const
  const opts = panel.options.slice(0, 4)

  // 中央プロンプトの native click。iOS で同期 focus → キーボード起動するため。
  const openFreeInput = () => {
    inputRef.current?.focus()
    setShowInput(true)
  }

  // 値確定: 振動 (Android) + 視覚フラッシュ (iOS 含む) で完了感を出してから entries 保存
  const triggerConfirm = (value: string) => {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(20)
    }
    setFlashOn(true)
    setTimeout(() => onConfirm(value), 160)
  }

  const handleAdd = () => {
    const v = draft.trim()
    if (v) triggerConfirm(v)
  }

  const bindPicker = useGesture(
    {
      onDrag: ({ movement: [mx, my], last, tap }) => {
        // tap は中央プロンプトの onClick に任せる（iOS キーボード起動のため native click context が必要）
        if (tap) return
        const dist = Math.hypot(mx, my)
        if (!last && dist > 20) {
          const dir = resolveFlick(mx, my, dist)
          if (dir !== 'tap') setFlickHint(dir)
        }
        if (last) {
          setFlickHint(null)
          const dir = resolveFlick(mx, my, dist)
          if (dir === 'tap') return
          const idx = DIRS.indexOf(dir as typeof DIRS[number])
          if (idx !== -1 && opts[idx]) triggerConfirm(opts[idx])
        }
      },
    },
    { drag: { filterTaps: true, threshold: 8, enabled: !showInput && !flashOn } }
  )

  const guides: DirGuide[] = DIRS
    .map((dir, i): DirGuide | null =>
      opts[i] ? { dir, emoji: '', label: opts[i] } : null
    )
    .filter((g): g is DirGuide => g !== null)

  const hintIdx = flickHint ? DIRS.indexOf(flickHint as typeof DIRS[number]) : -1
  const hintLabel = hintIdx !== -1 ? opts[hintIdx] : undefined

  return (
    <div
      className={`opt-overlay ${flashOn ? 'opt-overlay--flash' : ''}`}
      {...bindPicker()}
      style={{ touchAction: 'none' }}
    >
      <div className="opt-header">
        <span className="opt-emoji">{panel.emoji}</span>
        <span className="opt-title">{panel.title}</span>
      </div>

      <div className="zoom-icon-area zoom-icon-area--big">
        <FlickGuides guides={guides} flickHint={flickHint} />

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

      {/* input は常時マウント（iOS キーボード即起動のため）、表示は class で切替 */}
      <div
        className={`opt-free-row opt-free-row--bottom ${showInput ? '' : 'opt-free-row--hidden'}`}
        onPointerDown={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="opt-free-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          placeholder="自由に入力"
          tabIndex={showInput ? 0 : -1}
        />
        <button className="opt-free-add-btn" onClick={handleAdd} tabIndex={showInput ? 0 : -1}>決定</button>
        <button
          className="opt-free-cancel-btn"
          onClick={() => { setShowInput(false); setDraft('') }}
          aria-label="自由入力をキャンセル"
          tabIndex={showInput ? 0 : -1}
        >×</button>
      </div>

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
  entries,
  onOpenPanel,
  onBack,
}: {
  partKey: PartKey
  opts: typeof PART_OPTIONS_MALE
  entries: Entry[]
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
      {entries.length > 0 && (
        <div className="zoom-entries-list" onPointerDown={e => e.stopPropagation()}>
          {entries.map(e => (
            <div key={e.catKey} className="zoom-entry-item">
              <span className="zoom-entry-cat">{e.catLabel}</span>
              <span className="zoom-entry-val">{e.value}</span>
            </div>
          ))}
        </div>
      )}
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
  preset,
  onChange,
}: {
  info: InfoData
  gender: Gender
  preset: IndustryPreset
  onChange: (next: InfoData) => void
}) {
  const nicknameChips = ['社長', '専務', '先生', '会長', '部長', 'さん'] as const
  const cs = getChipSet(gender, preset)

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

      <ChipGroup label={cs.labels.topics} chips={cs.topics} selected={info.topics}
        onToggle={v => toggle('topics', v)}
        onAddFree={v => onChange({ ...info, topics: [...info.topics, v] })} />

      <ChipGroup label={cs.labels.drinks} chips={cs.drinks} selected={info.drinks}
        onToggle={v => toggle('drinks', v)}
        onAddFree={v => onChange({ ...info, drinks: [...info.drinks, v] })} />

      <ChipGroup label={cs.labels.tobacco} chips={cs.tobacco} selected={info.tobacco}
        onToggle={v => toggle('tobacco', v)}
        onAddFree={() => {}} />

      <ChipGroup label={cs.labels.service} chips={cs.service} selected={info.serviceStyle}
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
  preset,
  onChangeGender,
  onChangePreset,
}: {
  gender: Gender
  preset: IndustryPreset
  onChangeGender: (g: Gender) => void
  onChangePreset: (p: IndustryPreset) => void
}) {
  return (
    <div className="settings-tab">
      <div className="settings-section">
        <div className="settings-section-label">業種プリセット</div>
        <div className="preset-toggle">
          <button
            className={`preset-btn ${preset === 'hospitality' ? 'preset-btn--active' : ''}`}
            onClick={() => onChangePreset('hospitality')}
          >
            <span className="preset-btn-icon">🍷</span>
            <span className="preset-btn-label">接客業</span>
          </button>
          <button
            className={`preset-btn ${preset === 'btob_sales' ? 'preset-btn--active' : ''}`}
            onClick={() => onChangePreset('btob_sales')}
          >
            <span className="preset-btn-icon">💼</span>
            <span className="preset-btn-label">BtoB営業</span>
          </button>
        </div>
        <p className="settings-note">情報タブの選択肢が変わります。<br />入力済みのチップはそのまま保持されます。</p>
      </div>
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

// ======= CustomerSwitcher (bottom sheet) =======

function CustomerSwitcher({
  customers,
  currentId,
  onSelect,
  onNew,
  onClose,
}: {
  customers: Customer[]
  currentId: string
  onSelect: (id: string) => void
  onNew: () => void
  onClose: () => void
}) {
  const sorted = [...customers].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <>
      <div className="switcher-backdrop" onClick={onClose} />
      <div className="switcher-sheet">
        <div className="switcher-handle" />
        <div className="switcher-list">
          {sorted.map(c => {
            const isCurrent = c.id === currentId
            const name = c.info.nickname || 'お客様'
            const gl = c.gender === 'female'
              ? <Venus size={14} strokeWidth={2} />
              : <Mars size={14} strokeWidth={2} />
            return (
              <button
                key={c.id}
                className={`switcher-item ${isCurrent ? 'switcher-item--active' : ''}`}
                onClick={() => { onSelect(c.id); onClose() }}
              >
                <span className="switcher-item-gender">{gl}</span>
                <span className="switcher-item-name">{name}</span>
                {isCurrent && <span className="switcher-item-now">NOW</span>}
                <span className="switcher-item-time">{formatTimeAgo(c.updatedAt)}</span>
              </button>
            )
          })}
        </div>
        <button className="switcher-new-btn" onClick={() => { onNew(); onClose() }}>
          <Plus size={16} strokeWidth={2} />
          新規のお客様を追加
        </button>
      </div>
    </>
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
  const [query, setQuery] = useState('')
  const sorted = [...customers].sort((a, b) => b.updatedAt - a.updatedAt)
  const filtered = query.trim()
    ? sorted.filter(c => c.info.nickname.includes(query.trim()))
    : sorted

  return (
    <div className="customer-list">
      <div className="customer-search-row">
        <input
          className="customer-search-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="名前で絞り込む"
        />
        {query && (
          <button className="customer-search-clear" onClick={() => setQuery('')}>✕</button>
        )}
      </div>
      <button className="customer-new-btn" onClick={onNew}>
        <span><Plus size={18} strokeWidth={2} /> 新規のお客様</span>
      </button>

      {filtered.map((c) => {
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
                {c.visits.length > 0 && ` / ${c.visits.length}回`}
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

      {filtered.length === 0 && (
        <p className="customer-list-empty">
          {query ? `「${query}」は見つかりません` : 'まだお客様がいません'}
        </p>
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
  const [showSwitcher, setShowSwitcher] = useState(false)

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
  const preset  = current?.preset  ?? 'hospitality'
  const visits  = current?.visits  ?? []

  const OPTS = getPartOptions(gender)

  const updateCurrent = useCallback((patch: Partial<Customer>) => {
    setCustomers(prev => prev.map(c =>
      c.id === currentId ? { ...c, ...patch, updatedAt: Date.now() } : c
    ))
  }, [currentId])

  const handleAddVisit = useCallback(() => {
    const v: Visit = { id: crypto.randomUUID(), date: Date.now(), note: '' }
    updateCurrent({ visits: [...(current?.visits ?? []), v] })
    if (navigator.vibrate) navigator.vibrate(20)
  }, [current, updateCurrent])

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
          <button className="header-customer-name header-customer-switch" onClick={() => setShowSwitcher(true)}>
            <span className="header-gender-badge">{genderLabel}</span>
            <span className="header-customer-label">{currentName}</span>
            {visits.length > 0 && (
              <span className="header-visit-badge">{visits.length}回目</span>
            )}
            {customers.length > 1 && <ChevronDown size={14} strokeWidth={2} className="header-switch-chevron" />}
          </button>
        )}
      </div>

      {/* 進捗バー */}
      {mode === 'appearance' && (
        <ProgressBar ratios={ratios} opts={OPTS} />
      )}

      {/* 外観モード */}
      {mode === 'appearance' && (
        <>
          <div className="figure-area" {...bindTop()} style={{ touchAction: 'none' }}>
            {info.nickname && <div className="ov-nickname">{info.nickname}</div>}

            <FlickGuides guides={topGuides} flickHint={flickHint} tapLabel="上半身" tapValues={valuesOf('torso')} />

            {/* 中央フリックガイド */}
            <div className="flick-center-guide">
              <ChevronUp size={18} className="cross-arrow cross-arrow--top" />
              <div className="cross-middle-row">
                <ChevronLeft size={18} className="cross-arrow cross-arrow--side" />
                <div className="cross-center-label">上半身<br /><span className="cross-center-sub">タップ</span></div>
                <ChevronRight size={18} className="cross-arrow cross-arrow--side" />
              </div>
              <ChevronDown size={18} className="cross-arrow cross-arrow--bottom" />
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
          <div className="visit-bar">
            <button className="visit-record-btn" onClick={handleAddVisit}>
              <Plus size={15} strokeWidth={2} />
              {preset === 'btob_sales' ? '商談を記録' : '来店を記録'}
            </button>
            {visits.length > 0 && (
              <span className="visit-bar-count">
                {preset === 'btob_sales' ? `${visits.length}回目の商談` : `来店 ${visits.length}回目`}
                <span className="visit-bar-last"> / 前回: {formatDate(visits[visits.length - 1].date)}</span>
              </span>
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
            preset={preset}
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
            {visits.length > 0 && (
              <div className="visit-history">
                <div className="visit-history-label">
                  {preset === 'btob_sales' ? '商談履歴' : '来店履歴'} — {visits.length}回
                </div>
                {[...visits].reverse().map((v, i) => (
                  <div key={v.id} className="visit-history-item">
                    <span className="visit-history-num">{visits.length - i}回目</span>
                    <span className="visit-history-date">{formatDate(v.date)}</span>
                  </div>
                ))}
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

      {/* 設定 = 業種プリセット + 男女切替 */}
      {mode === 'settings' && (
        <SettingsTab
          gender={gender}
          preset={preset}
          onChangeGender={g => updateCurrent({ gender: g })}
          onChangePreset={p => updateCurrent({ preset: p })}
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
          entries={entries.filter(e => e.partKey === zoomedPart)}
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

      {showSwitcher && (
        <CustomerSwitcher
          customers={customers}
          currentId={currentId}
          onSelect={handleSelectCustomer}
          onNew={handleNewCustomer}
          onClose={() => setShowSwitcher(false)}
        />
      )}
    </div>
  )
}
