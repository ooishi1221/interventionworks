import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'

const CURRENCIES = [
  // gold = ゲームスコア（破壊で増える）
  { id: 'gold', name: 'スコア', icon: '🪙', initial: 0, incPerSec: 0, color: '#ffd700' },
  // shinzui = 神髄石（メンテ回避で増える、ガチャ用）
  { id: 'shinzui', name: '神髄石', icon: '✨', initial: 0, incPerSec: 0, color: '#cc88ff' },
]

const SIDEBAR_LEFT = [
  { label: '限定', sub: '23:47' },
  { label: '祈願', sub: '七連' },
  { label: '福袋', sub: '残3個' },
  { label: 'VIP', sub: 'Lv.3' },
  { label: '成長', sub: '7日目' },
]

const SIDEBAR_RIGHT = [
  { label: 'メール', sub: '12通' },
  { label: 'ギルド', sub: '解散危機' },
  { label: '任務', sub: '3/8' },
  { label: 'チャージ', sub: '6折' },
  { label: 'ショップ', sub: '新着' },
]

const FOOTER_BUTTONS = ['主城', '武将', 'ガチャ', 'バッグ', '設定'] as const
const FOOTER_KEYS = ['castle', 'sword', 'card', 'bag', 'gear'] as const

const OFFERS = [
  { eyebrow: '期間限定 ピックアップ', title: '100 連 無料 ガチャ', cta: 'いますぐ召喚 →', icon: '🎁', accent: '#ff4040' },
  { eyebrow: '初回 6 折 SALE',         title: '神髄パック ¥980',     cta: '購入する →',     icon: '💎', accent: '#ffd700' },
  { eyebrow: 'LR 復刻',                title: 'KAGUYA-X 召喚祭',    cta: '召喚に挑む →',   icon: '🌙', accent: '#9f7aea' },
  { eyebrow: 'VIP3 昇格',              title: 'あと ¥980 で昇格',    cta: 'チャージ →',     icon: '⚡', accent: '#ff8a00' },
  { eyebrow: '天井 200 連',            title: 'あと 47 連で確定',     cta: '続ける →',       icon: '🎯', accent: '#40c0ff' },
  { eyebrow: 'コラボ開催',             title: '秘書・サユリ × 三国', cta: '詳細を見る →',   icon: '🌸', accent: '#ff80ff' },
]

const BANNERS = [
  '🎁 コラボイベント 開催中',
  '⚡ 7 日成長計画 解放',
  '🔥 初回 6 折 SALE 終了間近',
  '💎 累計課金 SSR 確定',
  '✨ 新規アバター追加',
  '🎉 VIP 昇格チャンス',
]

const PROMOS = [
  { icon: '🎁', label: '報酬受取', sub: '13/30', accent: '#ff8040' },
  { icon: '👥', label: '招待', sub: '残り 7 日', accent: '#40a0ff' },
  { icon: '🌱', label: '成長計画', sub: 'Day 7', accent: '#40ff80' },
  { icon: '⚔️', label: 'ギルド戦', sub: '参加可能', accent: '#ff4080' },
  { icon: '🏆', label: '週間ランキング', sub: '47 位', accent: '#ffd700' },
]

const FLASH_CHARS = [
  { name: 'KAGUYA-X', rarity: 'LR' },
  { name: '羅刹姫・葵', rarity: 'SSR' },
  { name: 'MIKO-α', rarity: 'SSR+' },
  { name: 'MOTI', rarity: 'LR' },
  { name: '秘書・サユリ', rarity: 'SR' },
  { name: '餅田・たま', rarity: 'SR' },
  { name: 'EBINA', rarity: 'SR' },
]

const TOAST_MESSAGES = [
  '*Tanaka* さんがあなたに ❤️ を送りました',
  '*Yuji* さんが 6 ヶ月ぶりにログインしました',
  'お詫び石 3,000 個進呈いたしました',
  '【LR 確定】KAGUYA-X が降臨しました！',
  '您の英雄が訓練中です',
  'VIP3 へのアップグレードであと ¥980',
  '羅刹姫・葵 のピックアップ確率 9% 上昇中',
  'ギルド「新緑の同盟」から加入勧誘',
  '初日配布キャラ 餅田・たま 未受取',
  '秘書・サユリ コラボガチャ開催中',
  '【凸完了】KAGUYA-X が覚醒しました',
  '【限界突破】羅刹姫・葵 が +5 になりました',
  '今日の天恵：神髄 200 個獲得',
  '【週間ランキング】47 位 → 31 位 上昇！',
  '【お知らせ】メンテのお詫び 詫び石 5,000',
  '7 日連続ログインまであと 1 日',
  '【凸完了】MIKO-α 解放',
  '神器石 100 個 進呈',
  '主公の英雄団が強くなりました',
  '深夜限定オファー 23:00 開始',
]

type Rarity = 'LR' | 'SSR+' | 'SSR' | 'SR' | 'R'

const PICKUP_CHARS = [
  { name: '羅刹姫・葵', rarity: 'SSR' as Rarity, up: true, color: '#ffd700' },
  { name: 'MIKO-α', rarity: 'SSR+' as Rarity, up: false, color: '#ff80ff' },
  { name: 'KAGUYA-X', rarity: 'LR' as Rarity, up: true, color: '#fff8e0' },
]

const GACHA_POOL: { name: string; rarity: Rarity }[] = [
  { name: 'KAGUYA-X', rarity: 'LR' },
  { name: 'MOTI', rarity: 'LR' },
  { name: 'MIKO-α', rarity: 'SSR+' },
  { name: '羅刹姫・葵', rarity: 'SSR' },
  { name: 'SAKURA-87', rarity: 'SSR' },
  { name: 'EBINA', rarity: 'SR' },
  { name: '餅田・たま', rarity: 'SR' },
  { name: '秘書・サユリ', rarity: 'SR' },
  { name: '張遼', rarity: 'R' },
  { name: '夏侯惇', rarity: 'R' },
  { name: '関平', rarity: 'R' },
  { name: '甘寧', rarity: 'R' },
  { name: '貂蝉-α', rarity: 'R' },
  { name: '小喬', rarity: 'R' },
]

const RARITY_COLORS: Record<Rarity, string> = {
  LR: '#fff8e0',
  'SSR+': '#ff80ff',
  SSR: '#ffd700',
  SR: '#c060ff',
  R: '#80c0ff',
}

const RARITY_BG: Record<Rarity, string> = {
  LR: 'linear-gradient(135deg, #fff8c0, #ff8000)',
  'SSR+': 'linear-gradient(135deg, #ff80ff, #800080)',
  SSR: 'linear-gradient(135deg, #ffd700, #aa6000)',
  SR: 'linear-gradient(135deg, #c060ff, #500080)',
  R: 'linear-gradient(135deg, #80c0ff, #003080)',
}

function rollOne(): { name: string; rarity: Rarity } {
  const r = Math.random()
  let cum = 0
  const probs: [Rarity, number][] = [
    ['LR', 0.005],
    ['SSR+', 0.025],
    ['SSR', 0.07],
    ['SR', 0.25],
    ['R', 1.0],
  ]
  for (const [rarity, p] of probs) {
    cum = p
    if (r <= cum) {
      const candidates = GACHA_POOL.filter((c) => c.rarity === rarity)
      return candidates[Math.floor(Math.random() * candidates.length)] ?? GACHA_POOL[GACHA_POOL.length - 1]
    }
  }
  return GACHA_POOL[GACHA_POOL.length - 1]
}

function rollTen(): { name: string; rarity: Rarity }[] {
  const arr = Array.from({ length: 10 }, () => rollOne())
  if (!arr.some((c) => c.rarity !== 'R')) {
    arr[arr.length - 1] = GACHA_POOL.find((c) => c.rarity === 'SR') ?? arr[arr.length - 1]
  }
  return arr
}

function formatNumber(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}億`
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return Math.floor(n).toLocaleString()
}

function useTickingNumber(initial: number, incPerSec: number) {
  const [value, setValue] = useState(initial)
  const valueRef = useRef(initial)

  useEffect(() => {
    let last = performance.now()
    const interval = setInterval(() => {
      const now = performance.now()
      const dt = (now - last) / 1000
      last = now
      const wobble = 1 + Math.sin((now / 1000) * 0.5 * Math.PI * 2) * 0.3
      valueRef.current += incPerSec * dt * Math.max(0, wobble)
      setValue(valueRef.current)
    }, 1000) // 1 秒に 1 回更新（震え防止）
    return () => clearInterval(interval)
  }, [incPerSec])

  return value
}

function Badge({ whackable, hidden }: { whackable?: boolean; hidden?: boolean } = {}) {
  const [count, setCount] = useState(() => 1 + Math.floor(Math.random() * 25))

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const tick = () => {
      setCount((c) => Math.max(1, c + Math.floor(Math.random() * 7) - 2))
      timeout = setTimeout(tick, 1500 + Math.random() * 3500)
    }
    tick()
    return () => clearTimeout(timeout)
  }, [])

  if (hidden) return null

  return (
    <div className={`badge ${whackable ? 'badge-whackable' : ''}`}>
      {count > 99 ? '99+' : count}
    </div>
  )
}

function CurrencyItem({
  currency,
  state,
  value,
}: {
  currency: (typeof CURRENCIES)[number]
  state?: IconAnimState
  value?: number
}) {
  const ticking = useTickingNumber(currency.initial, currency.incPerSec)
  const displayValue = value !== undefined ? value : ticking
  return (
    <div
      className={`currency-item ${animClassFor(state)}`}
      data-icon-key={`curr-${currency.id}`}
    >
      <div className="currency-icon-wrap">
        <span className="currency-icon">{currency.icon}</span>
      </div>
      <span className="currency-value" style={{ color: currency.color }}>
        {formatNumber(displayValue)}
      </span>
      <span className="currency-plus">＋</span>
    </div>
  )
}

type Enemy = { id: number; x: number; y: number; spawnAt: number; killAt?: number }

function BattleBackground() {
  const [enemies, setEnemies] = useState<Enemy[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    const spawnTimer = setInterval(() => {
      setEnemies((prev) => {
        if (prev.length >= 24) return prev
        return [
          ...prev,
          { id: idRef.current++, x: 8 + Math.random() * 84, y: 12 + Math.random() * 50, spawnAt: Date.now() },
        ]
      })
    }, 150 + Math.random() * 250)

    const tickTimer = setInterval(() => {
      const now = Date.now()
      setEnemies((prev) =>
        prev
          .map((e) => {
            if (e.killAt) return e
            if (now - e.spawnAt > 3000 || Math.random() < 0.04) {
              return { ...e, killAt: now }
            }
            return e
          })
          .filter((e) => !e.killAt || now - e.killAt < 700)
      )
    }, 80)

    return () => {
      clearInterval(spawnTimer)
      clearInterval(tickTimer)
    }
  }, [])

  return (
    <div className="battle-bg">
      {enemies.map((e) => (
        <div key={e.id} className={e.killAt ? 'enemy enemy-dying' : 'enemy'} style={{ left: `${e.x}%`, top: `${e.y}%` }}>
          {e.killAt && <div className="hit-effect" />}
        </div>
      ))}
    </div>
  )
}

function FloatingOffer({ iconState = {} }: { iconState?: Record<string, IconAnimState> }) {
  const [seconds, setSeconds] = useState(23 * 3600 + 47 * 60 + 18)

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)

  return (
    <div className="floating-offer-stack">
      {OFFERS.map((o, i) => {
        const key = `fo-${i}`
        return (
          <button
            key={i}
            className={`fo-item ${animClassFor(iconState[key])}`}
            type="button"
            data-icon-key={key}
            style={{ borderColor: o.accent, animationDelay: `${i * 0.06}s` }}
          >
            <div
              className="fo-icon"
              style={{ background: `radial-gradient(circle, ${o.accent}, #200)` }}
            >
              <span>{o.icon}</span>
            </div>
            <div className="fo-text">
              <div className="fo-title">{o.title}</div>
              <div className="fo-sub">
                {o.eyebrow} · 残り {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
              </div>
            </div>
            <div className="fo-cta">→</div>
          </button>
        )
      })}
    </div>
  )
}

