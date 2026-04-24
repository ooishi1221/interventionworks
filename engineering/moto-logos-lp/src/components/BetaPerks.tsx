const perks = [
  {
    num: '01',
    label: 'FIRST FOOTPRINT',
    title: '最初のライダーになれる権利。',
    body: (
      <>
        誰よりも早く地図に自分の足跡を残せる。<br />
        あとから来る数千人がその足跡を踏む。
      </>
    ),
  },
  {
    num: '02',
    label: 'DIRECT LINE',
    title: '開発に直接介入できる回線。',
    body: (
      <>
        フィードバックが次のアップデートになる。<br />
        βテスターのチャンネルは開発者と直結。
      </>
    ),
  },
  {
    num: '03',
    label: 'WARM UP THE MAP',
    title: '空白の地図に気配を刻む権利。',
    body: (
      <>
        1,300件のスポットがまだ無音のままだ。<br />
        最初のワンショットで地図に気配を灯す。
      </>
    ),
  },
]

export default function BetaPerks() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div className="section-tag">
            <span className="num-label">FIELD NOTE — №&nbsp;006</span>
            <span className="index">BETA</span>
            <span className="num-label">FOR EARLY RIDERS</span>
          </div>
          <div>
            <h2 className="section-title reveal">
              最初に地図に<br /><span className="accent">足跡を残す</span>者へ。
            </h2>
            <p className="section-lede reveal">
              βテスター3つの特権。1,300件のスポットがまだ匿名のまま、最初の足跡を待っている。
            </p>
          </div>
        </div>

        <div className="index-list">
          {perks.map((p) => (
            <div key={p.num} className="index-row reveal">
              <span className="ix-num">{p.num}</span>
              <div className="ix-title">
                <span className="label">{p.label}</span>
                {p.title}
              </div>
              <div className="ix-body">{p.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
