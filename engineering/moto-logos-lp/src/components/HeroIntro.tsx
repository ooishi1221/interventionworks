import { useEffect, useState } from 'react'

export default function HeroIntro() {
  const [phase, setPhase] = useState<'black' | 'show' | 'move' | 'done'>('black')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const t1 = setTimeout(() => setPhase('show'), 200)
    const t2 = setTimeout(() => setPhase('move'), 1000)
    const t3 = setTimeout(() => {
      setPhase('done')
      document.body.style.overflow = ''
    }, 1500)
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
      document.body.style.overflow = ''
    }
  }, [])

  if (phase === 'done') return null

  return (
    <div className={`hero-intro ${phase}`} aria-hidden="true">
      <h1 className="hero-intro-text">
        俺たちは<span className="accent">ここにいる。</span>
      </h1>
    </div>
  )
}
