import HeroIntro from './HeroIntro'

export default function Hero() {
  return (
    <>
      <HeroIntro />
      <div className="hero-wrapper">
        <section className="hero">
          <svg className="contour" viewBox="0 0 1920 280" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0,240 Q480,180 960,210 T1920,200" stroke="#FF6B00" strokeWidth="1" fill="none" />
            <path d="M0,200 Q480,140 960,170 T1920,160" stroke="#B8431F" strokeWidth="0.6" fill="none" />
            <path d="M0,160 Q480,100 960,130 T1920,120" stroke="#F5F2EA" strokeWidth="0.5" fill="none" opacity="0.6" />
            <path d="M0,120 Q480,60 960,90 T1920,80" stroke="#F5F2EA" strokeWidth="0.5" fill="none" opacity="0.4" />
          </svg>

          <div className="hero-center">
            <div className="field-note">
              <span className="rule"></span>
              <span>FIELD NOTE — №&nbsp;001</span>
            </div>

            <h1 className="h-display">
              <span className="title-line"><span className="inner">足跡を、</span></span>
              <span className="title-line l2"><span className="inner">刻め<span className="accent">。</span></span></span>
            </h1>

            <p className="hero-sub">
              ナビは駐車場を教えてくれても駐輪場は知らない。<br />
              <strong>ワンショットが足跡になる。足跡が誰かの地図になる。</strong>
            </p>
          </div>

          <div className="hero-bottom">
            <div className="meta-block">
              <span className="live"><span className="dot"></span>LIVE / β REGISTRATION OPEN</span>
              <strong>都市ライダーの存在証明</strong>
              <span className="footer-text">TOKYO — OSAKA — NAGOYA — FUKUOKA</span>
            </div>

            <a
              href="#beta-form"
              className="cta"
              onClick={(e) => {
                e.preventDefault()
                const el = document.getElementById('beta-form')
                if (el) {
                  const y = el.getBoundingClientRect().top + window.scrollY - 80
                  window.scrollTo({ top: y, behavior: 'smooth' })
                }
              }}
            >
              <span>βテスターに参加する</span>
              <span className="arrow">→</span>
            </a>

            <div className="ticker">
              <span>SPOTS WAITING</span>
              <span className="num">1,300<span className="unit">/PIN</span></span>
              <span>FOR YOUR FIRST SHOT</span>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
