export default function BetaPerks() {
  const perks = [
    {
      label: 'FIRST FOOTPRINT',
      headline: '誰よりも早く地図に足跡を残せる。',
      body: 'まだ足跡はほとんどない。最初の100人のライダーとしてこの地図の最初のページを刻む。',
    },
    {
      label: 'DIRECT LINE',
      headline: 'フィードバックが次のアップデートになる。',
      body: 'βテスターの声は開発チームに直結。「こうしてほしい」がそのまま形になる。一般リリース後には得られない距離感。',
    },
    {
      label: 'WARM UP THE MAP',
      headline: '1,300件のスポットが足跡を待っている。',
      body: '公式データと警察ガイドから集めた東京のバイク駐車場。データはある。あとはライダーのワンショットで鮮度を灯すだけだ。',
    },
  ]

  return (
    <section className="section values-section">
      <div className="container">
        <h2 className="section-title reveal">
          βテスターだけの<span className="accent">特権。</span>
        </h2>
        <div className="values-grid">
          {perks.map((v, i) => (
            <div className="value-card reveal" key={i} style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="value-card-label">{v.label}</div>
              <h3>{v.headline}</h3>
              <p>{v.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
