import BetaForm from './BetaForm'
import HeroIntro from './HeroIntro'
import IPhoneFrame from './IPhoneFrame'

export default function Hero() {
  return (
    <>
      <HeroIntro />
      <div className="hero-wrapper hero-wrapper-revealed">
        <div className="hero-bg" aria-hidden="true"></div>
        <section className="hero">
          <div className="hero-content">
            <h1>
              写真1枚で<span className="accent">足跡を刻め。</span>
            </h1>
            <p className="hero-sub">
              ワンショットが足跡になる。<br />
              足跡が誰かの地図になる。
            </p>
            <div className="hero-form-row">
              <BetaForm compact />
              <div className="beta-badge">CLOSED BETA — 東京限定・先行100名</div>
            </div>
          </div>
          <div className="hero-mockup mockup-float">
            <IPhoneFrame src="/images/app-screenshot.png" alt="Moto-Logos マップ画面" />
          </div>
          <div className="hero-scroll">&#x25BE;</div>
        </section>
      </div>
    </>
  )
}
