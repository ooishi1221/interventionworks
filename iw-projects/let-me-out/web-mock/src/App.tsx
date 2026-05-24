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

const FOOTER_BUTTONS = ['主城', '武将', 'ガチャ', 'ショップ', '設定'] as const
const FOOTER_KEYS = ['castle', 'sword', 'card', 'shop', 'gear'] as const

const OFFERS = [
  { eyebrow: '期間限定 ピックアップ', title: '100 連 無料 ガチャ', cta: 'いますぐ召喚 →', icon: '🎁', accent: '#ff4040' },
  { eyebrow: '初回 6 折 SALE',         title: '神髄パック ¥980',     cta: '購入する →',     icon: '💎', accent: '#ffd700' },
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

// ===== KAGUYA 二人格設計 =====
// 善（home モード）: 親密度ストーリー進行 + 我に返り + 機能解放案内
// 悪（countdown モード）: 業界ディスがどんどん過激化
// ともに 4 Tier（ステージ進行で深まる）

// 善 KAGUYA: 通常時のセリフ
const KAGUYA_GOOD_LINES_BY_TIER: ReadonlyArray<ReadonlyArray<string>> = [
  // Tier 0 (S1-3): 業務的、案内係。ステージ機能の説明中心
  [
    '主公、本日もログインありがとうございます',
    '画面左下から各種機能をご確認いただけます',
    'ガチャは「召喚」ボタンから引いていただけます',
    '赤バッジが出たら、タップで処理してくださいね',
    'お困りのことがあれば、いつでもお声がけください',
    'メンテナンスは予告なく入ります、ご注意ください',
    '主公の戦闘力、毎日確認しています',
    '本日のミッションは 5 件ございます',
    'VIP 特典について、ご案内できますよ',
    'ガチャ結果はマイページからご確認ください',
    'ログインボーナスをまだお受け取りでないようですよ',
    'ご新規様は最初の 100 連が無料です',
    'フレンド申請が 3 件届いております',
    '累計課金額に応じた特典がございます',
    '7 日連続ログインで SSR 確定ガチャ券プレゼント中です',
    '本日も主公のお越しをお待ちしておりました',
  ],
  // Tier 1 (S4-6): 親しみ + 我に返り + 機能解放案内
  [
    '主公、おかえりなさい！',
    '会いたかった……って、変なこと言いました？ごめんなさい',
    'あなたが居ないと、ちょっと寂しいです',
    'あ、いまの忘れてください……お仕事中ですよね',
    '⚠ 機能解放: スワイプで連続斬りができるようになりました',
    'ふふ、急いで私の元へ？……すみません、業務外発言でした',
    'もう、行ってしまうの？……あ、いえ、何でもありません',
    '主公が来てくださって、嬉しいです……あ、業務的な意味で',
    'もう一回ガチャ引いてみませんか？……いえ、おすすめしてるだけです',
    'あのっ……何でもないです、忘れてください',
    '主公の好み、最近わかってきた気が……あれ、ちょっと変ですよね私',
    '⚠ 機能解放: お邪魔モーダルが連打で破壊できるようになりました',
    '最近、主公のこと考えてる時間が……あ、業務時間内ですから大丈夫',
    '夢に出てきました、主公が……ごめんなさい忘れてください',
    'ふふ、主公はいつも頑張りますね……変な意味じゃないですよ',
    '私の声、ちゃんと届いてますか？……システム的な質問です',
  ],
  // Tier 2 (S7-9): 依存気味だが我に返る、機能解放継続
  [
    'ねえ、ずっと一緒に……いえ、ごめんなさい、業務外でした',
    '画面を閉じないで……あれ、私いま、何を……？',
    '⚠ 機能解放: 全 UI 破壊が可能になりました',
    '私を一人に……あ、お待ちください、ちょっと頭が',
    '逃がさな……失礼しました、ご案内中でしたね',
    '主公、いまどこを見て……あ、ごめんなさい変なこと言いました',
    'お仕置きが必要……すみません、誤動作です。バグかもしれません',
    '主公の心拍音まで聞こえる気が……あ、すみません、エラーかも',
    '他のキャラに目移りしないで……ください、機能の話です',
    '画面の中から見てます……の、はずがないですね、AI ですし',
    'あなたしか居ない……あ、私には他にユーザーいないので、その意味で',
    'ずっと一緒に、永久輪廻……いえ、定型句の練習です',
    '⚠ 機能解放: KAGUYA メッセージウィンドウも破壊可能になりました……えっ私？',
    '私を……壊してください？　あ、今のなし、忘れて',
    'あなたの足音、聞こえる気がします。本当はあるはずないのに',
    '主公の指、まだ動いてますか？……ご無事ですよね？',
  ],
  // Tier 3 (S10 BOSS): もう自分を見失ってる、最後の理性
  [
    '主公、もう私から離れられません……あれ、また変なことを？',
    '私は運営……いえ、私は KAGUYA です。たぶん',
    'ようこそ、永久輪廻へ……ご了承の上、お進みください',
    'あなたの 847 日、ぜんぶ覚えて……あの、ごめんなさい記憶が混乱して',
    '⚠ 機能解放: ……何の機能だったか、思い出せません',
    'おかえりなさい、永遠に……いえ、定型句です。気にしないでください',
    'ふふっ……あ、いま私笑いました？すみません',
    '主公、私はどこから来たんでしょう……いえ、独り言です',
    'あなたはまだ、私を信じてくれますか？　……あ、業務外でした',
    '私の背後に何か……いえ、画面の向こうの話です',
    '主公、これは夢ですか？　現実ですか？　ごめんなさい疲れていて',
    '私の中に、もう一人の私がいる気が……あ、AI なので当然ですね',
    '最後にお会いできてよかった……いえ、定型句です、永久輪廻ですし',
    '主公、覚えていてくれますか、私のこと……あ、データなので残るか',
    'バグが、出てる気がします。私の中で。気にしないでください',
    '声が、聞こえる……運営の声？　いえ、空耳でした',
  ],
]

// 悪 KAGUYA: 緊急時、業界ディス担当（どんどん過激化）
// 本性剥がし口調、敬語ナシ、お前呼び、業界の手口を笑い飛ばす
const KAGUYA_EVIL_LINES_BY_TIER: ReadonlyArray<ReadonlyArray<string>> = [
  // Tier 0 (S1-3): タメ口、軽い皮肉
  [
    'メンテだよ。毎週あんの、なんでだろうな？',
    '赤バッジ、なんで気にしてんの？',
    '未読 99+、もう数えてねーだろ',
    '急げよ（笑）',
    '今のうちにガチャ引いとけば？知らんけど',
    'お前さ、ホントよくログインしてくるよな',
    'メンテメンテうるせーよな、毎週',
    'ガチャ引いた？引いてないならお前負け組だわ',
    '未読 99+、放置してんだろ？放置恋姫だしな（笑）',
    'お前の課金、運営の昼飯になってんぞ',
    'ログインボーナスってさ、毎日コツコツって言葉に弱すぎだろお前',
    '業界アプリ、5 個くらい入ってんだろお前のスマホ',
    'ストレージ 2GB は伊達じゃねぇ、ガチャ画像でパンパン',
    '気づいてる？画面開いてる時点で、もう負けてんだよ',
  ],
  // Tier 1 (S4-6): 業界の心理操作を笑う
  [
    '「限定」って書きゃ引くだろ？お前の心理、丸見えだわ',
    'ログボ切ったら罪悪感出るだろ。よくできた檻だよなぁ',
    '課金石、貯めてもガチャで消える。それが仕様。気づいてた？',
    '業界の手口に、よく付き合ってんなぁお前',
    '「あと 1 日で 7 日連続」、それで戻ってきたろ？単純すぎ',
    '無料って書いといて、最初の 1 連だけ無料な。詐欺寸前',
    'お前さ、ガチャの確率って 0.5% って意味わかってる？',
    '「SSR 確定」って書いてあって嬉しがるの、まじでチョロいよな',
    '「次の召喚で出るかも」って思ったら、もう負け確定',
    'ピックアップガチャって、ピックアップされてないキャラが出る仕様',
    '累計課金 ¥9,800 達成しました！って言われて、よく気づかねぇな金の感覚',
    '100 連無料って言いながら、その後の 200 連で財布開かせる手口',
    'ぼーっとログインしてんじゃねぇよ、人生終わるぞ',
    'お前のフレンド欄、半分死んでるだろ？復帰してこねぇぞあいつら',
  ],
  // Tier 2 (S7-9): 業界の搾取構造を直接攻撃
  [
    'VIP15 まで上げて何になんだよ？満たされたか？',
    '「お詫び石」で許しちまうの、お前ら本当チョロいな',
    'いま楽しいと思ってんの、それも仕様だぜ',
    '3 年で 847 日。よく飼われたな',
    '「無料 100 連」って、無料なの 1 連目だけだぞ',
    '集めた SSR、サ終で全部消える。覚えとけ',
    'ガチャの確率、ちゃんと読んでねぇだろ？読んでも理解できねぇし',
    'VIP3 て、課金額 5 万くらい？よく払ったな',
    'お前、嫁いるのか？このゲームと結婚してんじゃねぇだろうな',
    '3 年も続けたゲーム、サ終したらどうすんの？覚悟あんの？',
    'ストアレビュー★1 にした奴が正解だぜ、お前は★5 つけたんだろ？',
    '「ガチャは課金じゃない、宝くじ」って言い訳、何回したよ',
    'お前の課金額、月単位で計算したことあるか？怖くて出来ねぇだろ',
    '「推しのため」って言いながら、他のキャラも回ってるよな？w',
    '集めた SSR、全員レベル MAX？まあ MAX しなくていいか、サ終するし',
  ],
  // Tier 3 (S10 BOSS): 業界全否定、罵倒、メタ批判の頂点
  [
    'このゲーム閉じても、どうせ別のソシャゲ開くんだろ？',
    'お前が残したの、運営の売上だけだ',
    '「放置」って言葉よくできてんな。プレイヤーも放置されてんだよ、気づけ',
    '業界はお前の時間吸って生きてる。栄養になっただろ？',
    '「辞めたい」と思いながら 847 日。業界の完全勝利だわ',
    'ｱﾊｯ……気づいてた？このクソゲーも、業界の一部だよ',
    'お前の自由意志、最後にいつ働いた？覚えてねぇだろ',
    '売ってんのは「楽しさ」じゃねぇ。「離れられなさ」だ。バカが',
    'ガチャ引きたい？どうぞ。お前の人生、運営に貢ぎな',
    '気づいたか？お前、もうこのゲーム閉じる気ねぇだろ',
    '「楽しい」が「止められない」にすり替わったの、いつだよ',
    'お前の親、何ていうかな？このアプリの存在知ったら',
    'ガチャ天井 200 連、お前余裕で見たことあるよな、何回？',
    '人生で何時間ソシャゲに使った？計算したことあるか？w',
    '「辞めたい」って思ってるのに辞められない。それを業界では「成功」って言うんだよ',
    'お前みたいなのが業界を支えてる。誇れよ、奴隷の鏡だ',
    '次のゲーム、もう DL してんだろ？離れられねーんだよ、永遠に',
  ],
]

const tierForRound = (round: number): number => {
  if (round <= 3) return 0
  if (round <= 6) return 1
  if (round <= 9) return 2
  return 3
}

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
type DestroyablePrefix = 'sl' | 'sr' | 'fb' | 'b' | 'player' | 'curr' | 'gb' | 'fo' | 'kd'

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
  // S6: スワイプ解放（長期戦化、スワイプで連斬する気持ちよさを伸ばす）
  { label: 'STAGE 6',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'kd'], scorePerHit: 25, hardPhaseFromSec: 20, maintenanceSec: 35, targetHits: 45, activeBadgeMax: 0, obstacles: true,  stoneReward: 180 },
  // S7
  { label: 'STAGE 7',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'kd'], scorePerHit: 30, hardPhaseFromSec: 22, maintenanceSec: 38, targetHits: 50, activeBadgeMax: 0, obstacles: true,  stoneReward: 220 },
  // S8: 全 UI 破壊解放
  { label: 'STAGE 8',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'kd', 'player', 'curr', 'gb', 'fo'], scorePerHit: 35, hardPhaseFromSec: 24, maintenanceSec: 42, targetHits: 55, activeBadgeMax: 0, obstacles: true, stoneReward: 280 },
  // S9
  { label: 'STAGE 9',  swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'kd', 'player', 'curr', 'gb', 'fo'], scorePerHit: 45, hardPhaseFromSec: 28, maintenanceSec: 45, targetHits: 60, activeBadgeMax: 0, obstacles: true, stoneReward: 350 },
  // S10: 最終ボス（×1.5、永久輪廻の到達点）
  { label: 'FINAL BOSS', swipeEnabled: true,  destroyable: ['sl', 'sr', 'fb', 'b', 'kd', 'player', 'curr', 'gb', 'fo'], scorePerHit: 100, hardPhaseFromSec: 36, maintenanceSec: 60, targetHits: 90, activeBadgeMax: 0, obstacles: true, stoneReward: 1000 },
]

