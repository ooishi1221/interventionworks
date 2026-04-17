import LiveFeed from './LiveFeed'

export default function StickyHeader() {
  return (
    <header className="sticky-header">
      <div className="sticky-header-inner">
        <div className="sticky-header-brand">
          <img src="/images/logo-mark.jpg" alt="" className="sticky-header-icon" />
          <span className="sticky-header-logo">MOTO-LOGOS</span>
        </div>
        <div className="sticky-header-feed">
          <LiveFeed />
        </div>
        <a
          href="#beta-form"
          className="btn-primary sticky-header-btn"
          onClick={(e) => {
            e.preventDefault()
            const el = document.getElementById('beta-form')
            if (el) {
              const y = el.getBoundingClientRect().top + window.scrollY - 80
              window.scrollTo({ top: y, behavior: 'smooth' })
            }
          }}
        >
          βテスターに参加する
        </a>
      </div>
    </header>
  )
}
