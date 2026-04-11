import { useState } from 'react'

function FreshnessDemo() {
  const [days, setDays] = useState(0)

  const getColor = () => {
    if (days <= 30) return { bg: 'rgba(10, 132, 255, 0.15)', border: 'var(--fresh-blue)', color: 'var(--fresh-blue)', icon: '\u2713', label: '最新' }
    if (days <= 90) return { bg: 'rgba(255, 159, 10, 0.15)', border: 'var(--fresh-yellow)', color: 'var(--fresh-yellow)', icon: '!', label: '確認推奨' }
    return { bg: 'rgba(255, 69, 58, 0.15)', border: 'var(--fresh-red)', color: 'var(--fresh-red)', icon: '\u26A0', label: '要注意' }
  }

  const s = getColor()
  const displayDays = days === 0 ? 'たった今' : days < 30 ? `${days}日前` : days < 365 ? `${Math.floor(days / 30)}ヶ月前` : `${Math.floor(days / 365)}年前`

  return (
    <div className="freshness-demo">
      <div
        className="freshness-badge"
        style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }}
      >
        <span>{s.icon}</span>
        <span>{s.label} — {displayDays}</span>
      </div>
      <input
        type="range"
        className="freshness-slider"
        min={0}
        max={1095}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
      />
      <span className="freshness-label">
        {days >= 1000 ? 'この情報、信じますか？' : 'スライドで時間経過をシミュレート'}
      </span>
    </div>
  )
}

export default function CoreValues() {
  return (
    <section className="section values">
      <div className="container">
        <h2 className="section-title">ライダーが、ライダーのためにつくった。</h2>

        <div className="value-block">
          <div className="value-visual">
            グローブ操作デモ動画（後日差し替え）
          </div>
          <div className="value-text">
            <h3>グローブのまま、0.5秒で報告。</h3>
            <p>
              信号待ちの数秒で、駐輪場の「今」を共有できる。
              親指1本のラジアルメニュー。グローブを外す手間は、もういらない。
            </p>
          </div>
        </div>

        <div className="value-block">
          <div className="value-visual">
            <FreshnessDemo />
          </div>
          <div className="value-text">
            <h3>データに賞味期限がある。一目で分かる。</h3>
            <p>
              すべてのスポットに「鮮度バッジ」。
              青は直近30日、黄色は1-3ヶ月、赤は3ヶ月以上未確認。
              その情報がいつのものか、もう迷わない。
            </p>
          </div>
        </div>

        <div className="value-block">
          <div className="value-visual">
            マップ増殖アニメーション（後日差し替え）
          </div>
          <div className="value-text">
            <h3>走れば走るほど、地図が育つ。</h3>
            <p>
              あなたが見つけたスポットが地図に刻まれ、次に走るライダーの道しるべになる。
              使うだけじゃない。つくるアプリ。
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
