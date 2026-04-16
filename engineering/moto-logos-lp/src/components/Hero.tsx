import { useEffect, useState } from 'react'
import BetaForm from './BetaForm'
import HeroIntro from './HeroIntro'
import IPhoneFrame from './IPhoneFrame'

export default function Hero() {
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1200)
    return () => clearTimeout(t)
  }, [])

  return (
    <>
      <HeroIntro />
      <div className={`hero-wrapper ${revealed ? 'hero-wrapper-revealed' : 'hero-wrapper-hidden'}`}>
        <div className="hero-bg" aria-hidden="true"></div>
        <section className={`hero ${revealed ? 'hero-revealed' : 'hero-hidden'}`}>
          <div className="hero-content">
            <h1 className="hero-stagger" style={{ transitionDelay: '0s' }}>
              俺たちは<span className="accent">ここにいる。</span>
            </h1>
            <p className="hero-sub hero-stagger" style={{ transitionDelay: '0.2s' }}>
              ライダーの足跡でできた地図を<br />
              一緒につくらないか。
            </p>
            <div className="hero-stagger hero-form-row" style={{ transitionDelay: '0.4s' }}>
              <BetaForm compact />
              <div className="beta-badge">CLOSED BETA — 関東限定・先行100名</div>
            </div>
          </div>
          <div className="hero-mockup hero-stagger mockup-float" style={{ transitionDelay: '0.4s' }}>
            <IPhoneFrame src="/images/app-screenshot.png" alt="Moto-Logos マップ画面" />
          </div>
          <div className="hero-scroll hero-stagger" style={{ transitionDelay: '0.6s' }}>&#x25BE;</div>
        </section>
      </div>
    </>
  )
}
