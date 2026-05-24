export default function StickyHeader() {
  return (
    <header className="sticky-header">
      <div className="sticky-header-brand">
        <span className="sticky-header-mark">M</span>
        <span>MOTO-LOGOS</span>
      </div>
      <a
        href="#beta-form"
        className="sticky-header-btn"
        onClick={(e) => {
          e.preventDefault()
          const el = document.getElementById('beta-form')
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 80
            window.scrollTo({ top: y, behavior: 'smooth' })
          }
        }}
      >
        βテスター参加 →
      </a>
    </header>
  )
}
