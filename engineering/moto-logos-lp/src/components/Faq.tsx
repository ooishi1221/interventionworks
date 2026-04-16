import { useState } from 'react'

const faqData = [
  {
    q: '費用はかかりますか？',
    a: 'βテスト期間中は無償です。',
  },
  {
    q: 'TestFlightって何ですか？',
    a: 'Appleが提供する公式のテスト配布サービスです。App Storeからインストールでき通常のアプリと同じように使えます。テスト期間が終わればそのまま正式版に移行します。',
  },
  {
    q: 'Androidでも参加できますか？',
    a: 'はい。Google Play内部テストで配布します。招待リンクからインストールするだけで通常のアプリと同じように使えます。',
  },
  {
    q: 'β期間はいつまでですか？',
    a: '正式リリースまで継続します。テスト中のフィードバックがそのまま次のアップデートに反映されます。',
  },
  {
    q: '関東以外のエリアでも使えますか？',
    a: 'βテストはまず関東エリアに集中しています。データ密度を上げてから順次エリアを拡大する予定です。',
  },
  {
    q: '個人情報の取り扱いは？',
    a: 'メールアドレスはβテストの招待送信のみに使用します。第三者への提供は一切ありません。',
  },
]

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="section faq">
      <div className="container">
        <h2 className="section-title reveal">よくある質問</h2>
        <div className="faq-list">
          {faqData.map((item, i) => (
            <div key={i} className="faq-item">
              <button
                className="faq-question"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
              >
                {item.q}
                <span className={`faq-toggle ${openIndex === i ? 'open' : ''}`}>+</span>
              </button>
              {openIndex === i && (
                <div className="faq-answer">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
