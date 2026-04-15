export default function HowTo() {
  const steps = [
    {
      num: '1',
      title: 'アプリを入れる',
      text: '無料。アカウント登録なしで、すぐ使える。',
    },
    {
      num: '2',
      title: '地図を見る',
      text: 'ライダーたちの足跡が、そこにある。温かいピンほど、最近仲間がいた場所。',
    },
    {
      num: '3',
      title: '自分のメモを残す',
      text: '停めたら写真1枚。それが誰かの安心になる。',
    },
  ]

  return (
    <section className="section howto">
      <div className="container">
        <h2 className="section-title">はじめかた</h2>
        <div className="howto-steps">
          {steps.map((s) => (
            <div key={s.num} className="howto-step">
              <div className="step-number">{s.num}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
