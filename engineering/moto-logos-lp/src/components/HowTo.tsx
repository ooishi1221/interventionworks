const steps = [
  {
    num: '01',
    label: 'STEP / 申込',
    title: 'メールアドレスを置いていけ。',
    body: '下のフォームから登録。OS（iOS / Android）を選択するだけ。30秒で完了。',
  },
  {
    num: '02',
    label: 'STEP / 招待',
    title: '招待リンクが届く。',
    body: 'βテスト開始時、登録順に招待。TestFlight / Firebase App Distribution 経由でインストール。',
  },
  {
    num: '03',
    label: 'STEP / 撮影',
    title: '最初のワンショットを刻め。',
    body: 'アプリを開いて、撮るだけ。地図上に最初の足跡が現れる。',
  },
]

export default function HowTo() {
  return (
    <section className="section">
      <div className="container">
        <div className="section-head">
          <div className="section-tag">
            <span className="num-label">FIELD NOTE — №&nbsp;007</span>
            <span className="index">HOW</span>
            <span className="num-label">HOW TO JOIN</span>
          </div>
          <div>
            <h2 className="section-title reveal">
              参加の<span className="accent">手続き</span>。
            </h2>
            <p className="section-lede reveal">
              3ステップ。所要1分。すべて無料。
            </p>
          </div>
        </div>

        <div className="howto-grid">
          {steps.map((s) => (
            <div key={s.num} className="howto-step reveal">
              <span className="step-num">{s.num}</span>
              <div className="step-label">{s.label}</div>
              <div className="step-title">{s.title}</div>
              <div className="step-body">{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
