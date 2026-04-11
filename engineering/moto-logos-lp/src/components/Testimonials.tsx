export default function Testimonials() {
  const reviews = [
    {
      name: 'タカシ',
      bike: 'CB400SF',
      emoji: '\uD83C\uDFCD\uFE0F',
      stars: 5,
      text: '都内ツーリングで毎回「停める場所どこ？」ってなってた。このアプリ入れてからストレスが消えた。しかも自分が追加したスポットに「助かった」って反応が来ると嬉しい。',
    },
    {
      name: 'ユウキ',
      bike: 'PCX160',
      emoji: '\uD83D\uDE4C',
      stars: 5,
      text: '原付二種だと停められる場所が限られるから、排気量フィルターが神。大型不可の場所も事前に分かるのが本当にありがたい。',
    },
    {
      name: 'サトミ',
      bike: 'Ninja 400',
      emoji: '\uD83D\uDE0E',
      stars: 4,
      text: '鮮度バッジが秀逸。青バッジのスポットは安心して向かえる。赤いのは避けるか、自分で確認して更新する。ゲーム感覚で楽しい。',
    },
    {
      name: 'ケンジ',
      bike: 'BOLT',
      emoji: '\uD83D\uDD27',
      stars: 5,
      text: '他のアプリは情報が古すぎて使い物にならなかった。ここはライダーが毎日更新してるから、信頼できる。仲間がいる感じがいい。',
    },
  ]

  return (
    <section className="section testimonials">
      <div className="container">
        <h2 className="section-title">ライダーの声</h2>
        <div className="testimonial-grid">
          {reviews.map((r, i) => (
            <div key={i} className="testimonial-card">
              <div className="testimonial-header">
                <div className="testimonial-avatar">{r.emoji}</div>
                <div>
                  <div className="testimonial-name">{r.name}</div>
                  <div className="testimonial-bike">{r.bike}</div>
                </div>
              </div>
              <div className="testimonial-stars">
                {'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}
              </div>
              <p className="testimonial-text">{r.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
