import BetaForm from './BetaForm'

export default function FinalCta() {
  return (
    <section className="final">
      <div className="final-bg" aria-hidden="true"></div>
      <div className="container">
        <div className="field-note reveal">
          <span className="rule"></span>
          <span>FIELD NOTE — №&nbsp;009 / ENLISTMENT</span>
        </div>
        <h2 className="final-headline reveal">
          この地図の<br />
          <span className="accent">最初のライダー</span>になれ。
        </h2>
        <p className="hero-sub reveal" style={{ marginTop: '32px' }}>
          1,300件のスポットが、最初のワンショットを待っている。<br />
          メールアドレスだけ。30秒で完了。
        </p>

        <div className="reveal">
          <BetaForm />
        </div>
      </div>
    </section>
  )
}
