import { useEffect } from 'react'

export function useParallax() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-parallax]')
    if (!els.length) return

    const handleScroll = () => {
      const scrollY = window.scrollY
      els.forEach((el) => {
        const speed = parseFloat(el.dataset.parallax || '0.3')
        const rect = el.getBoundingClientRect()
        const offset = (rect.top + scrollY) * speed - scrollY * speed
        el.style.transform = `translateY(${offset}px)`
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])
}
