const values = [
  {
    num: '01',
    note: 'FIELD NOTE — № 003 / RITUAL',
    caption: 'SS — №01 / DETAIL VIEW',
    headline: (
      <>
        撮るだけ。<br />
        それが<span className="accent">セレモニー</span>になる。
      </>
    ),
    body: (
      <>
        到着して、写真1枚。それだけ。グローブをしたまま、片手で。
        分類も評価も入力もいらない。AI が裏で全部やる。
        <br /><br />
        やったのは「停めた」じゃない。「足跡を刻んだ」だ。
      </>
    ),
    image: '/images/ss-detail.png',
  },
  {
    num: '02',
    note: 'FIELD NOTE — № 004 / TRACE',
    caption: 'SS — №02 / MAP VIEW',
    headline: (
      <>
        気配。<br />
        <span className="accent">3日前の足跡</span>は、まだ生きてる。
      </>
    ),
    body: (
      <>
        「今日」「3日前」「先週」。地図のピンには時間が刻まれている。
        古い情報は静かに薄れ、新しい足跡が地図を更新する。
        <br /><br />
        誰かのワンショットが、今夜走る道のヒントになる。
      </>
    ),
    image: '/images/ss-map.png',
  },
  {
    num: '03',
    note: 'FIELD NOTE — № 005 / ALTRUISM',
    caption: 'SS — №03 / PROFILE VIEW',
    headline: (
      <>
        自分のために撮る。<br />
        それが<span className="accent">誰かの地図</span>になる。
      </>
    ),
    body: (
      <>
        報告じゃない。貢献じゃない。ランクもない。星もない。
        ただ、自分のノートに残った1枚が、どこかの誰かの今夜を救う。
        <br /><br />
        利己が利他になる。設計された偶然。
      </>
    ),
    image: '/images/ss-report.png',
  },
]

export default function CoreValues() {
  return (
    <>
      {values.map((v, i) => (
        <section key={v.num} className={`value-page ${i % 2 === 1 ? 'flip' : ''}`}>
          <div className="container">
            <div className="vp-text">
              <div className="vp-meta reveal">{v.note}</div>
              <span className="vp-index reveal">{v.num}</span>
              <h2 className="vp-title reveal">{v.headline}</h2>
              <p className="vp-body reveal">{v.body}</p>
            </div>
            <div className="vp-image" data-caption={v.caption}>
              <span className="vp-image-corner tl" aria-hidden="true"></span>
              <span className="vp-image-corner br" aria-hidden="true"></span>
              <img src={v.image} alt="" />
            </div>
          </div>
        </section>
      ))}
    </>
  )
}
