import { useState } from 'react'

const faqData = [
  {
    q: '本当に無料ですか？',
    a: 'はい、完全無料です。広告もありません。ライダーのためのアプリなので、課金要素は一切ありません。',
  },
  {
    q: 'データは正確ですか？',
    a: 'すべてのスポットには「鮮度バッジ」が付いており、いつ誰が確認したかが透明です。ライダーの報告が集まるほど、データの正確性は向上していきます。',
  },
  {
    q: 'どのバイクでも使えますか？',
    a: '原付から大型まで、すべてのバイクに対応しています。排気量フィルター機能で、自分のバイクが停められるスポットだけを表示できます。',
  },
  {
    q: '自分でスポットを追加できますか？',
    a: 'もちろんです。マップ上で場所を選んで情報を入力するだけ。あなたの発見が、次に走る仲間の助けになります。',
  },
  {
    q: 'オフラインでも使えますか？',
    a: '一度表示したエリアはオフラインキャッシュに保存されるので、電波の悪い場所でも直前に見た情報は表示されます。',
  },
]

export default function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="section faq">
      <div className="container">
        <h2 className="section-title">よくある質問</h2>
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
