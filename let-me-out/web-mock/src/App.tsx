import { useEffect, useRef, useState } from 'react'
import './App.css'

const CURRENCIES = [
  { id: 'gold', name: '金貨', icon: '🪙', initial: 12847, incPerSec: 47, color: '#ffd700' },
  { id: 'silver', name: '銀貨', icon: '💰', initial: 84392, incPerSec: 117, color: '#e0e0e0' },
  { id: 'diamond', name: 'ダイヤ', icon: '💎', initial: 1234, incPerSec: 0.8, color: '#9be0ff' },
  { id: 'genpou', name: '元宝', icon: '🟡', initial: 5840, incPerSec: 4.2, color: '#ffaa00' },
  { id: 'stone', name: '石', icon: '🪨', initial: 23847, incPerSec: 23, color: '#aaaaaa' },
  { id: 'key', name: '鍵', icon: '🗝️', initial: 47, incPerSec: 0.15, color: '#daa520' },
  { id: 'shouken', name: '招集令', icon: '📜', initial: 128, incPerSec: 0.3, color: '#ee9944' },
  { id: 'shinzui', name: '神髄', icon: '✨', initial: 9847, incPerSec: 12.5, color: '#cc88ff' },
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

const OFFERS = [
  { eyebrow: '期間限定 ピックアップ', title: '100 連 無料 ガチャ', cta: 'いますぐ召喚 →' },
  { eyebrow: '初回 6 折 SALE', title: '神髄パック ¥980', cta: '購入する →' },
  { eyebrow: 'LR 復刻', title: 'KAGUYA-X 召喚祭', cta: '召喚に挑む →' },
  { eyebrow: 'VIP3 昇格', title: 'あと ¥980 で昇格', cta: 'チャージ →' },
  { eyebrow: '天井 200 連', title: 'あと 47 連で確定', cta: '続ける →' },
  { eyebrow: 'コラボ開催', title: '秘書・サユリ × 三国', cta: '詳細を見る →' },
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

// ガチャ用：ピックアップ + プール
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
  // 業界擬態：10 連で SR 以上が必ず 1 体保証
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
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      const wobble = 1 + Math.sin((now / 1000) * 0.5 * Math.PI * 2) * 0.3
      valueRef.current += incPerSec * dt * Math.max(0, wobble)
      setValue(valueRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [incPerSec])

  return value
}

function Badge() {
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

  return <div className="badge">{count > 99 ? '99+' : count}</div>
}

function CurrencyItem({ currency }: { currency: (typeof CURRENCIES)[number] }) {
  const value = useTickingNumber(currency.initial, currency.incPerSec)
  return (
    <div className="currency-item">
      <div className="currency-icon-wrap">
        <span className="currency-icon">{currency.icon}</span>
      </div>
      <span className="currency-value" style={{ color: currency.color }}>
        {formatNumber(value)}
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
          {
            id: idRef.current++,
            x: 8 + Math.random() * 84,
            y: 12 + Math.random() * 50,
            spawnAt: Date.now(),
          },
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
        <div
          key={e.id}
          className={e.killAt ? 'enemy enemy-dying' : 'enemy'}
          style={{ left: `${e.x}%`, top: `${e.y}%` }}
        >
          {e.killAt && <div className="hit-effect" />}
        </div>
      ))}
    </div>
  )
}

