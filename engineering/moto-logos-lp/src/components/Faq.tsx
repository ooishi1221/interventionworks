import { useState } from 'react'

const faqData = [
  {
    q: '無料ですか？',
    a: 'はい、完全無料です。広告もありません。',
  },
  {
    q: 'Google Mapsとの違いは？',
    a: 'Google Mapsは車のための地図です。Moto-Logosはライダーが残した足跡でできた地図。データの正確さではなく「最近ここにバイク乗りがいた」という体温のある情報が特徴です。',
  },
  {
    q: '「メモ」って何をするの？',
    a: '駐輪場に停めたら、写真を1枚撮るだけ。住所は自動取得。グローブしたままでも大丈夫です。あなたのメモが、地図にそっと刻まれます。',
  },
  {
    q: '鮮度バッジって？',
    a: 'すべてのスポットに付いている、情報の「いつ」を示すバッジです。青は最近ライダーが確認済み、黄色はやや前、赤はしばらく誰も来ていない場所。データの鮮度が一目でわかります。',
  },
  {
    q: '自分の投稿が誰かの役に立ったか分かる？',
    a: 'はい。「あなたのメモ、47人に届きました」のように、あなたの足跡がどれだけの仲間に届いたかが見えます。',
  },
  {
    q: '使い方がわからないのですが？',
    a: '初回起動時にガイドツアーが始まります。実際の画面をタップしながら操作を体験できるので、どなたでもすぐに使えます。',
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