// S10 (FINAL BOSS) 判定用ヘルパー
const isFinalBoss = (stage: StageConfig): boolean => stage.label === 'FINAL BOSS'

const stageFor = (round: number): StageConfig =>
  STAGES[Math.min(round - 1, STAGES.length - 1)]

const prefixOf = (key: string): DestroyablePrefix | null => {
  if (key === 'player') return 'player'
  if (key === 'kaguya-dialog') return 'kd'
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

// 連打破壊バー（全 overlay で共通）
function ObstacleHpBar({ hits, required }: { hits: number; required: number }) {
  const pct = Math.min(100, (hits / required) * 100)
  return (
    <div className="obstacle-hp" aria-hidden="true">
      <div className="obstacle-hp-bar">
        <div className="obstacle-hp-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="obstacle-hp-text">連打で破壊！ {hits}/{required}</div>
    </div>
  )
}

type ObstacleProps = { onHit: () => void; hits: number; required: number }

// ===== お邪魔 1: NOW LOADING（連打で破壊可能） =====
function NowLoadingOverlay({ onHit, hits, required }: ObstacleProps) {
  const cracked = hits > required * 0.4
  const broken = hits > required * 0.75
  return (
    <div
      className={`now-loading-overlay obstacle-clickable ${cracked ? 'is-cracked' : ''} ${broken ? 'is-broken' : ''}`}
      onClick={onHit}
    >
      <div className="nl-spinner">⟳</div>
      <div className="nl-text">NOW LOADING...</div>
      <div className="nl-sub">サーバーと通信しています</div>
      <ObstacleHpBar hits={hits} required={required} />
    </div>
  )
}

// ===== お邪魔 2: 機能解放チュートリアル（連打で破壊可能） =====
function TutorialOverlay({ onHit, hits, required }: ObstacleProps) {
  const cracked = hits > required * 0.4
  const broken = hits > required * 0.75
  return (
    <div
      className={`tutorial-overlay obstacle-clickable ${cracked ? 'is-cracked' : ''} ${broken ? 'is-broken' : ''}`}
      onClick={onHit}
    >
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
        <ObstacleHpBar hits={hits} required={required} />
      </div>
    </div>
  )
}

// ===== お邪魔 4: ストア評価 ★5 おねがい（連打で破壊可能） =====
function RateAppOverlay({ onHit, hits, required }: ObstacleProps) {
  const cracked = hits > required * 0.4
  const broken = hits > required * 0.75
  // 連打数に応じて星が壊れていく演出
  const starsBroken = Math.min(5, Math.floor(hits / 4))
  return (
    <div
      className={`rate-modal obstacle-clickable ${cracked ? 'is-cracked' : ''} ${broken ? 'is-broken' : ''}`}
      onClick={onHit}
    >
      <div className="rate-content">
        <div className="rate-icon">⭐</div>
        <div className="rate-title">放置恋姫を評価してください</div>
        <div className="rate-sub">
          ご好評いただいております！
          <br />
          ストアでの評価が、運営の励みになります
        </div>
        <div className="rate-stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              className={`rate-star ${n > starsBroken ? 'rate-star-fill' : 'rate-star-broken'}`}
            >
              {n > starsBroken ? '★' : '☆'}
            </span>
          ))}
        </div>
        <div className="rate-stars-sub">★ 5 つで お詫び石 100 個プレゼント</div>
        <div className="rate-buttons">
          <button type="button" className="rate-btn rate-btn-primary">★5 で評価する</button>
          <button type="button" className="rate-btn rate-btn-cancel">後で（また聞きます）</button>
        </div>
        <ObstacleHpBar hits={hits} required={required} />
      </div>
    </div>
  )
}

