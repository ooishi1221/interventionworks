export default function CoreValues() {
  const values = [
    {
      icon: '👣',
      title: '足跡を残す',
      headline: '停めたら、メモる。それだけでいい。',
      body: 'グローブしたまま、写真1枚。住所は自動。あなたが停めた場所が、地図にそっと刻まれる。報告じゃない。自分のメモだ。',
    },
    {
      icon: '🌡',
      title: '仲間の気配',
      headline: '誰かが、さっきここにいた。',
      body: '鮮度バッジが教えてくれるのは、データの正確さじゃない。「最近、ここにバイク乗りがいたよ」という体温。見えない仲間の気配が、この地図にはある。',
    },
    {
      icon: '🔄',
      title: '自分のためが、誰かのために',
      headline: '自分のメモが、誰かの安心になる。',
      body: '「自分が次に来るときのために」残したメモが、知らない誰かを救っている。貢献しようなんて思わなくていい。ただ自分のために残すだけで、それが利他になる。',
    },
  ]

  return (
    <section className="section values-section">
      <div className="container">
        <h2 className="section-title">
          評価も、ランクも、競争もない。<br />
          あるのは<span className="accent">足跡</span>だけ。
        </h2>
        <div className="values-grid">
          {values.map((v, i) => (
            <div className="value-card" key={i}>
              <div className="value-card-icon">{v.icon}</div>
              <div className="value-card-label">{v.title}</div>
              <h3>{v.headline}</h3>
              <p>{v.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