function FloatingOffer() {
  const [seconds, setSeconds] = useState(23 * 3600 + 47 * 60 + 18)
  const [offerIdx, setOfferIdx] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    const rotate = setInterval(() => {
      setOfferIdx((i) => (i + 1) % OFFERS.length)
    }, 4000)
    return () => {
      clearInterval(t)
      clearInterval(rotate)
    }
  }, [])

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const offer = OFFERS[offerIdx]

  return (
    <div className="floating-offer" key={offerIdx}>
      <div className="offer-eyebrow">{offer.eyebrow}</div>
      <div className="offer-title">{offer.title}</div>
      <div className="offer-timer">
        残り {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </div>
      <div className="offer-cta">{offer.cta}</div>
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
      setTimeout(() => {
        setActive((prev) => prev.filter((m) => m.id !== id))
      }, 3500)
    }, 1100)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="toast-feed">
      {active.map((m) => (
        <div key={m.id} className="toast">
          {m.text}
        </div>
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

function PromoStrip() {
  return (
    <div className="promo-strip">
      {PROMOS.map((p, i) => (
        <button key={i} className="promo-item" type="button" style={{ borderColor: p.accent }}>
          <span className="promo-icon" style={{ background: `radial-gradient(circle, ${p.accent}, #000)` }}>
            {p.icon}
          </span>
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
      <div className="hero-rays" />
      <div className="hero-emblem" />
      <div className="hero-stars">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`star star-${i}`}>✦</div>
        ))}
      </div>
      <div className="hero-aura" />
      <div className="hero-silhouette" />
      <div className="hero-frame">
        <div className="hero-rarity">LR</div>
        <div className="hero-name">KAGUYA-X</div>
        <div className="hero-tagline">月へ、帰る前に</div>
      </div>
    </div>
  )
}

// ===== HomeScreen =====
type Screen = 'home' | 'gacha'

function HomeScreen({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  return (
    <>
      <BattleBackground />

      <header className="header">
        <div className="vip-badge">VIP3</div>
        <div className="currency-bar">
          {CURRENCIES.map((c) => (
            <CurrencyItem key={c.id} currency={c} />
          ))}
        </div>
      </header>

      <EventBanner />

      <aside className="sidebar sidebar-left">
        {SIDEBAR_LEFT.map((item, i) => (
          <button key={i} className="icon-button" type="button">
            <div className="icon-graphic" data-id={i} />
            <span className="icon-label">{item.label}</span>
            <span className="icon-sub">{item.sub}</span>
            <Badge />
          </button>
        ))}
      </aside>

      <aside className="sidebar sidebar-right">
        {SIDEBAR_RIGHT.map((item, i) => (
          <button key={i} className="icon-button" type="button">
            <div className="icon-graphic" data-id={i + 10} />
            <span className="icon-label">{item.label}</span>
            <span className="icon-sub">{item.sub}</span>
            <Badge />
          </button>
        ))}
      </aside>

      <FloatingOffer />
      <ToastFeed />
      <HeroCharacter />
      <BattlePower />

      <div className="ticker-container">
        <div className="ticker">
          您の英雄が降臨しました！素晴らしいです！　・　VIP6 限定 神髄ガチャ初回 6 折！　・　あなたは選ばれた主公です　・　累計課金 ¥9,800 達成で SSR 確定！　・　羅刹姫・葵 復刻ガチャ開催中　・　お詫び石 進呈中　・　深夜限定オファー 23:00 開始
        </div>
      </div>

      <PromoStrip />

      <footer className="footer">
        {FOOTER_BUTTONS.map((label) => (
          <button
            key={label}
            type="button"
            className={`footer-button ${label === 'ガチャ' ? 'highlight' : ''}`}
            onClick={() => label === 'ガチャ' && onNavigate('gacha')}
          >
            {label === 'ガチャ' && <div className="rainbow-pillar" />}
            <div className="footer-icon" />
            <span className="footer-label">{label}</span>
            <Badge />
          </button>
        ))}
      </footer>

      <SSRFlash />
    </>
  )
}

// ===== GachaScreen =====
function GachaScreen({ onBack }: { onBack: () => void }) {
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
    }, 2400)
  }

  const tryExit = () => {
    setConfirmExit(true)
  }

  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60

  return (
    <div className="gacha-screen">
      {/* ヘッダー */}
      <header className="gacha-header">
        <button type="button" className="back-button" onClick={tryExit}>
          ← 戻る
        </button>
        <div className="gacha-title">
          <div className="gacha-title-main">100 連 無料 ガチャ</div>
          <div className="gacha-title-sub">
            残り {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
          </div>
        </div>
        <div className="gacha-currency">
          ✨ {Math.floor(shinzui).toLocaleString()}
        </div>
      </header>

      {/* メインビジュアル */}
      <div className="gacha-hero">
        <div className="gh-rays" />
        <div className="gh-emblem" />
        <div className="gh-stars">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`gh-star gh-star-${i}`}>✦</div>
          ))}
        </div>
        <div className="gh-aura" />
        <div className="gh-silhouette" />
        <div className="gh-name">羅刹姫・葵</div>
        <div className="gh-rarity-tag">PICK UP！ SSR 確率 9% 上昇中</div>
      </div>

      {/* ピックアップ 3 体 */}
      <div className="pickup-row">
        {PICKUP_CHARS.map((c) => (
          <div key={c.name} className="pickup-card" style={{ background: RARITY_BG[c.rarity] }}>
            {c.up && <div className="pickup-up">UP</div>}
            <div className="pickup-rarity">{c.rarity}</div>
            <div className="pickup-name">{c.name}</div>
          </div>
        ))}
      </div>

      {/* 天井 */}
      <div className="pity">
        <div className="pity-label">天井確定まで <strong>{200 - pity}</strong> 連</div>
        <div className="pity-bar">
          <div className="pity-fill" style={{ width: `${(pity / 200) * 100}%` }} />
        </div>
      </div>

      {/* 召喚ボタン */}
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

      {/* 召喚演出 */}
      {summoning && (
        <div className="summon-anim">
          <div className="sa-bg" />
          <div className="sa-rays" />
          <div className="sa-text">召喚中...</div>
          <div className="sa-spinner">✨</div>
        </div>
      )}

      {/* 結果モーダル */}
      {results && (
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
                  <div className="result-rarity" style={{ color: RARITY_COLORS[r.rarity] }}>
                    {r.rarity}
                  </div>
                  <div className="result-name">{r.name}</div>
                </div>
              ))}
            </div>
            <button type="button" className="results-close" onClick={() => setResults(null)}>
              もう一度引く
            </button>
            <button type="button" className="results-close-alt" onClick={() => setResults(null)}>
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 戻る確認（業界擬態の引き止め） */}
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
              <button type="button" className="ce-stay" onClick={() => setConfirmExit(false)}>
                ガチャを続ける（推奨）
              </button>
              <button type="button" className="ce-leave" onClick={onBack}>
                それでも離れる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  return (
    <div className="phone-frame">
      <div className="home-screen">
        {screen === 'home' && <HomeScreen onNavigate={setScreen} />}
        {screen === 'gacha' && <GachaScreen onBack={() => setScreen('home')} />}
      </div>
    </div>
  )
}