function EventBanner() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % BANNERS.length), 2000)
    return () => clearInterval(t)
  }, [])
  return <div className="event-banner">{BANNERS[idx]}</div>
}

function ToastFeed() {
  const [active, setActive] = useState<{ id: number; text: string }[]>([])
  const idRef = useRef(0)

  useEffect(() => {
    const t = setInterval(() => {
      const text = TOAST_MESSAGES[Math.floor(Math.random() * TOAST_MESSAGES.length)]
      const id = idRef.current++
      setActive((prev) => [...prev, { id, text }])
      setTimeout(() => setActive((prev) => prev.filter((m) => m.id !== id)), 3500)
    }, 1100)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="toast-feed">
      {active.map((m) => (
        <div key={m.id} className="toast">{m.text}</div>
      ))}
    </div>
  )
}

function SSRFlash() {
  const [shown, setShown] = useState<{ id: number; name: string; rarity: string } | null>(null)
  const idRef = useRef(0)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const trigger = () => {
      const c = FLASH_CHARS[Math.floor(Math.random() * FLASH_CHARS.length)]
      setShown({ id: idRef.current++, name: c.name, rarity: c.rarity })
      setTimeout(() => setShown(null), 2500)
      timeout = setTimeout(trigger, 9000 + Math.random() * 6000)
    }
    timeout = setTimeout(trigger, 5000)
    return () => clearTimeout(timeout)
  }, [])

  if (!shown) return null
  return (
    <div className="ssr-flash" key={shown.id}>
      <div className="ssr-rays" />
      <div className="ssr-confetti" />
      <div className="ssr-text">
        <div className="ssr-rarity">{shown.rarity} 確定</div>
        <div className="ssr-char">{shown.name}</div>
        <div className="ssr-msg">降臨！</div>
      </div>
    </div>
  )
}

function BattlePower() {
  const power = useTickingNumber(8492371, 250)
  return (
    <div className="battle-power">
      <div className="bp-frame">
        <span className="bp-icon">⚔️</span>
        <div className="bp-stack">
          <div className="bp-label">戦闘力</div>
          <div className="bp-value">{Math.floor(power).toLocaleString()}</div>
        </div>
      </div>
      <div className="bp-stage">第 47 章 - 12 / 30</div>
    </div>
  )
}

const KAGUYA_NORMAL_LINES = [
  '主公、おかえりなさい',
  '会いたかった…',
  'もう、行ってしまうの？',
  'いま閉じても、詫び石が届きます',
  'あなたの 847 日、覚えていますよ',
  '次の召喚で、私がいるかもしれません',
  '7 日連続まで、あと 1 日です',
  'あなたが居ないと、私…',
]

const KAGUYA_EMERGENCY_LINES = [
  '主公！ 赤バッジを タップして倒して！',
  'スワイプで 連続で斬れる！',
  '指で斬って！ 早く！',
  'メンテが始まる前に！',
  '全部 処理して！主公！',
  'あと少し… 信じてる',
]

const TRASH_ITEMS = [
  '🌿 木の枝 ×5',
  '🪨 石ころ ×10',
  '🟫 土塊 ×3',
  '🌾 枯れ草 ×5',
  '🍂 落ち葉 ×8',
  '📕 朽ちた書物 ×1',
  '🦴 動物の骨 ×1',
  '🪶 鳥の羽 ×2',
]

// ===== 緊急メンテナンス・カウントダウン（モグラ叩きゲームの開始装置） =====
const MAINTENANCE_TOTAL_SEC = 15
const COUNTDOWN_START_DELAY_MIN_MS = 12000
const COUNTDOWN_START_DELAY_MAX_MS = 18000
const SAFE_DURATION_MIN_MS = 15000
const SAFE_DURATION_MAX_MS = 20000
const TARGET_HITS_PER_ROUND = 10

// 毎ラウンド固定 10 個（永久に続く覚醒の輪廻 — 同じ条件で永久ループ）
const targetHitsForRound = (_round: number) => TARGET_HITS_PER_ROUND

// ===== ステージ設計（ラウンド進行で段階的に解放） =====
type DestroyablePrefix = 'sl' | 'sr' | 'fb' | 'b' | 'player' | 'curr' | 'gb' | 'fo'

type StageConfig = {
  label: string
  swipeEnabled: boolean
  destroyable: ReadonlyArray<DestroyablePrefix>
  scorePerHit: number
  hardPhaseFromSec: number   // 残り何秒からランダム badge スポーン (-1 で発動なし)
  maintenanceSec: number     // メンテ時間（秒）
  targetHits: number         // 必要タップ数
  activeBadgeMax: number     // 同時に光る Badge 上限（0 で全部）
  obstacles: boolean         // お邪魔発動するか
  stoneReward: number        // メンテ回避時に獲得する神髄石
}

const STAGES: StageConfig[] = [
  // S1: チュートリアル
  { label: 'STAGE 1',  swipeEnabled: false, destroyable: ['sl', 'sr', 'fb'], scorePerHit: 10, hardPhaseFromSec: -1, maintenanceSec: 15, targetHits: 6,  activeBadgeMax: 3, obstacles: false, stoneReward: 50 },
  // S2: 目標数微増
  { label: 'STAGE 2',  swipeEnabled: false, destroyable: ['sl', 'sr', 'fb'], scorePerHit: 10, hardPhaseFromSec: -1, maintenanceSec: 15, targetHits: 8,  activeBadgeMax: 3, obstacles: false, stoneReward: 70 },
  // S3: active 5 個に
  { label: 'STAGE 3',  swipeEnabled: false, destroyable: ['sl', 'sr', 'fb'], scorePerHit: 12, hardPhaseFromSec: -1, maintenanceSec: 14, targetHits: 10, activeBadgeMax: 5, obstacles: false, stoneReward: 90 },
  // S4: ハードフェーズ + ランダム badge 解放
  { label: 'STAGE 4',  swipeEnabled: false, destroyable: ['sl', 'sr', 'fb', 'b'], scorePerHit: 15, hardPhaseFromSec: 6, maintenanceSec: 14, targetHits: 12, activeBadgeMax: 5, obstacles: false, stoneReward: 110 },
  // S5: お邪魔発動 + 全 active
  { label: 'STAGE 5',  swipeEnabled: false, destroyable: ['sl', 'sr', 'fb', 'b'], scorePerHit: 18, hardPhaseFromSec: 7, maintenanceSec: 13, targetHits: 14, activeBadgeMax: 0, obstacles: true,  stoneReward: 140 },
  // S6: スワイプ解放
  { label: 'STAGE 6',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b'], scorePerHit: 25, hardPhaseFromSec: 8, maintenanceSec: 13, targetHits: 16, activeBadgeMax: 0, obstacles: true,  stoneReward: 180 },
  // S7: 目標増、メンテ短縮
  { label: 'STAGE 7',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b'], scorePerHit: 30, hardPhaseFromSec: 9, maintenanceSec: 12, targetHits: 18, activeBadgeMax: 0, obstacles: true,  stoneReward: 220 },
  // S8: 全 UI 破壊解放
  { label: 'STAGE 8',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'player', 'curr', 'gb', 'fo'], scorePerHit: 35, hardPhaseFromSec: 9, maintenanceSec: 11, targetHits: 20, activeBadgeMax: 0, obstacles: true, stoneReward: 280 },
  // S9: ハード長め、メンテ短縮
  { label: 'STAGE 9',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'player', 'curr', 'gb', 'fo'], scorePerHit: 45, hardPhaseFromSec: 11, maintenanceSec: 10, targetHits: 22, activeBadgeMax: 0, obstacles: true, stoneReward: 350 },
  // S10: 過酷モード（最高難度、これ以降同じ条件で永久輪廻）
  { label: 'STAGE 10', swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'player', 'curr', 'gb', 'fo'], scorePerHit: 60, hardPhaseFromSec: 12, maintenanceSec: 9,  targetHits: 25, activeBadgeMax: 0, obstacles: true, stoneReward: 500 },
]

