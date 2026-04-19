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
      icon: '📸',
      title: 'ワンショットで足跡を刻む',
      text: '写真1枚撮るだけ。AIが判別して地図に足跡が刻まれる。',
    },
  ]

  return (
    <section className="section howto">
      <div className="container">
        <h2 className="section-title reveal"><span className="accent">クローズドβテスト</span>の参加方法</h2>
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
