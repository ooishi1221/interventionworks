export default function Social() {
  const testimonials = [
    {
      name: 'タカシ',
      bike: 'CB400SF',
      emoji: '🏍️',
      stars: 5,
      quote: '都内ツーリングで毎回「停める場所どこ？」ってなってた。このアプリ入れてからストレスが消えた。自分が追加したスポットに「助かった」って反応が来ると嬉しい。',
    },
    {
      name: 'ユウキ',
      bike: 'PCX160',
      emoji: '🙌',
      stars: 5,
      quote: '原付二種だと停められる場所が限られるから、排気量フィルターが神。大型不可の場所も事前に分かるのが本当にありがたい。',
    },
    {
      name: 'サトミ',
      bike: 'Ninja 400',
      emoji: '😎',
      stars: 4,
      quote: '鮮度バッジが秀逸。青バッジのスポットは安心して向かえる。赤いのは避けるか、自分で確認して更新する。ゲーム感覚で楽しい。',
    },
    {
      name: 'ケンジ',
      bike: 'BOLT',
      emoji: '🔧',
      stars: 5,
      quote: '他のアプリは情報が古すぎて使い物にならなかった。ここはライダーが毎日更新してるから、信頼できる。仲間がいる感じがいい。',
    },
  ]

  return (
    <section className="section testimonials">
      <div className="container">
        <h2 className="section-title">ライダーの声</h2>
        <div className="testimonial-grid">
          {testimonials.map((t) => (
            <div className="testimonial-card" key={t.name}>
              <div className="testimonial-header">
                <span className="testimonial-avatar">{t.emoji}</span>
                <div>
                  <div className="testimonial-name">{t.name}</div>
                  <div className="testimonial-bike">{t.bike}</div>
                </div>
                <div className="testimonial-stars">
                  {'★'.repeat(t.stars)}{'☆'.repeat(5 - t.stars)}
                </div>
              </div>
              <p className="testimonial-quote">{t.quote}</p>
            </div>
          ))}
        </div>

        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-number">1,247</div>
            <div className="stat-label">共有済みスポット</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">312</div>
            <div className="stat-label">今週の更新</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">89%</div>
            <div className="stat-label">鮮度30日以内</div>
          </div>
        </div>
      </div>
    </section>
  )
}
