import BetaForm from './BetaForm'

export default function FinalCta() {
  return (
    <section className="final-cta">
      <h2 className="reveal">
        この地図の<br /><span className="accent">最初のライダーになれ。</span>
      </h2>
      <p className="reveal">足跡を待っているスポットがある。</p>
      <div className="reveal">
        <BetaForm />
      </div>
    </section>
  )
}