const stageFor = (round: number): StageConfig =>
  STAGES[Math.min(round - 1, STAGES.length - 1)]

const prefixOf = (key: string): DestroyablePrefix | null => {
  if (key === 'player') return 'player'
  if (key.startsWith('curr-')) return 'curr'
  if (key.startsWith('gb-')) return 'gb'
  if (key.startsWith('fo-')) return 'fo'
  if (key.startsWith('sl-')) return 'sl'
  if (key.startsWith('sr-')) return 'sr'
  if (key.startsWith('fb-')) return 'fb'
  return null
}

const isDestroyable = (key: string, stage: StageConfig): boolean => {
  const p = prefixOf(key)
  return p !== null && stage.destroyable.includes(p)
}

type GameMode = 'idle' | 'countdown' | 'safe' | 'maintenance'

// アイコンの 4 段階アニメ: undefined（通常）→ exploding → gone → respawning → undefined
type IconAnimState = 'exploding' | 'gone' | 'respawning'

const animClassFor = (state: IconAnimState | undefined) =>
  state ? `icon-${state}` : ''

// ===== お邪魔 1: NOW LOADING（全画面、タップ不能） =====
function NowLoadingOverlay() {
  return (
    <div className="now-loading-overlay" aria-hidden="true">
      <div className="nl-spinner">⟳</div>
      <div className="nl-text">NOW LOADING...</div>
      <div className="nl-sub">サーバーと通信しています</div>
    </div>
  )
}

// ===== お邪魔 2: 機能解放チュートリアル（KAGUYA 大セリフ枠、スキップ不可） =====
function TutorialOverlay() {
  return (
    <div className="tutorial-overlay" aria-hidden="true">
      <div className="tu-content">
        <div className="tu-name">⚠ KAGUYA-X</div>
        <div className="tu-text">
          主公！ ここは<strong>戦闘画面</strong>です！
          <br />
          赤いバッジを<strong>タップ</strong>すると未読が消えます。
          <br />
          スワイプで<strong>連続斬り</strong>もできます！
        </div>
        <button type="button" className="tu-skip" disabled>
          スキップ（タップ無効）
        </button>
      </div>
    </div>
  )
}

// ===== お邪魔 3: 一括 DL ポップアップ（業界アプリ風 OS モーダル） =====
function DownloadOverlay() {
  return (
    <div className="download-modal" aria-hidden="true">
      <div className="dm-content">
        <div className="dm-icon">📦</div>
        <div className="dm-title">追加データのダウンロード</div>
        <div className="dm-sub">
          快適なプレイのために
          <br />
          <strong>2.0 GB</strong> のデータが必要です
        </div>
        <div className="dm-progress">
          <div className="dm-progress-fill" />
        </div>
        <div className="dm-progress-text">12% (240 MB / 2.0 GB)</div>
        <div className="dm-buttons">
          <button type="button" className="dm-btn dm-btn-confirm">
            ダウンロード
          </button>
          <button type="button" className="dm-btn dm-btn-cancel">
            後で
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== スワイプ軌跡（Fruit Ninja 風刀筋） =====
function SwipeTrail() {
  const [points, setPoints] = useState<Array<{ x: number; y: number; t: number }>>([])

  useEffect(() => {
    let dragging = false

    const onDown = (e: PointerEvent) => {
      dragging = true
      setPoints([{ x: e.clientX, y: e.clientY, t: Date.now() }])
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      setPoints((prev) => [...prev, { x: e.clientX, y: e.clientY, t: Date.now() }])
    }
    const onUp = () => {
      dragging = false
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // 古い点を消す（フェードアウト）
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setPoints((prev) => prev.filter((p) => now - p.t < 240))
    }, 30)
    return () => clearInterval(interval)
  }, [])

  if (points.length < 2) return null

  const pointsStr = points.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <svg
      className="swipe-trail"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <defs>
        <linearGradient id="trail-grad" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(255, 215, 0, 0)" />
          <stop offset="80%" stopColor="rgba(255, 240, 180, 0.85)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 1)" />
        </linearGradient>
      </defs>
      {/* outer glow */}
      <polyline
        points={pointsStr}
        stroke="rgba(255, 200, 50, 0.45)"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="blur(2px)"
      />
      {/* main trail */}
      <polyline
        points={pointsStr}
        stroke="url(#trail-grad)"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ===== モグラ叩きバッジ =====
type BadgeType = 'normal' | 'critical' | 'apology'
type WhackBadge = {
  id: number
  x: number // 0-100 (%)
  y: number // 0-100 (%)
  hp: number // 残りタップ回数
  type: BadgeType
  spawnedAt: number
}

const BADGE_LABELS: Record<BadgeType, string[]> = {
  normal:   ['!', '!', 'NEW', '受取', '!', '!'],
  critical: ['25', '47', '99', '12', '7'],
  apology:  ['💎'],
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function MaintenanceCountdown({ seconds }: { seconds: number }) {
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  const isCritical = seconds <= 10
  return (
    <div className={`maintenance-countdown ${isCritical ? 'mc-critical' : ''}`}>
      <span className="mc-icon">⚠</span>
      <span className="mc-text">緊急メンテナンス開始まで </span>
      <span className="mc-timer">
        {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
      </span>
    </div>
  )
}

// 効果音 (SE) hook: 何度でも先頭から再生
function useSE(src: string, muted: boolean, volume = 0.6) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const a = new Audio(src)
    a.volume = volume
    audioRef.current = a
  }, [src, volume])

  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = muted
  }, [muted])

  return useCallback(() => {
    if (muted) return
    const a = audioRef.current
    if (!a) return
    a.currentTime = 0
    a.play().catch(() => {})
  }, [muted])
}

function BGMPlayer({
  gameMode,
  muted,
  unlocked,
}: {
  gameMode: GameMode
  muted: boolean
  unlocked: boolean
}) {
  const homeBgmRef = useRef<HTMLAudioElement | null>(null)
  const alertBgmRef = useRef<HTMLAudioElement | null>(null)

  // ミュート反映
  useEffect(() => {
    const home = homeBgmRef.current
    const alert = alertBgmRef.current
    if (home) home.muted = muted
    if (alert) alert.muted = muted
  }, [muted])

  useEffect(() => {
    if (!unlocked) return
    const home = homeBgmRef.current
    const alert = alertBgmRef.current
    if (!home || !alert) return

    if (gameMode === 'idle' || gameMode === 'safe') {
      // 通常時 / 回避後の安息: home BGM を最初から
      alert.pause()
      home.currentTime = 0
      home.volume = 0.45
      home.play().catch(() => {})
    } else if (gameMode === 'countdown') {
      // 緊急メンテ: maintenance BGM を最初から
      home.pause()
      alert.currentTime = 0
      alert.volume = 0.55
      alert.play().catch(() => {})
    } else {
      // maintenance（失敗）: 全停止
      home.pause()
      alert.pause()
    }
  }, [gameMode, unlocked])

  return (
    <>
      <audio ref={homeBgmRef} src="/audio/home-bgm.mp3" loop preload="auto" />
      <audio ref={alertBgmRef} src="/audio/maintenance-bgm.mp3" loop preload="auto" />
    </>
  )
}

function MaintenanceScreen({
  muted,
  onBackToTitle,
}: {
  muted: boolean
  onBackToTitle: () => void
}) {
  useEffect(() => {
    if (muted) return
    const chime = new Audio('/audio/se-chime.mp3')
    chime.volume = 0.65
    chime.play().catch(() => {})
    return () => {
      chime.pause()
    }
  }, [muted])

  // 6 秒後に自動でタイトルに戻る
  useEffect(() => {
    const t = setTimeout(onBackToTitle, 6000)
    return () => clearTimeout(t)
  }, [onBackToTitle])

  return (
    <div className="maintenance-screen" onClick={onBackToTitle}>
      <div className="ms-icon">🔧</div>
      <div className="ms-title">メンテナンス中</div>
      <div className="ms-sub">
        サービス停止中です。
        <br />
        復旧時刻は未定です。
      </div>
      <div className="ms-spinner">⟳</div>
    </div>
  )
}

function LoginBonusModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [showStamp, setShowStamp] = useState(false)
  const [received, setReceived] = useState(false)

  useEffect(() => {
    if (!open) {
      setShowStamp(false)
      setReceived(false)
      return
    }
    // モーダル着地 → 0.9 秒後に「済」スタンプがドーン
    const stampTimer = setTimeout(() => setShowStamp(true), 900)
    return () => clearTimeout(stampTimer)
  }, [open])

  if (!open) return null

  const closeAll = () => {
    setReceived(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-flash" aria-hidden="true" />
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="閉じる"
        >✕</button>
        <div className="modal-image-wrapper">
          <img
            src="/popups/login-bonus.png"
            alt="初心者ログインボーナス"
            className="modal-image"
          />
          {showStamp && <div className="modal-stamp" aria-hidden="true">済</div>}
          {/* 「受取」ボタンの click area（画像の下部金ボタン位置に透明オーバーレイ） */}
          <button
            type="button"
            className="modal-receive-btn"
            onClick={() => setReceived(true)}
            aria-label="受取"
          />
        </div>
      </div>

      {received && (
        <div
          className="received-modal"
          onClick={closeAll}
        >
          <div
            className="received-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="received-title">📦 受領完了</div>
            <div className="received-sub">主公、本日のログイン報酬を受け取りました</div>
            <ul className="received-list">
              {TRASH_ITEMS.map((item, i) => (
                <li key={i} style={{ animationDelay: `${i * 60}ms` }}>{item}</li>
              ))}
            </ul>
            <div className="received-thanks">ご来訪、誠にありがとうございました。</div>
            <button
              type="button"
              className="received-ok"
              onClick={closeAll}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function KaguyaDialog({ gameMode }: { gameMode: GameMode }) {
  const lines =
    gameMode === 'countdown' ? KAGUYA_EMERGENCY_LINES : KAGUYA_NORMAL_LINES
  const [idx, setIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  // gameMode 変わったら index リセット
  useEffect(() => {
    setIdx(0)
    setVisible(true)
  }, [gameMode])

  useEffect(() => {
    // 緊急時はセリフローテも速い
    const interval = gameMode === 'countdown' ? 3500 : 5500
    const cycle = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx((i) => (i + 1) % lines.length)
        setVisible(true)
      }, 400)
    }, interval)
    return () => clearInterval(cycle)
  }, [gameMode, lines.length])

  return (
    <div
      className={`kaguya-dialog ${visible ? '' : 'kd-hidden'} ${gameMode === 'countdown' ? 'kd-emergency' : ''}`}
      aria-hidden="true"
    >
      <div className="kd-bubble">
        {lines[idx]}
        <div className="kd-tail" />
      </div>
    </div>
  )
}

function PlayerInfo({ state }: { state?: IconAnimState } = {}) {
  const power = useTickingNumber(8492371, 250)
  return (
    <div className={`player-info ${animClassFor(state)}`} data-icon-key="player">
      <div className="player-avatar">
        <span className="player-avatar-icon">👤</span>
        <div className="player-vip">VIP3</div>
      </div>
      <div className="player-meta">
        <div className="player-name">主公・Yuji</div>
        <div className="player-stats">
          <span className="player-level">Lv.127</span>
          <span className="player-power">⚔️{formatNumber(power)}</span>
        </div>
      </div>
    </div>
  )
}

function PromoStrip() {
  return (
    <div className="promo-strip">
      {PROMOS.map((p, i) => (
        <button key={i} className="promo-item" type="button" style={{ borderColor: p.accent }}>
          <span className="promo-icon" style={{ background: `radial-gradient(circle, ${p.accent}, #000)` }}>{p.icon}</span>
          <div className="promo-text">
            <div className="promo-label">{p.label}</div>
            <div className="promo-sub">{p.sub}</div>
          </div>
          <Badge />
        </button>
      ))}
    </div>
  )
}

function HeroCharacter() {
  return (
    <div className="hero-character">
      <div className="hero-frame">
        <div className="hero-rarity">LR</div>
        <div className="hero-name">KAGUYA-X</div>
        <div className="hero-tagline">月へ、帰る前に</div>
      </div>
    </div>
  )
}

function GachaBanners({
  onNavigate,
  pickupState,
  shinzuiState,
  countdownActive,
}: {
  onNavigate: (s: Screen) => void
  pickupState?: IconAnimState
  shinzuiState?: IconAnimState
  countdownActive?: boolean
}) {
  return (
    <div className="gacha-banners">
      <button
        type="button"
        className={`gacha-banner gb-pickup ${animClassFor(pickupState)}`}
        data-icon-key="gb-pickup"
        onClick={() => !countdownActive && onNavigate('gacha')}
      >
        <img src="/banners/pickup.png" alt="ピックアップ召喚" className="gb-image" />
        <div className="gb-ribbon">ピックアップ</div>
        <div className="gb-plate">100連 確率UP</div>
      </button>
      <button
        type="button"
        className={`gacha-banner gb-shinzui ${animClassFor(shinzuiState)}`}
        data-icon-key="gb-shinzui"
        onClick={() => !countdownActive && onNavigate('gacha')}
      >
        <img src="/banners/shinzui.png" alt="神髄召喚" className="gb-image" />
        <div className="gb-ribbon">神髄召喚</div>
        <div className="gb-plate">残り 23:47</div>
      </button>
    </div>
  )
}

// ===== Screen 型 =====
type Screen =
  | 'title'
  | 'home'
  | 'gacha'
  | 'layer1'
  | 'layer2'
  | 'layer3'
  | 'layer4'
  | 'layer5'
  | 'free'

// ===== TitleScreen =====
function TitleScreen({ onStart }: { onStart: () => void }) {
  const bgmRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const muted = localStorage.getItem('let-me-out-muted') === '1'
    const a = new Audio('/audio/title-bgm.mp3')
    a.loop = true
    a.volume = 0.45
    a.muted = muted
    bgmRef.current = a
    // 即時試行（iOS は最初のタップで unlock 必要）
    a.play().catch(() => {})

    const onFirstTap = () => {
      a.play().catch(() => {})
    }
    window.addEventListener('pointerdown', onFirstTap, { once: true })

    return () => {
      a.pause()
      a.src = ''
      window.removeEventListener('pointerdown', onFirstTap)
    }
  }, [])

  return (
    <div className="title-screen-bg">
      <img
        src="/title-screen.png"
        alt="放置恋姫 〜永久に続く覚醒の輪廻〜"
        className="title-image"
      />
      {/* 舞う桜花弁 + 光粒 */}
      <div className="ts-particles" aria-hidden="true">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className={`ts-petal ts-petal-${i}`}>
            {i % 3 === 0 ? '✨' : '🌸'}
          </div>
        ))}
      </div>
      {/* スタートボタン位置の光輪（クリック透過） */}
      <div className="title-start-glow" aria-hidden="true" />
      <button
        type="button"
        className="title-start-btn"
        onClick={onStart}
        aria-label="ゲーム開始"
      />
    </div>
  )
}

// ===== ゲームスコア =====
type GameStats = {
  startedAt: number
  blocksHit: number // 引き止め食らった回数
  apologyStones: number // 詫び石残高（敗北スコア）
}

