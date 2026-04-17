export default function HowTo() {
  const steps = [
    {
      num: '1',
      icon: '✉️',
      title: 'メールで申し込む',
      text: 'このページからメアドを登録するだけ。30秒で完了。',
    },
    {
      num: '2',
      icon: '📲',
      title: '招待が届く',
      text: 'TestFlight（iOS）またはGoogle Play内部テストのリンクをメールでお届け。',
    },
    {
      num: '3',
      icon: '👣',
      title: '地図に足跡を残す',
      text: '関東のライダーと一緒に最初の地図をつくろう。',
    },
  ]

  return (
    <section className="section howto">
      <div className="container">
        <h2 className="section-title reveal">参加のしかた</h2>
        <div className="howto-steps">
          {steps.map((s, i) => (
            <div key={s.num} className="howto-step reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
              <div className="step-icon-wrap">
                <div className="step-number">{s.num}</div>
                <div className="step-icon">{s.icon}</div>
              </div>
              {i < steps.length - 1 && <div className="step-connector" aria-hidden="true"></div>}
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
