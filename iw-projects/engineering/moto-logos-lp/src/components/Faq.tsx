import { useState } from 'react'

const faqs = [
  {
    q: 'βテストはいつから？',
    a: '2026年Q2を予定。準備が整い次第、登録順に招待リンクをお送りします。',
  },
  {
    q: '料金は？',
    a: 'βテスト期間中は無償です。本リリース時の料金は未定ですが、βテスターには優遇措置を予定しています。',
  },
  {
    q: 'iOS / Android 両方対応？',
    a: 'はい。TestFlight（iOS）と Firebase App Distribution（Android）の両方で配布予定。登録時に選択してください。',
  },
  {
    q: '個人情報の扱いは？',
    a: 'βテスト招待のみに使用します。第三者提供は一切ありません。テスト終了後はオプトアウト可能。',
  },
  {
    q: '対応エリアは？',
    a: '初期は首都圏（東京・神奈川・千葉・埼玉）から。順次、大阪・名古屋・福岡へ拡張予定。',
  },
  {
    q: '撮った写真は公開される？',
    a: '公開されるのは「位置」「気配」「概況」のみ。写真自体は自分のノートに残ります。',
  },
]

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div className="section-tag">
            <span className="num-label">FIELD NOTE — №&nbsp;008</span>
            <span className="index">FAQ</span>
            <span className="num-label">FREQUENTLY ASKED</span>
          </div>
          <div>
            <h2 className="section-title reveal">
              想定された<span className="accent">疑問</span>。
            </h2>
          </div>
        </div>

        <div className="faq-list">
          {faqs.map((item, i) => {
            const num = `Q.${String(i + 1).padStart(2, '0')}`
            const open = openIndex === i
            return (
              <div
                key={i}
                className={`faq-item ${open ? 'open' : ''}`}
                onClick={() => setOpenIndex(open ? null : i)}
              >
                <div className="faq-q">
                  <span className="q-num">{num}</span>
                  <span>{item.q}</span>
                  <span className="toggle">+</span>
                </div>
                <div className="faq-a">{item.a}</div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