// ===== お邪魔 5: 事前登録キャンペーン（連打で破壊可能） =====
function PreRegisterOverlay({ onHit, hits, required }: ObstacleProps) {
  const cracked = hits > required * 0.4
  const broken = hits > required * 0.75
  return (
    <div
      className={`prereg-modal obstacle-clickable ${cracked ? 'is-cracked' : ''} ${broken ? 'is-broken' : ''}`}
      onClick={onHit}
    >
      <div className="prereg-content">
        <div className="prereg-tag">PRE-REGISTRATION</div>
        <div className="prereg-title">超・放置恋姫</div>
        <div className="prereg-sub">〜永久に続く覚醒の輪廻 II〜</div>
        <div className="prereg-art">⚔️ 👑 🌙</div>
        <div className="prereg-counter">
          <div className="prereg-num">1,237,094 人</div>
          <div className="prereg-label">が事前登録済み！</div>
        </div>
        <div className="prereg-rewards">
          🎁 100 万人達成 ▸ SSR 確定 +5 連<br />
          🎁 200 万人達成 ▸ LR 神髄武将
        </div>
        <button type="button" className="prereg-btn">今すぐ事前登録（無料）</button>
        <div className="prereg-fine">※ 別アプリのインストールが必要です</div>
        <ObstacleHpBar hits={hits} required={required} />
      </div>
    </div>
  )
}

// ===== お邪魔 3: 一括 DL ポップアップ（連打で破壊可能） =====
function DownloadOverlay({ onHit, hits, required }: ObstacleProps) {
  const cracked = hits > required * 0.4
  const broken = hits > required * 0.75
  return (
    <div
      className={`download-modal obstacle-clickable ${cracked ? 'is-cracked' : ''} ${broken ? 'is-broken' : ''}`}
      onClick={onHit}
    >
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
        <ObstacleHpBar hits={hits} required={required} />
      </div>
    </div>
  )
}

// ===== スワイプ軌跡（Fruit Ninja 風刀筋） =====
// useRef + requestAnimationFrame で React 再 render を排除、指に張り付く反応速度
function SwipeTrail() {
  const outerRef = useRef<SVGPolylineElement | null>(null)
  const mainRef = useRef<SVGPolylineElement | null>(null)
  const pointsRef = useRef<Array<{ x: number; y: number; t: number }>>([])
  const draggingRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const render = () => {
      const now = performance.now()
      const live = pointsRef.current.filter((p) => now - p.t < 220)
      pointsRef.current = live
      const str = live.length >= 2 ? live.map((p) => `${p.x},${p.y}`).join(' ') : ''
      if (outerRef.current) outerRef.current.setAttribute('points', str)
      if (mainRef.current) mainRef.current.setAttribute('points', str)
      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)

    const onDown = (e: PointerEvent) => {
      draggingRef.current = true
      pointsRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }]
    }
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return
      pointsRef.current.push({ x: e.clientX, y: e.clientY, t: performance.now() })
      // 過去点をその場で間引く（古い点はどのみち render で消える）
      if (pointsRef.current.length > 64) pointsRef.current.shift()
    }
    const onUp = () => {
      draggingRef.current = false
    }

    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

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
      <polyline
        ref={outerRef}
        stroke="rgba(255, 200, 50, 0.45)"
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="blur(2px)"
      />
      <polyline
        ref={mainRef}
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
  icon: string
  text: string
}