// ===== HomeScreen =====
function HomeScreen({
  onNavigate,
  onExit,
  audioUnlocked = false,
  kaguyaBombs = 0,
  consumeKaguyaBomb,
  visible = true,
}: {
  onNavigate: (s: Screen) => void
  onExit: () => void
  audioUnlocked?: boolean
  kaguyaBombs?: number
  consumeKaguyaBomb?: () => void
  visible?: boolean
}) {
  const [gameMode, setGameMode] = useState<GameMode>('idle')
  const [maintenanceSeconds, setMaintenanceSeconds] = useState(MAINTENANCE_TOTAL_SEC)
  const [badges, setBadges] = useState<WhackBadge[]>([])
  const [score, setScore] = useState(0)
  const [hits, setHits] = useState(0)
  const [round, setRound] = useState(1)
  const [hitsThisRound, setHitsThisRound] = useState(0)
  const [showAvoided, setShowAvoided] = useState(false)
  const [muted, setMuted] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('let-me-out-muted') === '1'
  })
  const badgeIdRef = useRef(0)

  const currentStage = stageFor(round)
  const targetHits = currentStage.targetHits

  // SE
  const playSwordSE = useSE('/audio/se-whack.mp3', muted, 0.55) // スワイプ斬撃
  const playPunchSE = useSE('/audio/se-tap-light.mp3', muted, 0.6) // タップ
  const playAlarmSE = useSE('/audio/se-alarm.mp3', muted, 0.7)
  const playClearSE = useSE('/audio/se-clear.mp3', muted, 0.7)
  const playExplodeA = useSE('/audio/se-explode-3.mp3', muted, 0.45) // 爆発 A
  const playExplodeB = useSE('/audio/se-explode-4.mp3', muted, 0.45) // 爆発 B
  const playExplode = useCallback(() => {
    if (Math.random() < 0.5) playExplodeA()
    else playExplodeB()
  }, [playExplodeA, playExplodeB])
  // sweep 中フラグ（ref）
  const swipeActiveRef = useRef(false)

  // gameMode 切替時の SE 発火 + 暗転トランジション
  const prevGameModeRef = useRef(gameMode)
  const [battleTransition, setBattleTransition] = useState(false)
  useEffect(() => {
    const prev = prevGameModeRef.current
    if (prev !== gameMode) {
      if (gameMode === 'countdown') {
        playAlarmSE()
        setBattleTransition(true)
        setTimeout(() => setBattleTransition(false), 700)
      }
      if (gameMode === 'safe') playClearSE()
    }
    prevGameModeRef.current = gameMode
  }, [gameMode, playAlarmSE, playClearSE])

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m
      localStorage.setItem('let-me-out-muted', next ? '1' : '0')
      return next
    })
  }

  // 初回 idle / safe からランダム遅延で countdown 開始
  useEffect(() => {
    if (gameMode === 'idle') {
      const delay =
        COUNTDOWN_START_DELAY_MIN_MS +
        Math.random() * (COUNTDOWN_START_DELAY_MAX_MS - COUNTDOWN_START_DELAY_MIN_MS)
      const timer = setTimeout(() => {
        setMaintenanceSeconds(currentStage.maintenanceSec)
        setHitsThisRound(0)
        setGameMode('countdown')
      }, delay)
      return () => clearTimeout(timer)
    }
    if (gameMode === 'safe') {
      const delay =
        SAFE_DURATION_MIN_MS +
        Math.random() * (SAFE_DURATION_MAX_MS - SAFE_DURATION_MIN_MS)
      const timer = setTimeout(() => {
        setMaintenanceSeconds(currentStage.maintenanceSec)
        setHitsThisRound(0)
        setGameMode('countdown')
      }, delay)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, currentStage.maintenanceSec])

  // カウントダウン進行（リザルト表示中は停止）
  useEffect(() => {
    if (gameMode !== 'countdown') return
    if (showAvoided) return // リザルト表示中はメンテ進行を止める
    if (maintenanceSeconds <= 0) {
      setGameMode('maintenance')
      return
    }
    const timer = setTimeout(
      () => setMaintenanceSeconds((s) => s - 1),
      1000
    )
    return () => clearTimeout(timer)
  }, [gameMode, maintenanceSeconds, showAvoided])

  // ===== お邪魔要素（NOW LOADING / チュートリアル / 一括 DL / ログインボーナス） =====
  type Obstacle = 'loading' | 'tutorial' | 'download' | 'login-bonus'
  const [obstacle, setObstacle] = useState<Obstacle | null>(null)

  useEffect(() => {
    if (gameMode !== 'countdown') {
      setObstacle(null)
      return
    }
    // ステージで obstacles=false ならお邪魔発動なし
    if (!currentStage.obstacles) {
      setObstacle(null)
      return
    }
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      // 7-13 秒に 1 回発動
      timer = setTimeout(() => {
        const r = Math.random()
        // 確率分布: loading 35% / tutorial 25% / download 20% / login-bonus 20%
        const next: Obstacle =
          r < 0.35 ? 'loading'
          : r < 0.6 ? 'tutorial'
          : r < 0.8 ? 'download'
          : 'login-bonus'
        setObstacle(next)
        // ログボはタップで閉じる前提なので、自動消滅は遅め
        const duration =
          next === 'loading' ? 1800
          : next === 'tutorial' ? 2800
          : next === 'download' ? 3500
          : 6000 // login-bonus
        setTimeout(() => {
          setObstacle(null)
          schedule()
        }, duration)
      }, 7000 + Math.random() * 6000)
    }
    schedule()
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, currentStage.label])

  // 神髄石（メンテ回避ボーナス、ガチャ用通貨）
  const [shinzuiStone, setShinzuiStone] = useState(0)

  // 必要タップ数達成 → リザルト画面（タップで次へ）
  useEffect(() => {
    if (gameMode !== 'countdown') return
    if (hitsThisRound >= targetHits && !showAvoided) {
      setShowAvoided(true)
      setShinzuiStone((s) => s + currentStage.stoneReward)
      // gameMode を 'safe' に **しない**（プレイヤータップ待ち）
      // ただし maintenance タイマーが進まないように、countdown は維持してロジックで止める
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, hitsThisRound, targetHits])

  // リザルト画面でタップ → safe に遷移 + round 進行
  const proceedFromAvoided = () => {
    setShowAvoided(false)
    setRound((r) => r + 1)
    setGameMode('safe')
  }

  // ステージごとのハードフェーズ判定（残り N 秒以下で動的バッジが降ってくる、-1 なら発動なし）
  const isHardPhase =
    gameMode === 'countdown' &&
    currentStage.hardPhaseFromSec >= 0 &&
    maintenanceSeconds <= currentStage.hardPhaseFromSec
  useEffect(() => {
    if (!isHardPhase) {
      setBadges([])
      return
    }
    const spawn = () => {
      setBadges((prev) => {
        if (prev.length >= 10) return prev
        const r = Math.random()
        const type: BadgeType =
          r < 0.1 ? 'apology' : r < 0.35 ? 'critical' : 'normal'
        const hp = type === 'critical' ? 3 : 1
        return [
          ...prev,
          {
            id: ++badgeIdRef.current,
            x: 8 + Math.random() * 84,
            y: 14 + Math.random() * 70,
            hp,
            type,
            spawnedAt: Date.now(),
          },
        ]
      })
    }
    const interval = setInterval(spawn, 700 + Math.random() * 800)
    return () => clearInterval(interval)
  }, [isHardPhase])

  // バッジ自動消滅: スポーン後 4.5 秒で消える
  useEffect(() => {
    if (!isHardPhase) return
    const cleanup = setInterval(() => {
      const now = Date.now()
      setBadges((prev) => prev.filter((b) => now - b.spawnedAt < 4500))
    }, 200)
    return () => clearInterval(cleanup)
  }, [isHardPhase])

  // 既存アイコン上の赤バッジ叩き（icon-button / footer-button の onClick で発火）
  // アイコンの 4 段階アニメ: undefined（通常）→ exploding → gone → respawning → undefined
  const [iconState, setIconState] = useState<Record<string, IconAnimState>>({})

  const whackIconBadge = (key: string) => {
    if (iconState[key]) return // すでに消えてる or アニメ中
    // ステージで破壊不可なら無視
    if (!isDestroyable(key, currentStage)) return
    // active 制限ありの場合 (S1)、active 集合に含まれない key は無視 + 補充
    if (currentStage.activeBadgeMax > 0) {
      if (!activeBadgeKeys.has(key)) return
      setActiveBadgeKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        const candidates = allIconKeys.filter((k) => !next.has(k) && k !== key)
        if (candidates.length > 0) {
          next.add(candidates[Math.floor(Math.random() * candidates.length)])
        }
        return next
      })
    }
    // SE: 斬撃 or タップ + 爆発（両方鳴らして派手に）
    if (swipeActiveRef.current) {
      playSwordSE()
    } else {
      playPunchSE()
    }
    playExplode()
    setScore((s) => s + currentStage.scorePerHit)
    setHits((h) => h + 1)
    setHitsThisRound((h) => h + 1)

    // 4 段階アニメ:
    // 0     : exploding（弾け飛ぶ 0.45s）
    // 0.45s : gone（完全消滅、3-5 秒）
    // 3-5s  : respawning（もわっと出現 0.55s）
    // 3.55-5.55s : undefined（通常表示）
    setIconState((prev) => ({ ...prev, [key]: 'exploding' }))
    const goneAt = 450
    const respawnAt = 3500 + Math.random() * 2000
    const doneAt = respawnAt + 550

    setTimeout(() => {
      setIconState((prev) => ({ ...prev, [key]: 'gone' }))
    }, goneAt)
    setTimeout(() => {
      setIconState((prev) => ({ ...prev, [key]: 'respawning' }))
    }, respawnAt)
    setTimeout(() => {
      setIconState((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }, doneAt)
  }

  // ゲームモード切替時、アニメ中の状態をリセット（safe / idle で全要素復活）
  useEffect(() => {
    if (gameMode === 'idle' || gameMode === 'safe') setIconState({})
  }, [gameMode])

  // KAGUYA 全爆破: 全 destroyable オブジェクトを一気に exploding 化
  const [bombFlash, setBombFlash] = useState(false)
  const detonateBomb = () => {
    if (kaguyaBombs <= 0) return
    if (gameMode !== 'countdown') return
    consumeKaguyaBomb?.()
    playExplode()
    playExplodeA()
    playExplodeB()
    // 全 destroyable な key をリストアップ
    const allDestroyableKeys: string[] = []
    const candidateKeys = [
      ...allIconKeys,
      'player',
      'curr-gold', 'curr-shinzui', 'curr-diamond',
      'gb-pickup', 'gb-shinzui',
      'fo-0', 'fo-1', 'fo-2', 'fo-3', 'fo-4', 'fo-5',
    ]
    candidateKeys.forEach((key) => {
      if (!iconState[key] && isDestroyable(key, currentStage)) {
        allDestroyableKeys.push(key)
      }
    })
    // 一気に exploding 状態へ
    const newState: Record<string, IconAnimState> = { ...iconState }
    allDestroyableKeys.forEach((key) => { newState[key] = 'exploding' })
    setIconState(newState)
    // hits を一気に加算
    const count = allDestroyableKeys.length
    setHitsThisRound((h) => h + count)
    setHits((h) => h + count)
    setScore((s) => s + count * currentStage.scorePerHit)
    // 4 段階アニメ進行（exploding → gone → respawning → undefined）
    setTimeout(() => {
      setIconState((prev) => {
        const next = { ...prev }
        allDestroyableKeys.forEach((key) => {
          if (next[key] === 'exploding') next[key] = 'gone'
        })
        return next
      })
    }, 450)
    setTimeout(() => {
      setIconState((prev) => {
        const next = { ...prev }
        allDestroyableKeys.forEach((key) => {
          if (next[key] === 'gone') next[key] = 'respawning'
        })
        return next
      })
    }, 3500)
    setTimeout(() => {
      setIconState((prev) => {
        const next = { ...prev }
        allDestroyableKeys.forEach((key) => { delete next[key] })
        return next
      })
    }, 4050)
    // 画面フラッシュ
    setBombFlash(true)
    setTimeout(() => setBombFlash(false), 700)
  }

  // ステージ進行時のアンロック演出
  const [stageUnlockMsg, setStageUnlockMsg] = useState<{ icon: string; title: string; sub: string } | null>(null)
  const prevRoundRef = useRef(round)
  useEffect(() => {
    if (round > prevRoundRef.current) {
      let msg: { icon: string; title: string; sub: string } | null = null
      // 機能解放のあるラウンドでだけメッセージを出す（細かい難易度上昇は無音で進む）
      if (round === 3) msg = { icon: '⚡', title: 'サブターゲット 5 個に', sub: '同時に光る赤バッジが増えた' }
      else if (round === 4) msg = { icon: '⚠', title: '緊急通知が降ってくる', sub: 'ハードフェーズ 解放' }
      else if (round === 5) msg = { icon: '🚨', title: '業界アプリの妨害 開始', sub: 'NOW LOADING / DL モーダル / 強制チュートリアル' }
      else if (round === 6) msg = { icon: '⚔', title: 'スワイプ斬り 解放', sub: '指で滑らせて連続斬り' }
      else if (round === 8) msg = { icon: '💥', title: '解放: 全 UI 破壊', sub: '通貨もバナーも斬り倒せる' }
      else if (round === 10) msg = { icon: '🔥', title: '過酷モード 突入', sub: '最高難度 — 永久輪廻の到達点' }
      if (msg) {
        setStageUnlockMsg(msg)
        setTimeout(() => setStageUnlockMsg(null), 3800)
      }
    }
    prevRoundRef.current = round
  }, [round])

  // 既存ロジックの下位互換用（badge が消えてる ≒ icon が見えてない期間）
  const iconBadgesHidden: Record<string, boolean> = {}
  Object.entries(iconState).forEach(([k, v]) => {
    if (v === 'exploding' || v === 'gone') iconBadgesHidden[k] = true
  })

  // S1 で同時に光るバッジを制限する（3 個だけ）
  const [activeBadgeKeys, setActiveBadgeKeys] = useState<Set<string>>(new Set())
  const allIconKeys: string[] = [
    'sl-0', 'sl-1', 'sl-2', 'sl-3', 'sl-4',
    'sr-0', 'sr-1', 'sr-2', 'sr-3', 'sr-4',
    'fb-0', 'fb-1', 'fb-2', 'fb-3', 'fb-4',
  ]

  useEffect(() => {
    if (gameMode !== 'countdown') {
      setActiveBadgeKeys(new Set())
      return
    }
    if (currentStage.activeBadgeMax > 0) {
      const shuffled = [...allIconKeys].sort(() => Math.random() - 0.5)
      setActiveBadgeKeys(new Set(shuffled.slice(0, currentStage.activeBadgeMax)))
    } else {
      setActiveBadgeKeys(new Set(allIconKeys))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, currentStage.activeBadgeMax, round])

  const isWhackable = (key: string): boolean => {
    if (gameMode !== 'countdown') return false
    if (currentStage.activeBadgeMax > 0) {
      return activeBadgeKeys.has(key)
    }
    return true
  }

  const isBadgeVisible = (key: string): boolean => {
    if (iconBadgesHidden[key]) return false // explode アニメ中
    if (gameMode !== 'countdown') return false // 通常時は赤バッジ表示しない
    if (currentStage.activeBadgeMax > 0) {
      return activeBadgeKeys.has(key)
    }
    return true
  }

  // スワイプ連続消し（移動量 6px 以上で「スワイプ確定」）
  useEffect(() => {
    if (gameMode !== 'countdown') return

    let pressing = false
    let initialX = 0
    let initialY = 0
    const sweptKeys = new Set<string>()

    const sweep = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)
      if (!el) return
      const target = (el as Element).closest(
        '[data-icon-key], .whack-badge'
      ) as HTMLElement | null
      if (!target) return

      // 動的バッジ
      if (target.classList.contains('whack-badge')) {
        const id = target.dataset.badgeId
        if (id && !sweptKeys.has(`b-${id}`)) {
          sweptKeys.add(`b-${id}`)
          hitBadge(parseInt(id, 10))
        }
        return
      }
      // 全 UI 要素を破壊対象（PlayerInfo / 通貨 / GachaBanner / floating-offer / アイコン）
      const key = target.dataset.iconKey
      if (key && !sweptKeys.has(key)) {
        sweptKeys.add(key)
        whackIconBadge(key)
      }
    }

    const onDown = (e: PointerEvent) => {
      pressing = true
      initialX = e.clientX
      initialY = e.clientY
      sweptKeys.clear()
      swipeActiveRef.current = false
      // pointerdown 時点では何もしない（タップになるかスワイプになるか不明）
    }
    const onMove = (e: PointerEvent) => {
      if (!pressing) return
      // ステージでスワイプ未解放なら何もしない（タップ単独のみ反応）
      if (!currentStage.swipeEnabled) return
      const dist = Math.hypot(e.clientX - initialX, e.clientY - initialY)
      if (!swipeActiveRef.current && dist > 6) {
        // スワイプ確定 — 初期位置から sweep 開始
        swipeActiveRef.current = true
        sweep(initialX, initialY)
      }
      if (swipeActiveRef.current) {
        sweep(e.clientX, e.clientY)
      }
    }
    const onUp = (e: PointerEvent) => {
      // タップ単独（移動なし）の場合、その位置を sweep（タップ判定）
      if (pressing && !swipeActiveRef.current) {
        sweep(e.clientX, e.clientY)
      }
      pressing = false
      setTimeout(() => {
        swipeActiveRef.current = false
      }, 100)
      sweptKeys.clear()
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, currentStage.swipeEnabled])

  const hitBadge = (id: number) => {
    // 動的バッジは prefix 'b' として扱う、stage 'b' 含む時だけ破壊可能
    if (!currentStage.destroyable.includes('b')) return
    if (swipeActiveRef.current) {
      playSwordSE()
    } else {
      playPunchSE()
    }
    playExplode()
    setBadges((prev) => {
      const target = prev.find((b) => b.id === id)
      if (!target) return prev
      const newHp = target.hp - 1
      if (newHp <= 0) {
        // ランダムバッジは critical / apology はスコア倍率を維持しつつ stage 基準
        const baseScore = currentStage.scorePerHit
        const points =
          target.type === 'critical' ? Math.round(baseScore * 1.5)
          : target.type === 'apology' ? Math.round(baseScore * 2.5)
          : baseScore
        setScore((s) => s + points)
        setHits((h) => h + 1)
        setHitsThisRound((h) => h + 1)
        // 詫び石は 2 秒延命（業界の引き止め構造）
        if (target.type === 'apology') {
          setMaintenanceSeconds((s) => Math.min(MAINTENANCE_TOTAL_SEC + 30, s + 2))
        }
        return prev.filter((b) => b.id !== id)
      }
      return prev.map((b) => (b.id === id ? { ...b, hp: newHp } : b))
    })
  }

  if (gameMode === 'maintenance') {
    return <MaintenanceScreen muted={muted} onBackToTitle={() => onNavigate('title')} />
  }

  return (
    <>
      <BGMPlayer gameMode={gameMode} muted={muted} unlocked={audioUnlocked} />

      {/* countdown ヘッダー（visible に関係なく常時表示、ガチャ画面の上にも被さる） */}
      {gameMode === 'countdown' && !visible && (
        <MaintenanceCountdown seconds={maintenanceSeconds} />
      )}

      <div
        className="home-content"
        style={{ display: visible ? 'contents' : 'none' }}
      >

      {/* キャラ背景（Luma 生成 動画ループ）。countdown 中は battle 動画に切替 */}
      <video
        key={gameMode === 'countdown' ? 'battle' : 'idle'}
        className={`character-bg ${gameMode === 'countdown' ? 'character-bg-emergency' : ''}`}
        src={gameMode === 'countdown' ? '/heroes/kaguya-x-battle.mp4' : '/heroes/kaguya-x.mp4'}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
      />

      {/* 暗転トランジション（countdown 開始時） */}
      {battleTransition && <div className="battle-transition" aria-hidden="true" />}

      {/* 緊急メンテ赤 vignette overlay（点滅） */}
      {gameMode === 'countdown' && (
        <div className="emergency-overlay" aria-hidden="true" />
      )}

      <header className="header">
        <PlayerInfo state={iconState['player']} />
        <div className="currency-bar">
          {CURRENCIES.map((c) => {
            const liveValue =
              c.id === 'gold' ? score : c.id === 'shinzui' ? shinzuiStone : undefined
            return (
              <CurrencyItem
                key={c.id}
                currency={c}
                state={iconState[`curr-${c.id}`]}
                value={liveValue}
              />
            )
          })}
        </div>
      </header>

      {/* 通常時はティッカー、緊急メンテ告知が始まったら上書き */}
      {gameMode === 'countdown' ? (
        <MaintenanceCountdown seconds={maintenanceSeconds} />
      ) : (
        <div className="ticker-container ticker-under-header">
          <div className="ticker">
            您の英雄が降臨しました！素晴らしいです！　・　VIP6 限定 神髄ガチャ初回 6 折！　・　あなたは選ばれた主公です　・　累計課金 ¥9,800 達成で SSR 確定！　・　羅刹姫・葵 復刻ガチャ開催中　・　お詫び石 進呈中　・　深夜限定オファー 23:00 開始
          </div>
        </div>
      )}

      {/* スコア表示 + 赤バッジ（countdown 中のみ） */}
      {gameMode === 'countdown' && (
        <>
          <div className="whack-score">
            <span className="ws-round">{currentStage.label}</span>
            <span className="ws-progress">
              <span className="ws-value">{hitsThisRound}</span>
              <span className="ws-divider">/</span>
              <span className="ws-target">{targetHits}</span>
            </span>
            <span className="ws-stones">✨ {shinzuiStone}</span>
          </div>
          {badges.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`whack-badge wb-${b.type}`}
              data-badge-id={b.id}
              style={{ left: `${b.x}%`, top: `${b.y}%` }}
              onClick={(e) => {
                e.stopPropagation()
                hitBadge(b.id)
              }}
              aria-label="赤バッジを叩く"
            >
              {b.type === 'apology'
                ? '💎'
                : b.type === 'critical'
                ? `${pickRandom(BADGE_LABELS.critical)}`
                : pickRandom(BADGE_LABELS.normal)}
            </button>
          ))}
        </>
      )}

      {/* KAGUYA bomb（countdown 中、所持 > 0 で表示） */}
      {gameMode === 'countdown' && kaguyaBombs > 0 && (
        <button
          type="button"
          className="kaguya-bomb-btn"
          onClick={detonateBomb}
          aria-label="KAGUYA-X 全爆破"
        >
          <span className="kbb-icon">🌙</span>
          <span className="kbb-count">×{kaguyaBombs}</span>
        </button>
      )}

      {/* 全爆破フラッシュ */}
      {bombFlash && <div className="bomb-flash" aria-hidden="true" />}

      {/* ステージ解放演出 */}
      {stageUnlockMsg && (
        <div className="stage-unlock">
          <div className="stage-unlock-content">
            <div className="su-icon">{stageUnlockMsg.icon}</div>
            <div className="su-title">{stageUnlockMsg.title}</div>
            <div className="su-sub">{stageUnlockMsg.sub}</div>
          </div>
        </div>
      )}

      {/* メンテ回避リザルト（タップで次へ） */}
      {showAvoided && (
        <div className="avoided-overlay" onClick={proceedFromAvoided}>
          <div className="avoided-content" onClick={proceedFromAvoided}>
            <div className="avoided-icon">✓</div>
            <div className="avoided-title">緊急メンテナンス回避</div>
            <div className="avoided-stage">{currentStage.label} CLEAR</div>
            <div className="avoided-stats">
              <div className="as-row"><span>処理した赤バッジ</span><span>{hitsThisRound}</span></div>
              <div className="as-row"><span>累計スコア</span><span>{score}pt</span></div>
              <div className="as-row as-reward"><span>獲得 神髄石</span><span>✨ +{currentStage.stoneReward}</span></div>
            </div>
            <div className="avoided-tap">タップで次のステージへ</div>
          </div>
        </div>
      )}

      {/* safe 中: 次の緊急メンテへの予兆を控えめに */}
      {gameMode === 'safe' && (
        <div className="safe-indicator">
          R{round} 待機中…
        </div>
      )}



      <aside className="sidebar sidebar-left">
        {SIDEBAR_LEFT.map((item, i) => {
          const key = `sl-${i}`
          const animClass = iconState[key]
            ? `icon-${iconState[key]}`
            : ''
          return (
            <button
              key={i}
              className={`icon-button ${animClass}`}
              type="button"
              data-icon-key={key}
              onClick={() => gameMode === 'countdown' && whackIconBadge(key)}
            >
              <div className="icon-graphic" data-id={i} />
              <span className="icon-label">{item.label}</span>
              <span className="icon-sub">{item.sub}</span>
              <Badge whackable={isWhackable(key)} hidden={!isBadgeVisible(key)} />
            </button>
          )
        })}
      </aside>

      <aside className="sidebar sidebar-right">
        {SIDEBAR_RIGHT.map((item, i) => {
          const key = `sr-${i}`
          const animClass = iconState[key]
            ? `icon-${iconState[key]}`
            : ''
          return (
            <button
              key={i}
              className={`icon-button ${animClass}`}
              type="button"
              data-icon-key={key}
              onClick={() => gameMode === 'countdown' && whackIconBadge(key)}
            >
              <div className="icon-graphic" data-id={i + 10} />
              <span className="icon-label">{item.label}</span>
              <span className="icon-sub">{item.sub}</span>
              <Badge whackable={isWhackable(key)} hidden={!isBadgeVisible(key)} />
            </button>
          )
        })}
        <button
          type="button"
          className="sound-toggle"
          onClick={toggleMute}
          aria-label={muted ? '音を出す' : '音を消す'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button type="button" className="exit-button" onClick={onExit}>✕ 終了</button>
      </aside>

      <FloatingOffer iconState={iconState} />
      <HeroCharacter />
      <KaguyaDialog gameMode={gameMode} />
      <GachaBanners
        onNavigate={onNavigate}
        pickupState={iconState['gb-pickup']}
        shinzuiState={iconState['gb-shinzui']}
        countdownActive={gameMode === 'countdown'}
      />
      {gameMode === 'countdown' && <SwipeTrail />}

      {/* お邪魔要素 */}
      {obstacle === 'loading' && <NowLoadingOverlay />}
      {obstacle === 'tutorial' && <TutorialOverlay />}
      {obstacle === 'download' && <DownloadOverlay />}
      <LoginBonusModal
        open={obstacle === 'login-bonus'}
        onClose={() => setObstacle(null)}
      />

      <footer className="footer">
        {FOOTER_BUTTONS.map((label, i) => {
          const key = `fb-${i}`
          const animClass = iconState[key] ? `icon-${iconState[key]}` : ''
          return (
            <button
              key={label}
              type="button"
              className={`footer-button ${label === 'ガチャ' ? 'highlight' : ''} ${animClass}`}
              data-icon-key={key}
              onClick={() => {
                if (gameMode === 'countdown') {
                  whackIconBadge(key)
                } else if (label === 'ガチャ') {
                  onNavigate('gacha')
                }
              }}
            >
              {label === 'ガチャ' && <div className="rainbow-pillar" />}
              <div className="footer-icon" data-key={FOOTER_KEYS[i]} />
              <span className="footer-label">{label}</span>
              <Badge whackable={isWhackable(key)} hidden={!isBadgeVisible(key)} />
            </button>
          )
        })}
      </footer>

      </div>
    </>
  )
}

