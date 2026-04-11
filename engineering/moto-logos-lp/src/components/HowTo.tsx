export default function HowTo() {
  const steps = [
    {
      num: '1',
      title: 'アプリをダウンロード',
      text: 'App Store / Google Play から無料でインストール。アカウント登録不要ですぐ使える。',
    },
    {
      num: '2',
      title: 'マップを開く',
      text: '現在地周辺のバイク駐輪場がマップ上に表示。鮮度バッジで情報の新しさが一目瞭然。',
    },
    {
      num: '3',
      title: '親指一本で貢献',
      text: '「停められた」「閉鎖されてた」をワンタップで報告。あなたの一瞬が、仲間を救う。',
    },
  ]

  return (
    <section className="section howto">
      <div className="container">
        <h2 className="section-title">使い方は、シンプル。</h2>
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
