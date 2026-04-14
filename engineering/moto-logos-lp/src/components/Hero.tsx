export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">
        <div className="hero-logo">MOTO-LOGOS</div>
        <h1>
          俺たちは、<span className="accent">ここにいる。</span>
        </h1>
        <p className="hero-sub">
          自分のメモが、誰かの安心になる。<br />
          ライダーの存在証明マップ。
        </p>
        <div className="hero-cta-group">
          <a href="#" className="btn-primary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
            App Store
          </a>
          <a href="#" className="btn-secondary">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.04l8.85-15.38 4.23 4.24L3.18 23.04zm-.63-1.09L1.39 4.93c-.04-.33.07-.67.31-.91L10.2 12.5 2.55 21.95zm.84-18.29c.14-.08.29-.13.45-.13.15 0 .3.04.43.12l13.97 8.08-3.48 3.48L3.39 3.66zm17.93 7.77l-3.5 2.02-3.83-3.83 3.83-2.2 3.5 2.02c.63.37.63 1.63 0 1.99z"/></svg>
            Google Play
          </a>
        </div>
      </div>
      <div className="hero-mockup">
        <div className="mockup-placeholder">
          <div className="mockup-pin"></div>
          <div className="mockup-pin mockup-pin-2"></div>
          <div className="mockup-pin mockup-pin-3"></div>
          <span>App Screenshot</span>
        </div>
      </div>
      <div className="hero-scroll">&#x25BE;</div>
    </section>
  )
}
