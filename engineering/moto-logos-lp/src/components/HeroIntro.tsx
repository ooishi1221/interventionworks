import { useEffect, useState } from 'react'

export default function HeroIntro() {
  const [phase, setPhase] = useState<'black' | 'show' | 'textout' | 'reveal' | 'done'>('black')

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const t1 = setTimeout(() => setPhase('show'), 200)
    const t2 = setTimeout(() => setPhase('textout'), 1000)
    const t3 = setTimeout(() => setPhase('reveal'), 1500)
    const t4 = setTimeout(() => {
      setPhase('done')
      document.body.style.overflow = ''
    }, 2500)
    return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4)
      document.body.style.overflow = ''
    }
  }, [])

  if (phase === 'done') return null

  return (
    <div className={`hero-intro ${phase}`} aria-hidden="true">
      <span className="hero-intro-meta">FIELD NOTE — №&nbsp;000</span>
      <h1 className="hero-intro-text">
        これは<span className="accent">存在証明</span>だ。
      </h1>
      <span className="hero-intro-sub">A FIELD NOTE FOR URBAN RIDERS</span>
    </div>
  )
}
