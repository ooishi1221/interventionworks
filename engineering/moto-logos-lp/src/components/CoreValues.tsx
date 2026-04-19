import IPhoneFrame from './IPhoneFrame'

export default function CoreValues() {
  const values = [
    {
      num: '01',
      label: 'ONE SHOT',
      headline: '撮るだけ。それが足跡になる。',
      body: 'グローブしたまま写真1枚。AIが場所もカテゴリも判別する。ライダーは分類しない。撮るだけでいい。それだけで地図に足跡が刻まれる。',
      screenshot: '/images/ss-detail.png',
      alt: 'スポット詳細画面',
    },
    {
      num: '02',
      label: 'FRESHNESS',
      headline: '情報は鮮度で語る。',
      body: '最近ライダーが立ち寄った場所は鮮やかに光る。時間が経てば霞んでいく。鮮度が高い場所ほど信頼できる。誰かの足跡がそのまま情報の鮮度になる。',
      screenshot: '/images/ss-map.png',
      alt: 'マップ画面',
    },
    {
      num: '03',
      label: 'ALTRUISM',
      headline: '自分の1枚が誰かの安心になる。',
      body: '到着して撮った1枚が知らない誰かを救っている。貢献しようなんて思わなくていい。自分のために撮るだけでいい。',
      screenshot: '/images/ss-report.png',
      alt: '記録画面',
    },
  ]

  return (
    <section className="section core-values-alt">
      <div className="container">
        <h2 className="section-title reveal">
          評価もランクも競争もない。<br />
          あるのは<span className="accent">ワンショット</span>だけ。
        </h2>
        <div className="cv-list">
          {values.map((v, i) => (
            <div
              className={`cv-row reveal ${i % 2 === 1 ? 'cv-row-reverse' : ''}`}
              key={i}
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
