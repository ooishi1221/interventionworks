import IPhoneFrame from './IPhoneFrame'

export default function CoreValues() {
  const values = [
    {
      num: '01',
      label: 'FOOTPRINT',
      headline: '停めたらメモる。それだけでいい。',
      body: 'グローブしたまま写真1枚。住所は自動。停めた場所が地図にそっと刻まれる。報告じゃない。自分のメモだ。',
      screenshot: '/images/ss-detail.png',
      alt: 'スポット詳細画面',
    },
    {
      num: '02',
      label: 'WARMTH',
      headline: '誰かがさっきここにいた。',
      body: 'ライダーが停めた場所はピンが赤く脈打つ。時間が経てば冷めていく。温かいピンは「最近ここに仲間がいた」という証。見えない誰かの体温がこの地図には残っている。',
      screenshot: '/images/ss-map.png',
      alt: 'マップ画面',
    },
    {
      num: '03',
      label: 'ALTRUISM',
      headline: '自分のメモが誰かの安心になる。',
      body: '「次に来るときのために」残したメモが知らない誰かを救っている。貢献しようなんて思わなくていい。ただ自分のために残すだけで それが利他になる。',
      screenshot: '/images/ss-report.png',
      alt: '記録画面',
    },
  ]

  return (
    <section className="section core-values-alt">
      <div className="container">
        <h2 className="section-title reveal">
          評価もランクも競争もない。<br />
          あるのは<span className="accent">足跡</span>だけ。
        </h2>
        <div className="cv-list">
          {values.map((v, i) => (
            <div
              className={`cv-row reveal ${i % 2 === 1 ? 'cv-row-reverse' : ''}`}
              key={i}
              style={{ transitionDelay: `${i * 0.1}s` }}
            >
              <div className="cv-phone">
                <IPhoneFrame src={v.screenshot} alt={v.alt} />
              </div>
              <div className="cv-text">
                <span className="cv-num">{v.num}</span>
                <span className="cv-label">{v.label}</span>
                <h3>{v.headline}</h3>
                <p>{v.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
