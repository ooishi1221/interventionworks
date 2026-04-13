import { useState } from 'react'

const faqData = [
  {
    q: '本当に無料ですか？',
    a: 'はい、完全無料です。広告もありません。ライダーのためのアプリなので、課金要素は一切ありません。',
  },
  {
    q: 'データは正確ですか？',
    a: 'すべてのスポットには「鮮度バッジ」が付いており、最後にライダーが確認した日時が一目でわかります。報告が集まるほど正確性が向上します。',
  },
  {
    q: 'どのバイクでも使えますか？',
    a: '原付から大型まで、すべてのバイクに対応しています。排気量フィルターで、自分のバイクが停められるスポットだけを表示できます。',
  },
  {
    q: '自分でスポットを追加できますか？',
    a: 'もちろんです。カメラボタンで写真を撮るだけ。住所は自動取得されるので、グローブしたままでも登録できます。',
  },
  {
    q: 'オフラインでも使えますか？',
    a: '一度表示したエリアはオフラインキャッシュに保存されるので、電波の悪い場所でも直前に見た情報は表示されます。',
  },
  {
    q: '使い方がわからないのですが？',
    a: '初回起動時にインタラクティブなガイドツアーが始まります。実際の画面をタップしながら操作を体験できるので、どなたでもすぐに使いこなせます。設定画面からいつでも再開できます。',
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