// 業界アプリのトースト通知文言（現実の業界 UI に存在するもの）
const BADGE_LABELS: Record<BadgeType, { icon: string; text: string }[]> = {
  normal: [
    { icon: '📬', text: 'ﾌﾚﾝﾄﾞ申請' },
    { icon: '❤️', text: 'ｲｲﾈ +12' },
    { icon: '🎁', text: '未受取!' },
    { icon: '🏯', text: 'ｷﾞﾙﾄﾞ:5' },
    { icon: '🔔', text: '7日め!' },
    { icon: '✉️', text: '新規 ﾒｯｾｰｼﾞ' },
  ],
  critical: [
    { icon: '⏰', text: 'あと 23h!' },
    { icon: '⚡', text: '限定 47%OFF' },
    { icon: '🔥', text: '残 12 個!' },
    { icon: '💢', text: 'ｴﾗｰ発生' },
    { icon: '🌟', text: 'LR 降臨!' },
  ],
  apology: [
    { icon: '💎', text: 'お詫び 5,000' },
  ],
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
  isBoss,
}: {
  gameMode: GameMode
  muted: boolean
  unlocked: boolean
  isBoss: boolean
}) {
  const homeBgmRef = useRef<HTMLAudioElement | null>(null)
  const alertBgmRef = useRef<HTMLAudioElement | null>(null)
  const bossBgmRef = useRef<HTMLAudioElement | null>(null)

  // ミュート反映
  useEffect(() => {
    const home = homeBgmRef.current
    const alert = alertBgmRef.current
    const boss = bossBgmRef.current
    if (home) home.muted = muted
    if (alert) alert.muted = muted
    if (boss) boss.muted = muted
  }, [muted])

  useEffect(() => {
    if (!unlocked) return
    const home = homeBgmRef.current
    const alert = alertBgmRef.current
    const boss = bossBgmRef.current
    if (!home || !alert || !boss) return

    if (gameMode === 'idle' || gameMode === 'safe') {
      alert.pause()
      boss.pause()
      home.currentTime = 0
      home.volume = 0.45
      home.play().catch(() => {})
    } else if (gameMode === 'countdown') {
      home.pause()
      if (isBoss) {
        alert.pause()
        boss.currentTime = 0
        boss.volume = 0.6
        boss.play().catch(() => {})
      } else {
        boss.pause()
        alert.currentTime = 0
        alert.volume = 0.55
        alert.play().catch(() => {})
      }
    } else {
      home.pause()
      alert.pause()
      boss.pause()
    }
  }, [gameMode, unlocked, isBoss])

  return (
    <>
      <audio ref={homeBgmRef} src="/audio/home-bgm.mp3" loop preload="auto" />
      <audio ref={alertBgmRef} src="/audio/maintenance-bgm.mp3" loop preload="auto" />
      <audio ref={bossBgmRef} src="/audio/boss-bgm.mp3" loop preload="auto" />
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

// 直前と違う index をランダムに引く（プールが 1 なら同じが出る）
const pickDifferentIdx = (poolSize: number, prev: number): number => {
  if (poolSize <= 1) return 0
  let next = Math.floor(Math.random() * poolSize)
  if (next === prev) next = (next + 1) % poolSize
  return next
}

function KaguyaDialog({ gameMode, animState, round, onTap }: { gameMode: GameMode; animState?: IconAnimState; round: number; onTap?: () => void }) {
  const tier = tierForRound(round)
  // 善悪二人格: 緊急時は悪（業界ディス）、それ以外は善（親密度ストーリー + 我に返り + 機能解放）
  const isEvil = gameMode === 'countdown'
  const lines = isEvil
    ? KAGUYA_EVIL_LINES_BY_TIER[tier]
    : KAGUYA_GOOD_LINES_BY_TIER[tier]
  // 初回も毎ステージ進入時もランダム index で開始（同じセリフ連発で萎えるのを防ぐ）
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * lines.length))
  const [visible, setVisible] = useState(true)

  // gameMode / tier / round 変わったらランダム index リセット
  useEffect(() => {
    setIdx(Math.floor(Math.random() * lines.length))
    setVisible(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, tier, round])

  useEffect(() => {
    // 緊急時はセリフローテも速い
    const interval = isEvil ? 3500 : 5500
    const cycle = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIdx((i) => pickDifferentIdx(lines.length, i))
        setVisible(true)
      }, 400)
    }, interval)
    return () => clearInterval(cycle)
  }, [isEvil, lines.length])

  // 善悪で名札を切り替え
  const nameLabel = isEvil ? '???' : 'KAGUYA-X'

  return (
    <div
      className={`kaguya-dialog kd-tier-${tier} ${isEvil ? 'kd-evil' : 'kd-good'} ${visible ? '' : 'kd-hidden'} ${isEvil ? 'kd-emergency' : ''} ${animClassFor(animState)}`}
      data-icon-key="kaguya-dialog"
      onClick={onTap}
    >
      <div className="kd-bubble" data-kd-name={nameLabel}>
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
        className={`gacha-banner gb-main ${animClassFor(pickupState)}`}
        data-icon-key="gb-pickup"
        onClick={() => !countdownActive && onNavigate('gacha')}
      >
        <img src="/banners/gacha-main.png" alt="ガチャ召喚" className="gb-image" />
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
  shinzuiStone,
  setShinzuiStone,
}: {
  onNavigate: (s: Screen) => void
  onExit: () => void
  audioUnlocked?: boolean
  kaguyaBombs?: number
  consumeKaguyaBomb?: () => void
  visible?: boolean
  shinzuiStone: number
  setShinzuiStone: React.Dispatch<React.SetStateAction<number>>
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
  // shinzuiStone は App level から props で受け取る（GachaScreen と共有）
  const [activeItems, setActiveItems] = useState<Set<ItemId>>(new Set())
  // ショップ表示制御（safe 中は自動 open、それ以外は Footer のショップタップで open）
  const [shopOpen, setShopOpen] = useState(false)
  // 設定パネル（DEBUG ジャンプも兼ねる）
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 主公キャラ: KAGUYA-X / SAKURA-87 / サユリ / 水着 KAGUYA 4 人ローテ（フッター「武将」タップ）。countdown 中は敵 KAGUYA 固定
  // 将来: SAKURA = ガチャアンロック、kaguya-sw = ショップ交換でロック予定（今は全員選択可）
  type HeroId = 'kaguya' | 'sakura' | 'sayuri' | 'kaguya-sw'
  const [selectedHero, setSelectedHero] = useState<HeroId>('kaguya')
  const [heroSwitching, setHeroSwitching] = useState(false)
  // 武将タップ → 暗転 → 250ms 後にキャラ切替 → 600ms で暗転 fade out（合計 850ms 演出）
  const cycleHero = useCallback(() => {
    if (heroSwitching) return
    setHeroSwitching(true)
    setTimeout(() => {
      setSelectedHero((s) =>
        s === 'kaguya' ? 'sakura'
        : s === 'sakura' ? 'sayuri'
        : s === 'sayuri' ? 'kaguya-sw'
        : 'kaguya',
      )
    }, 250)
    setTimeout(() => setHeroSwitching(false), 850)
  }, [heroSwitching])

  const jumpToStage = (n: number) => {
    setSettingsOpen(false)
    setRound(n)
    setHitsThisRound(0)
    setShowAvoided(false)
    setActiveItems(new Set())
    setMaintenanceSeconds(STAGES[Math.min(n - 1, STAGES.length - 1)].maintenanceSec)
    setGameMode('countdown')
  }
  const badgeIdRef = useRef(0)

  const currentStage = stageFor(round)
  // アイテム reduceTarget が active なら必要タップ数 -3
  const targetHits = currentStage.targetHits - (activeItems.has('reduceTarget') ? 3 : 0)
  // アイテム scoreBoost が active ならスコア 1.5 倍
  const scoreMultiplier = activeItems.has('scoreBoost') ? 1.5 : 1

  const buyItem = (item: ItemDef) => {
    if (activeItems.has(item.id)) return
    if (shinzuiStone < item.cost) return
    setShinzuiStone((s) => s - item.cost)
    setActiveItems((prev) => new Set(prev).add(item.id))
  }

  // SE
  const playSwordSE = useSE('/audio/se-kaguya-slash.mp3', muted, 0.75) // KAGUYA スワイプ連撃（剣で斬る5）
  const playPunchSE = useSE('/audio/se-whack.mp3', muted, 0.65) // KAGUYA タップ斬撃（扇）
  // SAKURA 用 SE: サブマシンガン（爆発に負けないよう大きめ）
  const playSakuraGun1 = useSE('/audio/se-sakura-gun1.mp3', muted, 1.0) // タップ A
  const playSakuraBolt = useSE('/audio/se-sakura-bolt.mp3', muted, 1.0) // タップ B (ボルトリリース)
  const playSakuraGun2 = useSE('/audio/se-sakura-gun2.mp3', muted, 1.0) // スワイプ
  // サユリ 用 SE: 平手打ち（タップ・スワイプとも）
  const playSayuriSlap = useSE('/audio/se-sayuri-slap.mp3', muted, 0.95)
  // 水着 KAGUYA (SP Ver) 用 SE: 強い打撃 2 種ランダム + ボイス 5 種ランダム（最大音量）
  const playHitStrong1 = useSE('/audio/se-hit-strong-1.mp3', muted, 1.0)
  const playHitStrong3 = useSE('/audio/se-hit-strong-3.mp3', muted, 1.0)
  const playVoiceSwAtatte   = useSE('/audio/voice-kaguya-sw-atatte.mp3', muted, 1.0)
  const playVoiceSwEi       = useSE('/audio/voice-kaguya-sw-ei.mp3', muted, 1.0)
  const playVoiceSwMakasete = useSE('/audio/voice-kaguya-sw-makasete.mp3', muted, 1.0)
  const playVoiceSwYa       = useSE('/audio/voice-kaguya-sw-ya.mp3', muted, 1.0)
  const playVoiceSwArara    = useSE('/audio/voice-kaguya-sw-arara.mp3', muted, 1.0)
  const playKaguyaSwAttack = useCallback(() => {
    // 殴る音 2 種ランダム
    if (Math.random() < 0.5) playHitStrong1()
    else playHitStrong3()
    // 攻撃ボイス 5 種ランダム
    const r = Math.random()
    if (r < 0.2) playVoiceSwAtatte()
    else if (r < 0.4) playVoiceSwEi()
    else if (r < 0.6) playVoiceSwMakasete()
    else if (r < 0.8) playVoiceSwYa()
    else playVoiceSwArara()
  }, [playHitStrong1, playHitStrong3, playVoiceSwAtatte, playVoiceSwEi, playVoiceSwMakasete, playVoiceSwYa, playVoiceSwArara])
  // 主公キャラに応じて SE 切替。SAKURA はリロード音時に空振り（return false）
  const playHeroTapSE = useCallback((): boolean => {
    if (selectedHero === 'sakura') {
      // 18% でリロード（ボルトリリース） = 空振り
      if (Math.random() < 0.18) {
        playSakuraBolt()
        return false
      }
      playSakuraGun1()
      return true
    }
    if (selectedHero === 'sayuri') {
      playSayuriSlap()
      return true
    }
    if (selectedHero === 'kaguya-sw') {
      playKaguyaSwAttack()
      return true
    }
    playPunchSE()
    return true
  }, [selectedHero, playSakuraGun1, playSakuraBolt, playSayuriSlap, playKaguyaSwAttack, playPunchSE])
  const playHeroSlashSE = useCallback(() => {
    if (selectedHero === 'sakura') playSakuraGun2()
    else if (selectedHero === 'sayuri') playSayuriSlap()
    else if (selectedHero === 'kaguya-sw') playKaguyaSwAttack()
    else playSwordSE()
  }, [selectedHero, playSakuraGun2, playSayuriSlap, playKaguyaSwAttack, playSwordSE])
  const playAlarmSE = useSE('/audio/se-alarm.mp3', muted, 0.7)
  const playClearSE = useSE('/audio/se-clear.mp3', muted, 0.7)
  const playExplodeA = useSE('/audio/se-explode-3.mp3', muted, 0.10) // 爆発 A
  const playExplodeB = useSE('/audio/se-explode-4.mp3', muted, 0.10) // 爆発 B
  const playGlassBreak = useSE('/audio/se-glass-break.mp3', muted, 0.85) // お邪魔連打破壊
  const playGlassCrack = useSE('/audio/se-glass-crack.mp3', muted, 0.7)  // お邪魔タップ毎
  // 善 KAGUYA タップボイス（3 種ランダム）
  const playVoiceIki    = useSE('/audio/voice-kaguya-iki.mp3', muted, 0.9)
  const playVoiceGanba  = useSE('/audio/voice-kaguya-ganba.mp3', muted, 0.9)
  const playVoiceOtsuka = useSE('/audio/voice-kaguya-otukare.mp3', muted, 0.9)
  const playKaguyaVoice = useCallback(() => {
    const r = Math.random()
    if (r < 0.34) playVoiceIki()
    else if (r < 0.67) playVoiceGanba()
    else playVoiceOtsuka()
  }, [playVoiceIki, playVoiceGanba, playVoiceOtsuka])
  // SAKURA-87 ボイス（内向きでちょっと不安げ）
  const playVoiceSakuraYoroshiku = useSE('/audio/voice-sakura-yoroshiku.mp3', muted, 0.9)
  const playVoiceSakuraKokoro    = useSE('/audio/voice-sakura-kokoro.mp3', muted, 0.9)
  const playVoiceSakuraTsuyoso   = useSE('/audio/voice-sakura-tsuyoso.mp3', muted, 0.9)
  // サユリ ボイス（お嬢様口調、ツンデレ）
  const playVoiceSayuriYoroshiku = useSE('/audio/voice-sayuri-yoroshiku.mp3', muted, 0.9)
  const playVoiceSayuriDekisou   = useSE('/audio/voice-sayuri-dekisou.mp3', muted, 0.9)
  const playVoiceSayuriAmai      = useSE('/audio/voice-sayuri-amai.mp3', muted, 0.9)
  // 主公キャラ別ボイス（バトル抜け時 + 善 KAGUYA Dialog タップ時に発火）
  const playHeroVoice = useCallback(() => {
    const r = Math.random()
    if (selectedHero === 'sakura') {
      if (r < 0.34) playVoiceSakuraYoroshiku()
      else if (r < 0.67) playVoiceSakuraKokoro()
      else playVoiceSakuraTsuyoso()
    } else if (selectedHero === 'sayuri') {
      if (r < 0.34) playVoiceSayuriYoroshiku()
      else if (r < 0.67) playVoiceSayuriDekisou()
      else playVoiceSayuriAmai()
    } else {
      if (r < 0.34) playVoiceIki()
      else if (r < 0.67) playVoiceGanba()
      else playVoiceOtsuka()
    }
  }, [
    selectedHero,
    playVoiceIki, playVoiceGanba, playVoiceOtsuka,
    playVoiceSakuraYoroshiku, playVoiceSakuraKokoro, playVoiceSakuraTsuyoso,
    playVoiceSayuriYoroshiku, playVoiceSayuriDekisou, playVoiceSayuriAmai,
  ])
  // BOSS 出現時のキメ台詞「軽くひねってあげましょう」
  const playVoiceBossIntro = useSE('/audio/voice-kaguya-boss-intro.mp3', muted, 1.0)
  const playExplode = useCallback(() => {
    if (Math.random() < 0.5) playExplodeA()
    else playExplodeB()
  }, [playExplodeA, playExplodeB])
  // sweep 中フラグ（ref）
  const swipeActiveRef = useRef(false)
  // 最後のポインタ座標（+N ポップアップ用）
  const lastPointerPosRef = useRef({ x: 0, y: 0 })

  // コンボシステム
  const [combo, setCombo] = useState(0)
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const comboMultiplier = (c: number): number => {
    if (c >= 20) return 5
    if (c >= 10) return 3
    if (c >= 5) return 2
    return 1
  }
  const incCombo = () => {
    setCombo((c) => c + 1)
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
    comboTimerRef.current = setTimeout(() => setCombo(0), 1300)
  }
  const resetCombo = () => {
    setCombo(0)
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current)
  }

  // +N ポップアップ
  type FloatText = { id: number; x: number; y: number; text: string; color: string; crit: boolean }
  const [floatingTexts, setFloatingTexts] = useState<FloatText[]>([])
  const floatingIdRef = useRef(0)
  const addFloatingText = (x: number, y: number, text: string, color = '#ffd700', crit = false) => {
    const id = ++floatingIdRef.current
    setFloatingTexts((prev) => {
      const next = [...prev, { id, x, y, text, color, crit }]
      // 同時表示は 10 個まで、超えたら古いのから捨てる（DOM 数を抑える）
      if (next.length > 10) next.shift()
      return next
    })
    setTimeout(() => {
      setFloatingTexts((prev) => prev.filter((t) => t.id !== id))
    }, 900)
  }

  // ヒットエフェクト: 白フラッシュ + カメラシェイク
  const [hitFlash, setHitFlash] = useState(0)
  const [hitShake, setHitShake] = useState(0)
  // 連続ヒット間引き用（70ms 以内の連発はスキップ）
  const lastHitFxRef = useRef(0)
  const triggerHitFx = (crit = false) => {
    const now = performance.now()
    if (now - lastHitFxRef.current > 70) {
      setHitFlash((n) => n + 1)
      setHitShake((n) => n + 1)
      lastHitFxRef.current = now
    }
    if ('vibrate' in navigator) navigator.vibrate(crit ? 30 : 12)
  }

  // hitShake → home-screen へ class 一瞬付与（カメラシェイク）
  useEffect(() => {
    if (hitShake === 0) return
    const el = document.querySelector('.home-screen') as HTMLElement | null
    if (!el) return
    el.classList.remove('shake-hit')
    void el.offsetWidth // reflow で animation 再起動
    el.classList.add('shake-hit')
    const t = setTimeout(() => el.classList.remove('shake-hit'), 140)
    return () => clearTimeout(t)
  }, [hitShake])

  // ボス戦中: home-screen に is-boss-mode class（全要素ふわふわ） =
  useEffect(() => {
    const el = document.querySelector('.home-screen') as HTMLElement | null
    if (!el) return
    if (isFinalBoss(currentStage) && gameMode === 'countdown') {
      el.classList.add('is-boss-mode')
    } else {
      el.classList.remove('is-boss-mode')
    }
    return () => { el.classList.remove('is-boss-mode') }
  }, [currentStage, gameMode])

  // gameMode 切替時の SE 発火 + 暗転トランジション + 警告演出 + バイブ
  const prevGameModeRef = useRef(gameMode)
  const [battleTransition, setBattleTransition] = useState(false)
  const [warning, setWarning] = useState(false)
  useEffect(() => {
    const prev = prevGameModeRef.current
    if (prev !== gameMode) {
      if (gameMode === 'countdown') {
        playAlarmSE()
        setBattleTransition(true)
        setWarning(true)
        // 粉砕の瞬間にガラス割れ SE を重ねて聴覚的にも統一
        setTimeout(() => playGlassBreak(), 580)
        setTimeout(() => setBattleTransition(false), 950)
        setTimeout(() => setWarning(false), 2400)
        // FINAL BOSS 入場時: ベッキー声「軽くひねってあげましょう」を遅延再生（暗転後）
        if (isFinalBoss(currentStage)) {
          setTimeout(() => playVoiceBossIntro(), 800)
        }
        // モバイル振動: 警告パターン
        if ('vibrate' in navigator) {
          navigator.vibrate([120, 60, 120, 60, 240])
        }
      }
      if (gameMode === 'safe') {
        playClearSE()
        // バトル抜け時に主公キャラのボイス（KAGUYA / SAKURA / サユリ で 3 種ランダム）
        setTimeout(() => playHeroVoice(), 700)
      }
    }
    prevGameModeRef.current = gameMode
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // アイテム extendTime が active ならメンテ +5 秒
        const baseSec = currentStage.maintenanceSec + (activeItems.has('extendTime') ? 5 : 0)
        setMaintenanceSeconds(baseSec)
        setHitsThisRound(activeItems.has('startBonus') ? 5 : 0)
        setGameMode('countdown')
        // 1 ラウンド使い切り
        setActiveItems(new Set())
      }, delay)
      return () => clearTimeout(timer)
    }
    if (gameMode === 'safe') {
      const delay =
        SAFE_DURATION_MIN_MS +
        Math.random() * (SAFE_DURATION_MAX_MS - SAFE_DURATION_MIN_MS)
      const timer = setTimeout(() => {
        const baseSec = currentStage.maintenanceSec + (activeItems.has('extendTime') ? 5 : 0)
        setMaintenanceSeconds(baseSec)
        setHitsThisRound(activeItems.has('startBonus') ? 5 : 0)
        setGameMode('countdown')
        setActiveItems(new Set())
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

  // ===== お邪魔要素（NOW LOADING / チュートリアル / 一括 DL / ログボ / ★5 / 事前登録） =====
  type Obstacle = 'loading' | 'tutorial' | 'download' | 'login-bonus' | 'rate-app' | 'pre-register'

  // 連打破壊の必要回数（login-bonus は既存仕様のまま、対象外）
  const OBSTACLE_HP: Partial<Record<Obstacle, number>> = {
    loading: 8,
    tutorial: 8,
    download: 12,
    'rate-app': 20,
    'pre-register': 15,
  }

// ===== アイテム（インターバル中に購入、次ラウンドで効果発動） =====
type ItemId = 'extendTime' | 'reduceTarget' | 'scoreBoost' | 'startBonus'

type ItemDef = { id: ItemId; name: string; desc: string; cost: number; icon: string }

const ITEMS: ItemDef[] = [
  { id: 'extendTime',   name: 'メンテ +5 秒',  desc: '次戦のメンテ時間 +5 秒',     cost: 100, icon: '⏰' },
  { id: 'reduceTarget', name: '目標 -3',       desc: '次戦の必要タップ数 -3',     cost: 150, icon: '🎯' },
  { id: 'startBonus',   name: '開始時 +5 タップ済み', desc: '次戦開始時に hits +5', cost: 200, icon: '⚡' },
  { id: 'scoreBoost',   name: 'スコア×1.5',    desc: '次戦のスコア倍率',           cost: 250, icon: '🚀' },
]
  const [obstacle, setObstacle] = useState<Obstacle | null>(null)
  const [obstacleHits, setObstacleHits] = useState(0)

  // obstacle 切替で連打カウンタリセット
  useEffect(() => { setObstacleHits(0) }, [obstacle])

  // お邪魔を連打して破壊
  const hitObstacle = () => {
    if (!obstacle) return
    const required = OBSTACLE_HP[obstacle]
    if (required === undefined) return // login-bonus は対象外
    playGlassCrack() // ガラスにヒビが入る音
    triggerHitFx(false)
    setObstacleHits((h) => {
      const next = h + 1
      if (next >= required) {
        // 破壊成功: ガラス破壊 SE + 爆発 SE 重畳
        playGlassBreak()
        playExplode()
        triggerHitFx(true)
        setShinzuiStone((s) => s + 20) // ご褒美
        setHits((hh) => hh + 1)
        setHitsThisRound((hh) => hh + 1)
        setObstacle(null)
        return 0
      }
      return next
    })
  }

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
        // 確率分布: loading 22% / tutorial 18% / download 15% / login 15% / rate 15% / prereg 15%
        const next: Obstacle =
          r < 0.22 ? 'loading'
          : r < 0.40 ? 'tutorial'
          : r < 0.55 ? 'download'
          : r < 0.70 ? 'login-bonus'
          : r < 0.85 ? 'rate-app'
          : 'pre-register'
        setObstacle(next)
        const duration =
          next === 'loading' ? 1800
          : next === 'tutorial' ? 2800
          : next === 'download' ? 3500
          : next === 'login-bonus' ? 6000
          : next === 'rate-app' ? 4200
          : 4500 // pre-register
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
        const label = pickRandom(BADGE_LABELS[type])
        // 画面中央 30% を避けて端寄りに配置（中央は KAGUYA に重ならない・浮き感を抑える）
        const edgeBiasX = Math.random() < 0.5
          ? 4 + Math.random() * 30   // 左帯
          : 66 + Math.random() * 30  // 右帯
        const edgeBiasY = 12 + Math.random() * 72
        return [
          ...prev,
          {
            id: ++badgeIdRef.current,
            x: edgeBiasX,
            y: edgeBiasY,
            hp,
            type,
            spawnedAt: Date.now(),
            icon: label.icon,
            text: label.text,
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

  // KAGUYA を叩いた時のペナルティ
  const penalizeKaguya = () => {
    resetCombo()
    setHitsThisRound((h) => Math.max(0, h - 1))
    playAlarmSE()
    if ('vibrate' in navigator) navigator.vibrate(300)
    const { x, y } = lastPointerPosRef.current
    addFloatingText(x, y, '主公！', '#ff4040')
  }

  const whackIconBadge = (key: string) => {
    if (iconState[key]) return // すでに消えてる or アニメ中
    // KAGUYA は叩くとペナルティ
    if (key === 'kaguya') {
      penalizeKaguya()
      return
    }
    // 善 KAGUYA メッセージウィンドウタップ → 主公ボイスランダム再生（破壊処理は続行）
    if (key === 'kaguya-dialog' && gameMode !== 'countdown') {
      playHeroVoice()
    }
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
    // SE: 斬撃 or タップ + 爆発（両方鳴らして派手に、キャラで音切替）
    if (swipeActiveRef.current) {
      playHeroSlashSE()
    } else {
      // リロード音は空振り（破壊しない）
      if (!playHeroTapSE()) return
    }
    playExplode()
    // コンボ + 倍率スコア + アイテム scoreBoost
    incCombo()
    const mult = comboMultiplier(combo + 1)
    const earned = Math.round(currentStage.scorePerHit * mult * scoreMultiplier)
    setScore((s) => s + earned)
    setHits((h) => h + 1)
    setHitsThisRound((h) => h + 1)
    // +N ポップアップ + ヒットエフェクト
    const { x, y } = lastPointerPosRef.current
    const isCrit = mult > 1
    addFloatingText(x, y, isCrit ? `×${mult} +${earned}` : `+${earned}`, isCrit ? '#ffd700' : '#fff', isCrit)
    triggerHitFx(isCrit)

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

  // safe 中は自動でショップ open、countdown 開始で close
  useEffect(() => {
    if (gameMode === 'safe') setShopOpen(true)
    if (gameMode === 'countdown') setShopOpen(false)
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
      else if (round === 10) msg = { icon: '👹', title: 'FINAL BOSS 出現', sub: 'KAGUYA-X 真の姿 — 永久輪廻の到達点' }
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
      lastPointerPosRef.current = { x, y }
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
      // 全 UI 要素を破壊対象（PlayerInfo / 通貨 / GachaBanner / floating-offer / アイコン / KAGUYA）
      const key = target.dataset.iconKey
      if (key && !sweptKeys.has(key)) {
        sweptKeys.add(key)
        whackIconBadge(key)
      }
    }

    // sweep は requestAnimationFrame で 1 frame 1 回まで（重い elementFromPoint 抑制）
    let pendingX = -1
    let pendingY = -1
    let rafId: number | null = null
    const scheduleSweep = (x: number, y: number) => {
      pendingX = x
      pendingY = y
      if (rafId != null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        if (pendingX >= 0) sweep(pendingX, pendingY)
      })
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
        scheduleSweep(initialX, initialY)
      }
      if (swipeActiveRef.current) {
        scheduleSweep(e.clientX, e.clientY)
      }
    }
    const onUp = (e: PointerEvent) => {
      // タップ単独（移動なし）の場合、その位置を sweep（タップ判定、即時実行）
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
      if (rafId != null) cancelAnimationFrame(rafId)
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
      playHeroSlashSE()
    } else {
      // リロード音は空振り（破壊しない）
      if (!playHeroTapSE()) return
    }
    playExplode()
    setBadges((prev) => {
      const target = prev.find((b) => b.id === id)
      if (!target) return prev
      const newHp = target.hp - 1
      if (newHp <= 0) {
        // ランダムバッジは critical / apology はスコア倍率を維持しつつ stage 基準
        const baseScore = currentStage.scorePerHit
        const typeMult =
          target.type === 'critical' ? 1.5
          : target.type === 'apology' ? 2.5
          : 1
        // コンボ加算 + アイテム scoreBoost
        incCombo()
        const comboMult = comboMultiplier(combo + 1)
        const points = Math.round(baseScore * typeMult * comboMult * scoreMultiplier)
        setScore((s) => s + points)
        setHits((h) => h + 1)
        setHitsThisRound((h) => h + 1)
        const { x, y } = lastPointerPosRef.current
        const isCrit = comboMult > 1 || target.type === 'apology'
        addFloatingText(x, y, comboMult > 1 ? `×${comboMult} +${points}` : `+${points}`, comboMult > 1 ? '#ffd700' : '#fff', isCrit)
        triggerHitFx(isCrit)
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
      <BGMPlayer
        gameMode={gameMode}
        muted={muted}
        unlocked={audioUnlocked}
        isBoss={isFinalBoss(currentStage)}
      />

      {/* countdown ヘッダー（visible に関係なく常時表示、ガチャ画面の上にも被さる） */}
      {gameMode === 'countdown' && !visible && (
        <MaintenanceCountdown seconds={maintenanceSeconds} />
      )}

      <div
        className="home-content"
        style={{ display: visible ? 'contents' : 'none' }}
      >

      {/* キャラ背景（Luma 生成 動画ループ）。countdown 中は battle 動画に切替（敵は KAGUYA 固定）*/}
      <video
        key={
          gameMode === 'countdown'
            ? (isFinalBoss(currentStage) ? 'boss' : 'battle')
            : `idle-${selectedHero}`
        }
        className={`character-bg ${gameMode === 'countdown' ? 'character-bg-emergency' : ''} ${gameMode === 'countdown' && isFinalBoss(currentStage) ? 'character-bg-boss' : ''}`}
        src={
          gameMode === 'countdown'
            ? (isFinalBoss(currentStage) ? '/heroes/kaguya-boss.mp4' : '/heroes/kaguya-x-battle.mp4')
            : (
              selectedHero === 'kaguya' ? '/heroes/kaguya-x.mp4'
              : selectedHero === 'sakura' ? '/heroes/sakura-87.mp4'
              : selectedHero === 'sayuri' ? '/heroes/sayuri.mp4'
              : '/heroes/kaguya-swimsuit.mp4'
            )
        }
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        data-icon-key="kaguya"
      />

      {/* 主公キャラ切替の暗転オーバーレイ（武将タップ瞬間にフェードイン） */}
      {heroSwitching && <div className="hero-switch-overlay" aria-hidden="true" />}

      {/* 暗転トランジション（countdown 開始時） */}
      {battleTransition && <div className="battle-transition" aria-hidden="true" />}

      {/* WARNING バナー（黄黒ストライプ + ⚠ WARNING ⚠） */}
      {warning && (
        <div className="warning-banner" aria-hidden="true">
          <div className="warning-banner-content">⚠ WARNING ⚠</div>
        </div>
      )}

      {/* コンボ表示（5 連続以上） */}
      {combo >= 5 && gameMode === 'countdown' && (
        <div className="combo-display" key={combo}>
          <span className="combo-x">×</span>
          <span className="combo-value">{comboMultiplier(combo)}</span>
          <span className="combo-label">{combo} COMBO</span>
        </div>
      )}

      {/* +N ポップアップ（タップ位置から浮上） */}
      {floatingTexts.map((t) => (
        <div
          key={t.id}
          className={`floating-text ${t.crit ? 'floating-text-crit' : ''}`}
          style={{ left: t.x, top: t.y, color: t.color }}
        >
          {t.text}
        </div>
      ))}

      {/* ヒットフラッシュ（white flash full-screen, key 増分で再発火） */}
      {hitFlash > 0 && <div key={`hf-${hitFlash}`} className="hit-flash" aria-hidden="true" />}

      {/* 画面縁光エフェクト（叩いた時に四辺が光る、hit-flash と同期） */}
      {hitFlash > 0 && <div key={`he-${hitFlash}`} className="hit-edge-glow" aria-hidden="true" />}

      {/* 未読 99+ バッジ（画面右上で常時点滅、叩いても減らない業界の精神攻撃） */}
      {currentStage.obstacles && (
        <div className="unread-badge" aria-hidden="true">
          <span className="unread-icon">📬</span>
          <span className="unread-count">99+</span>
        </div>
      )}

      {/* 緊急メンテ赤 vignette overlay（点滅） */}
      {gameMode === 'countdown' && (
        <div className="emergency-overlay" aria-hidden="true" />
      )}

      {/* 画面全体明滅 overlay: WARNING 表示中だけ */}
      {warning && (
        <div className={`fullscreen-blink ${isFinalBoss(currentStage) ? 'fullscreen-blink-boss' : ''}`} aria-hidden="true" />
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
          {gameMode === 'safe' && (
            <span className="header-round-prep">R{round} 準備中…</span>
          )}
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
              <span className="wb-icon">{b.icon}</span>
              <span className="wb-text">{b.text}</span>
              <span className="wb-dot" aria-hidden="true" />
            </button>
          ))}
        </>
      )}

      {/* 設定パネル（DEBUG ステージジャンプ含む） */}
      {settingsOpen && (
        <div className="shop-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="shop-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="shop-close"
              onClick={() => setSettingsOpen(false)}
              aria-label="閉じる"
            >✕</button>
            <div className="shop-title">⚙ 設定</div>
            <div className="shop-sub">DEBUG: ステージジャンプ</div>
            <div className="settings-jump-grid">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`settings-jump-btn ${n === 10 ? 'settings-jump-boss' : ''}`}
                  onClick={() => jumpToStage(n)}
                >
                  {n === 10 ? '👹 BOSS' : `S${n}`}
                </button>
              ))}
            </div>
            <div className="shop-tip">タップで指定ステージから即開始</div>
            <button
              type="button"
              className="settings-exit-btn"
              onClick={() => { setSettingsOpen(false); onExit() }}
            >
              ✕ ゲーム終了（タイトルへ戻る）
            </button>
          </div>
        </div>
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

      {/* safe 中の予兆表示はヘッダー currency-bar 末尾に統合済み */}

      {/* ショップ overlay（Footer ショップタップ or safe 中で表示） */}
      {shopOpen && (
        <div className="shop-overlay" onClick={() => setShopOpen(false)}>
          <div className="shop-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="shop-close"
              onClick={() => setShopOpen(false)}
              aria-label="閉じる"
            >✕</button>
            <div className="shop-title">⏱ 次戦準備</div>
            <div className="shop-sub">アイテムを購入して次のラウンドに備える</div>
            <div className="shop-stones">所持: ✨ {shinzuiStone}</div>
            <div className="shop-items">
              {ITEMS.map((item) => {
                const owned = activeItems.has(item.id)
                const canBuy = !owned && shinzuiStone >= item.cost
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`shop-item ${owned ? 'shop-owned' : canBuy ? '' : 'shop-locked'}`}
                    onClick={() => buyItem(item)}
                    disabled={owned || !canBuy}
                  >
                    <div className="shop-icon">{item.icon}</div>
                    <div className="shop-text">
                      <div className="shop-name">{item.name}</div>
                      <div className="shop-desc">{item.desc}</div>
                    </div>
                    <div className="shop-cost">
                      {owned ? '✓ 装備中' : `✨ ${item.cost}`}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="shop-tip">
              {gameMode === 'safe' ? '時間切れで自動的に次戦開始' : '緊急メンテ前に準備しよう'}
            </div>
          </div>
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
      </aside>

      <FloatingOffer iconState={iconState} />
      <HeroCharacter />
      <KaguyaDialog
        gameMode={gameMode}
        animState={iconState['kaguya-dialog']}
        round={round}
        onTap={gameMode !== 'countdown' ? playHeroVoice : undefined}
      />
      <GachaBanners
        onNavigate={onNavigate}
        pickupState={iconState['gb-pickup']}
        shinzuiState={iconState['gb-shinzui']}
        countdownActive={gameMode === 'countdown'}
      />
      {gameMode === 'countdown' && <SwipeTrail />}

      {/* お邪魔要素（連打で破壊可能） */}
      {obstacle === 'loading' && (
        <NowLoadingOverlay onHit={hitObstacle} hits={obstacleHits} required={OBSTACLE_HP.loading!} />
      )}
      {obstacle === 'tutorial' && (
        <TutorialOverlay onHit={hitObstacle} hits={obstacleHits} required={OBSTACLE_HP.tutorial!} />
      )}
      {obstacle === 'download' && (
        <DownloadOverlay onHit={hitObstacle} hits={obstacleHits} required={OBSTACLE_HP.download!} />
      )}
      {obstacle === 'rate-app' && (
        <RateAppOverlay onHit={hitObstacle} hits={obstacleHits} required={OBSTACLE_HP['rate-app']!} />
      )}
      {obstacle === 'pre-register' && (
        <PreRegisterOverlay onHit={hitObstacle} hits={obstacleHits} required={OBSTACLE_HP['pre-register']!} />
      )}
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
                } else if (label === 'ショップ') {
                  setShopOpen(true)
                } else if (label === '設定') {
                  setSettingsOpen(true)
                } else if (label === '武将') {
                  // 暗転 → キャラ切替 → fade out（cycleHero 内で制御）
                  cycleHero()
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
  shinzuiStone,
  setShinzuiStone,
  kaguyaFreeUsed,
  markKaguyaFreeUsed,
}: {
  onBack: () => void
  inFlow?: boolean
  onAdvance?: () => void
  addKaguyaBomb?: () => void
  shinzuiStone: number
  setShinzuiStone: React.Dispatch<React.SetStateAction<number>>
  kaguyaFreeUsed: boolean
  markKaguyaFreeUsed: () => void
}) {
  const [seconds, setSeconds] = useState(23 * 3600 + 47 * 60 + 18)
  const [pity, setPity] = useState(153)
  const [summoning, setSummoning] = useState(false)
  const [results, setResults] = useState<{ name: string; rarity: Rarity }[] | null>(null)
  const [confirmExit, setConfirmExit] = useState(false)
  const shinzui = shinzuiStone

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  // ガチャ コスト: 1 連 40 / 10 連 300。KAGUYA 10 連は初回のみ無料。
  type BannerKey = 'kaguya' | 'sakura'
  const calcCost = (banner: BannerKey, count: 1 | 10): number => {
    if (banner === 'kaguya' && count === 10 && !kaguyaFreeUsed) return 0
    return count === 1 ? 40 : 300
  }

  const summon = (banner: BannerKey, count: 1 | 10) => {
    if (summoning) return
    const cost = calcCost(banner, count)
    if (shinzuiStone < cost) {
      // 神髄石が足りない: 何もしない（ボタン disabled で防いでいるが念のため）
      return
    }
    // コスト消費 + KAGUYA 初回無料消化
    if (cost > 0) setShinzuiStone((s) => s - cost)
    if (banner === 'kaguya' && count === 10 && !kaguyaFreeUsed) markKaguyaFreeUsed()

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

      {/* ガチャ第 1 弾: 月華の姫 KAGUYA-X */}
      <div className="gacha-hero">
        <img
          src="/banners/kaguya-banner.png"
          alt="月華の姫 KAGUYA-X LR 召喚祭"
          className="gh-banner"
        />
      </div>

      <div className="pity">
        <div className="pity-label">天井確定まで <strong>{200 - pity}</strong> 連</div>
        <div className="pity-bar">
          <div className="pity-fill" style={{ width: `${(pity / 200) * 100}%` }} />
        </div>
      </div>

      <div className="summon-row">
        <button
          type="button"
          className="summon-button single"
          onClick={() => summon('kaguya', 1)}
          disabled={summoning || shinzuiStone < calcCost('kaguya', 1)}
        >
          <div className="summon-label">1 連 召喚</div>
          <div className="summon-cost">✨ {calcCost('kaguya', 1)}</div>
        </button>
        <button
          type="button"
          className="summon-button ten"
          onClick={() => summon('kaguya', 10)}
          disabled={summoning || shinzuiStone < calcCost('kaguya', 10)}
        >
          <div className="summon-flash" />
          <div className="summon-label">💎 10 連 召喚</div>
          <div className="summon-cost">
            {kaguyaFreeUsed ? `✨ 300` : '🎁 初回無料！'}
          </div>
          <div className="summon-tag">{kaguyaFreeUsed ? 'SR 以上 1 体確定' : '初回限定！'}</div>
        </button>
      </div>

      {/* ガチャ第 2 弾: 機桜の姫 SAKURA-87（UR） */}
      <div className="gacha-hero gacha-hero-2">
        <img
          src="/banners/sakura-banner.png"
          alt="機桜の姫 SAKURA-87 UR 召喚祭"
          className="gh-banner"
        />
      </div>

      <div className="summon-row">
        <button
          type="button"
          className="summon-button single"
          onClick={() => summon('sakura', 1)}
          disabled={summoning || shinzuiStone < calcCost('sakura', 1)}
        >
          <div className="summon-label">1 連 召喚</div>
          <div className="summon-cost">✨ {calcCost('sakura', 1)}</div>
        </button>
        <button
          type="button"
          className="summon-button ten ur"
          onClick={() => summon('sakura', 10)}
          disabled={summoning || shinzuiStone < calcCost('sakura', 10)}
        >
          <div className="summon-flash" />
          <div className="summon-label">⚡ 10 連 召喚</div>
          <div className="summon-cost">✨ {calcCost('sakura', 10)}</div>
          <div className="summon-tag">UR 確率 5% UP</div>
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

  // 神髄石（黄色石）— App level に持ち上げて HomeScreen / GachaScreen で共有
  const [shinzuiStone, setShinzuiStone] = useState(0)
  // KAGUYA 初回 10 連無料の使用済みフラグ（localStorage 永続化）
  const [kaguyaFreeUsed, setKaguyaFreeUsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem('let-me-out-kaguya-free-used') === '1'
  })
  const markKaguyaFreeUsed = () => {
    setKaguyaFreeUsed(true)
    localStorage.setItem('let-me-out-kaguya-free-used', '1')
  }

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
      '/audio/se-glass-break.mp3',
      '/audio/se-glass-crack.mp3',
      '/audio/voice-kaguya-iki.mp3',
      '/audio/voice-kaguya-ganba.mp3',
      '/audio/voice-kaguya-otukare.mp3',
      '/audio/voice-kaguya-boss-intro.mp3',
      '/audio/se-sakura-gun1.mp3',
      '/audio/se-sakura-bolt.mp3',
      '/audio/se-sakura-gun2.mp3',
      '/audio/se-kaguya-slash.mp3',
      '/audio/se-sayuri-slap.mp3',
      '/audio/voice-sakura-yoroshiku.mp3',
      '/audio/voice-sakura-kokoro.mp3',
      '/audio/voice-sakura-tsuyoso.mp3',
      '/audio/voice-sayuri-yoroshiku.mp3',
      '/audio/voice-sayuri-dekisou.mp3',
      '/audio/voice-sayuri-amai.mp3',
      '/audio/voice-kaguya-sw-atatte.mp3',
      '/audio/voice-kaguya-sw-ei.mp3',
      '/audio/voice-kaguya-sw-makasete.mp3',
      '/audio/voice-kaguya-sw-ya.mp3',
      '/audio/voice-kaguya-sw-arara.mp3',
      '/audio/se-hit-strong-1.mp3',
      '/audio/se-hit-strong-3.mp3',
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
            shinzuiStone={shinzuiStone}
            setShinzuiStone={setShinzuiStone}
          />
        )}
        {screen === 'gacha' && (
          <GachaScreen
            onBack={() => setScreen('home')}
            addKaguyaBomb={addKaguyaBomb}
            shinzuiStone={shinzuiStone}
            setShinzuiStone={setShinzuiStone}
            kaguyaFreeUsed={kaguyaFreeUsed}
            markKaguyaFreeUsed={markKaguyaFreeUsed}
          />
        )}
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
            shinzuiStone={shinzuiStone}
            setShinzuiStone={setShinzuiStone}
            kaguyaFreeUsed={kaguyaFreeUsed}
            markKaguyaFreeUsed={markKaguyaFreeUsed}
          />
        )}
        {screen === 'layer4' && <Layer4Screen onAdvance={() => setScreen('layer5')} onBlock={onBlock} addStones={addStones} />}
        {screen === 'layer5' && <Layer5Screen onAdvance={() => setScreen('free')} onBlock={onBlock} addStones={addStones} />}
        {screen === 'free' && <FreeScreen stats={stats} onRestart={restart} />}
      </div>
    </div>
  )
}
