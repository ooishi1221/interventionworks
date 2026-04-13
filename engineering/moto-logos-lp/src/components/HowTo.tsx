export default function HowTo() {
  const steps = [
    {
      num: '1',
      title: 'アプリをダウンロード',
      text: 'App Store / Google Play から無料でインストール。アカウント登録不要ですぐ使える。',
    },
    {
      num: '2',
      title: 'ガイドツアーで体験',
      text: '探す・報告する・登録する。全部の操作をチュートリアルで体験。誰でもすぐに使いこなせる。',
    },
    {
      num: '3',
      title: '走り出す',
      text: 'あとは走るだけ。停めたら報告、困ったら検索。あなたの一報がマップに命を灯す。',
    },
  ]

  return (
    <section className="section howto surface-bg">
      <div className="container">
        <h2 className="section-title">はじめての方も安心。</h2>
        <p className="section-sub">
          アプリを開くと、インタラクティブなガイドツアーが始まります。<br />
          実際に画面をタップしながら操作を覚えられるので、誰でもすぐに使えます。
        </p>
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