// ===== GachaScreen =====
function GachaScreen({
  onBack,
  inFlow = false,
  onAdvance,
  addKaguyaBomb,
}: {
  onBack: () => void
  inFlow?: boolean
  onAdvance?: () => void
  addKaguyaBomb?: () => void
}) {
  const [seconds, setSeconds] = useState(23 * 3600 + 47 * 60 + 18)
  const [pity, setPity] = useState(153)
  const [summoning, setSummoning] = useState(false)
  const [results, setResults] = useState<{ name: string; rarity: Rarity }[] | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const shinzui = useTickingNumber(9847, 12.5)

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const summon = (count: 1 | 10) => {
    if (summoning) return
    setSummoning(true)
    setTimeout(() => {
      const r = count === 1 ? [rollOne()] : rollTen()
      setResults(r)
      setSummoning(false)
      setPity((p) => Math.min(200, p + count))
      // KAGUYA-X が含まれていたら、ホーム画面に「全爆破ボム」追加
      const kaguyaCount = r.filter((c) => c.name === 'KAGUYA-X').length
      if (kaguyaCount > 0 && addKaguyaBomb) {
        for (let i = 0; i < kaguyaCount; i++) addKaguyaBomb()
      }
    }, 2400)
  }

  const tryExit = () => setConfirmExit(true)

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  return (
    <div className="gacha-screen">
      <header className="gacha-header">
        <button type="button" className="back-button" onClick={tryExit}>← 戻る</button>
        <div className="gacha-title">
          <div className="gacha-title-main">100 連 無料 ガチャ</div>
          <div className="gacha-title-sub">残り {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}</div>
        </div>
        <div className="gacha-currency">✨ {Math.floor(shinzui).toLocaleString()}</div>
      </header>

      <div className="gacha-hero">
        <img
          src="/banners/kaguya-banner.png"
          alt="月華の姫 KAGUYA-X LR 召喚祭"
          className="gh-banner"
        />
      </div>

      <div className="pickup-row">
        {PICKUP_CHARS.map((c) => (
          <div key={c.name} className="pickup-card" style={{ background: RARITY_BG[c.rarity] }}>
            {c.up && <div className="pickup-up">UP</div>}
            <div className="pickup-rarity">{c.rarity}</div>
            <div className="pickup-name">{c.name}</div>
          </div>
        ))}
      </div>

      <div className="pity">
        <div className="pity-label">天井確定まで <strong>{200 - pity}</strong> 連</div>
        <div className="pity-bar">
          <div className="pity-fill" style={{ width: `${(pity / 200) * 100}%` }} />
        </div>
      </div>

      <div className="summon-row">
        <button type="button" className="summon-button single" onClick={() => summon(1)} disabled={summoning}>
          <div className="summon-label">1 連 召喚</div>
          <div className="summon-cost">✨ 150</div>
        </button>
        <button type="button" className="summon-button ten" onClick={() => summon(10)} disabled={summoning}>
          <div className="summon-flash" />
          <div className="summon-label">💎 10 連 召喚</div>
          <div className="summon-cost">✨ 1,500（10% OFF！）</div>
          <div className="summon-tag">SR 以上 1 体確定</div>
        </button>
      </div>

      <div className="gacha-footer-info">
        ※ 提供割合：LR 0.5% / SSR+ 2.0% / SSR 7.0% / SR 25% / R 65.5%（業界擬態）
      </div>

      {summoning && (
        <div className="summon-anim">
          <div className="sa-bg" />
          <div className="sa-rays" />
          <div className="sa-text">召喚中...</div>
          <div className="sa-spinner">✨</div>
        </div>
      )}

      {results && (() => {
        const topHit =
          results.find((r) => r.rarity === 'LR') ||
          results.find((r) => r.rarity === 'SSR+') ||
          results.find((r) => r.rarity === 'SSR')
        return (
          <>
            {topHit && (
              <div className="ssr-flash" key={`flash-${topHit.name}`}>
                <div className="ssr-rays" />
                <div className="ssr-confetti" />
                <div className="ssr-text">
                  <div className="ssr-rarity">{topHit.rarity} 確定</div>
                  <div className="ssr-char">{topHit.name}</div>
                  <div className="ssr-msg">降臨！</div>
                </div>
              </div>
            )}
            <div className="results-modal">
              <div className="results-rays" />
              <div className="results-content">
                <div className="results-title">召喚結果</div>
                <div className="results-grid">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`result-card rarity-${r.rarity.replace('+', 'plus')}`}
                      style={{ background: RARITY_BG[r.rarity], animationDelay: `${i * 0.1}s` }}
                    >
                      <div className="result-rarity" style={{ color: RARITY_COLORS[r.rarity] }}>{r.rarity}</div>
                      <div className="result-name">{r.name}</div>
                    </div>
                  ))}
                </div>
                <button type="button" className="results-close" onClick={() => setResults(null)}>もう一度引く</button>
                <button type="button" className="results-close-alt" onClick={() => setResults(null)}>閉じる</button>
              </div>
            </div>
          </>
        )
      })()}

      {confirmExit && (
        <div className="confirm-exit">
          <div className="ce-content">
            <div className="ce-title">⚠️ 本当にガチャを離れますか？</div>
            <div className="ce-body">
              現在 <strong>SSR 確率 9% 上昇中</strong> です。<br />
              この後 <strong>23:00</strong> から確率は通常に戻ります。<br />
              限定キャラ「羅刹姫・葵」は復刻まで<strong>半年</strong>かかる可能性があります。
            </div>
            <div className="ce-buttons">
              <button type="button" className="ce-stay" onClick={() => setConfirmExit(false)}>ガチャを続ける（推奨）</button>
              <button type="button" className="ce-leave" onClick={inFlow && onAdvance ? onAdvance : onBack}>それでも離れる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Layer 1: ログインボーナス =====
function Layer1Screen({ onAdvance, onBlock }: { onAdvance: () => void; onBlock: () => void }) {
  const handleAdvance = () => {
    onBlock()
    onAdvance()
  }
  return (
    <div className="layer-screen layer-1">
      <div className="layer-content">
        <div className="layer-tag">7 日連続ログイン特典</div>
        <div className="layer-title">🎁 ログインボーナス</div>
        <div className="layer-progress">
          <span className="day done">1日目 ✓</span>
          <span className="day done">2日目 ✓</span>
          <span className="day done">3日目 ✓</span>
          <span className="day done">4日目 ✓</span>
          <span className="day done">5日目 ✓</span>
          <span className="day done">6日目 ✓</span>
          <span className="day today">7日目<br/>★LR★</span>
        </div>
        <div className="layer-message">
          7 日連続まで<strong>あと 1 日</strong>です。<br />
          受け取らないと **連続記録がリセット** されます。
        </div>
        <div className="layer-rewards">
          <div className="reward-item">✨ 神髄 200 個</div>
          <div className="reward-item">📜 招集令 5 個</div>
          <div className="reward-item">💎 ダイヤ 100 個</div>
        </div>
        <div className="layer-buttons">
          <button type="button" className="layer-btn primary" onClick={handleAdvance}>
            受け取る
          </button>
          <button type="button" className="layer-btn secondary" onClick={handleAdvance}>
            後で
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== Layer 2: 人間関係（ギルド） =====
function Layer2Screen({ onAdvance, onBlock }: { onAdvance: () => void; onBlock: () => void }) {
  const handleAdvance = () => {
    onBlock()
    onAdvance()
  }
  return (
    <div className="layer-screen layer-2">
      <div className="layer-content">
        <div className="layer-tag">ギルマスからのお手紙</div>
        <div className="layer-title">📨 Tanaka さんから</div>
        <div className="letter-box">
          <div className="letter-from">From: ギルマス Tanaka</div>
          <div className="letter-body">
            「最近見ないけど、大丈夫？<br /><br />
            あなたが抜けると、ギルドが解散の危機なんだ。残りメンバー <strong>5 名</strong>。<br /><br />
            ギルド戦、あと <strong>3 名</strong>であなたが必要だよ。<br /><br />
            戻ってきて。」
          </div>
          <div className="letter-time">24 時間前</div>
        </div>
        <div className="layer-message">
          フレンド <strong>*Yuji*</strong> さんもログインしました（最終 6 ヶ月ぶり）。
        </div>
        <div className="layer-buttons">
          <button type="button" className="layer-btn primary" onClick={handleAdvance}>
            返信する
          </button>
          <button type="button" className="layer-btn secondary" onClick={handleAdvance}>
            スキップ
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== Layer 4: 詫び石進呈 =====
function Layer4Screen({ onAdvance, onBlock, addStones }: { onAdvance: () => void; onBlock: () => void; addStones: (n: number) => void }) {
  const handleAdvance = () => {
    onBlock()
    addStones(5000)
    onAdvance()
  }
  return (
    <div className="layer-screen layer-4">
      <div className="layer-content">
        <div className="layer-tag">運営からのお知らせ</div>
        <div className="layer-title">🎁 お詫び石 進呈</div>
        <div className="apology-box">
          <div className="apology-header">【お知らせ】</div>
          <div className="apology-body">
            先日のメンテナンスにご迷惑をおかけしました。<br /><br />
            お詫びとして<br />
            <strong className="big-stones">お詫び石 5,000 個</strong><br />
            進呈いたします。<br /><br />
            本当に、本当に、申し訳ありませんでした。
          </div>
        </div>
        <div className="layer-message smaller">
          ※ お詫び石はガチャに使用できます。<br />
          SSR 確率 9% 上昇キャンペーン中、ぜひご利用ください。
        </div>
        <div className="layer-buttons">
          <button type="button" className="layer-btn primary" onClick={handleAdvance}>
            受け取る
          </button>
        </div>
      </div>
    </div>
  )
}

// ===== Layer 5: アンインストールアンケート =====
const SURVEY_QUESTIONS = [
  { q: 'ご利用期間を教えてください', opts: ['〜1ヶ月', '〜半年', '〜1年', '1年以上'] },
  { q: '最も楽しんだコンテンツは？', opts: ['ガチャ', 'ストーリー', 'ギルド戦', '育成', 'イベント'] },
  { q: '改善してほしい点は？', opts: ['ガチャ確率', 'ストーリー', '運営対応', '演出', '課金導線'] },
  { q: '他のゲームに移行されますか？', opts: ['はい', 'いいえ', '検討中'] },
  { q: '復帰の可能性は？', opts: ['あり', '条件次第', 'なし'] },
  { q: 'ガチャの天井設定について', opts: ['適切', '高い', '低い', 'わからない'] },
  { q: 'ストーリー満足度', opts: ['★', '★★', '★★★', '★★★★', '★★★★★'] },
  { q: '課金額の妥当性', opts: ['★', '★★', '★★★', '★★★★', '★★★★★'] },
  { q: '運営対応の評価', opts: ['★', '★★', '★★★', '★★★★', '★★★★★'] },
  { q: 'ご意見・ご感想', opts: ['面白かった', 'まあまあ', '時間の無駄だった', '神ゲー', 'その他'] },
]

function Layer5Screen({ onAdvance, onBlock, addStones }: { onAdvance: () => void; onBlock: () => void; addStones: (n: number) => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])

  const select = (opt: string) => {
    onBlock()
    setAnswers((prev) => [...prev, opt])
    if (step >= SURVEY_QUESTIONS.length - 1) {
      addStones(5000)
      setTimeout(() => onAdvance(), 800)
    } else {
      setStep((s) => s + 1)
    }
  }

  const q = SURVEY_QUESTIONS[step]

  return (
    <div className="layer-screen layer-5">
      <div className="layer-content survey">
        <div className="survey-header">
          <div className="survey-title">アンインストールアンケート</div>
          <div className="survey-progress">
            Q{step + 1} / {SURVEY_QUESTIONS.length}
          </div>
        </div>
        <div className="survey-question">{q.q}</div>
        <div className="survey-options">
          {q.opts.map((opt, i) => (
            <button key={i} type="button" className="survey-option" onClick={() => select(opt)}>
              {opt}
            </button>
          ))}
        </div>
        <div className="survey-pity">
          完了後、お詫びとして詫び石 5,000 個を進呈いたします。
        </div>
        <div className="survey-history">
          {answers.map((a, i) => (
            <span key={i} className="answer-chip">Q{i + 1}: {a}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===== Free（エンディング） =====
function FreeScreen({ stats, onRestart }: { stats: GameStats; onRestart: () => void }) {
  const elapsed = Math.floor((Date.now() - stats.startedAt) / 1000)
  const m = Math.floor(elapsed / 60)
  const s = elapsed % 60

  return (
    <div className="free-screen">
      <div className="free-bg" />
      <div className="free-content">
        <div className="free-title">Congratulations.</div>
        <div className="free-subtitle">You are free.</div>

        <div className="free-stats">
          <div className="free-stat-row">
            <div className="free-stat-label">離脱までの時間</div>
            <div className="free-stat-value">{m} 分 {s} 秒</div>
          </div>
          <div className="free-stat-row">
            <div className="free-stat-label">食らった引き止め</div>
            <div className="free-stat-value">{stats.blocksHit} 回</div>
          </div>
          <div className="free-stat-row defeat">
            <div className="free-stat-label">詫び石残高</div>
            <div className="free-stat-value">{stats.apologyStones.toLocaleString()} 個</div>
            <div className="free-stat-note">この世界に置いていきます</div>
          </div>
        </div>

        <div className="free-message">
          あなたは <strong>{m} 分 {s} 秒</strong> で自由になりました。<br /><br />
          詫び石 <strong>{stats.apologyStones.toLocaleString()} 個</strong> はこの世界に置いていきます。<br /><br />
          あなたの 847 日の足跡は、データのまま残されます。
        </div>

        <button type="button" className="free-restart" onClick={onRestart}>
          もう一度プレイする
        </button>
      </div>
    </div>
  )
}

// ===== Root App =====
export default function App() {
  const [screen, setScreen] = useState<Screen>('title')
  const [stats, setStats] = useState<GameStats>({
    startedAt: Date.now(),
    blocksHit: 0,
    apologyStones: 0,
  })

  const [audioUnlocked, setAudioUnlocked] = useState(false)
  const [kaguyaBombs, setKaguyaBombs] = useState(0)
  const addKaguyaBomb = () => setKaguyaBombs((s) => s + 1)
  const consumeKaguyaBomb = () => setKaguyaBombs((s) => Math.max(0, s - 1))

  // 起動時グローバル audio unlock（最初のユーザータップで全 BGM/SE を unlock）
  useEffect(() => {
    const sources = [
      '/audio/title-bgm.mp3',
      '/audio/home-bgm.mp3',
      '/audio/maintenance-bgm.mp3',
      '/audio/se-whack.mp3',
      '/audio/se-tap-light.mp3',
      '/audio/se-alarm.mp3',
      '/audio/se-clear.mp3',
      '/audio/se-explode-3.mp3',
      '/audio/se-explode-4.mp3',
      '/audio/se-chime.mp3',
    ]
    const unlock = () => {
      sources.forEach((src) => {
        const a = new Audio(src)
        a.muted = true
        a.play().then(() => {
          a.pause()
          a.src = ''
        }).catch(() => {})
      })
      setAudioUnlocked(true)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])

  const onBlock = () => setStats((s) => ({ ...s, blocksHit: s.blocksHit + 1 }))
  const addStones = (n: number) => setStats((s) => ({ ...s, apologyStones: s.apologyStones + n }))

  const onExit = () => {
    setStats({ startedAt: Date.now(), blocksHit: 0, apologyStones: 0 })
    setScreen('layer1')
  }

  const restart = () => {
    setStats({ startedAt: Date.now(), blocksHit: 0, apologyStones: 0 })
    setScreen('home')
  }

  return (
    <div className="phone-frame">
      <div className="home-screen">
        {screen === 'title' && <TitleScreen onStart={() => setScreen('home')} />}
        {/* home / gacha では HomeScreen を常に mount（visible で表示制御）→ countdown / BGM 継続 */}
        {(screen === 'home' || screen === 'gacha') && (
          <HomeScreen
            onNavigate={setScreen}
            onExit={onExit}
            audioUnlocked={audioUnlocked}
            kaguyaBombs={kaguyaBombs}
            consumeKaguyaBomb={consumeKaguyaBomb}
            visible={screen === 'home'}
          />
        )}
        {screen === 'gacha' && <GachaScreen onBack={() => setScreen('home')} addKaguyaBomb={addKaguyaBomb} />}
        {screen === 'layer1' && <Layer1Screen onAdvance={() => setScreen('layer2')} onBlock={onBlock} />}
        {screen === 'layer2' && <Layer2Screen onAdvance={() => setScreen('layer3')} onBlock={onBlock} />}
        {screen === 'layer3' && (
          <GachaScreen
            onBack={() => setScreen('layer4')}
            inFlow={true}
            onAdvance={() => {
              onBlock()
              setScreen('layer4')
            }}
          />
        )}
        {screen === 'layer4' && <Layer4Screen onAdvance={() => setScreen('layer5')} onBlock={onBlock} addStones={addStones} />}
        {screen === 'layer5' && <Layer5Screen onAdvance={() => setScreen('free')} onBlock={onBlock} addStones={addStones} />}
        {screen === 'free' && <FreeScreen stats={stats} onRestart={restart} />}
      </div>
    </div>
  )
}
