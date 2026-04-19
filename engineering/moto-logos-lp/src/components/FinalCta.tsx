import BetaForm from './BetaForm'

export default function FinalCta() {
  return (
    <section className="final-cta">
      <h2 className="reveal">
        この地図の<br /><span className="accent">最初のライダーになれ。</span>
      </h2>
      <p className="reveal">1,300件のスポットが最初のワンショットを待っている。</p>
      <div className="reveal">
        <BetaForm />
      </div>
    </section>
  )
}
