import { useScrollReveal } from './hooks/useScrollReveal'
import { useParallax } from './hooks/useParallax'
import Hero from './components/Hero'
import HowTo from './components/HowTo'
import BetaPerks from './components/BetaPerks'
import Philosophy from './components/Philosophy'
import PhotoBreak from './components/PhotoBreak'
import CoreValues from './components/CoreValues'
import Faq from './components/Faq'
import FinalCta from './components/FinalCta'
import Footer from './components/Footer'
import StickyHeader from './components/StickyCta'
import './App.css'

function App() {
  useScrollReveal()
  useParallax()

  return (
    <>
      <div className="grid-bg" aria-hidden="true"></div>
      <div className="crosshair tl" aria-hidden="true"></div>
      <div className="crosshair tr" aria-hidden="true"></div>
      <div className="crosshair bl" aria-hidden="true"></div>
      <div className="crosshair br" aria-hidden="true"></div>

      <StickyHeader />
      <Hero />
      <Philosophy />
      <CoreValues />
      <PhotoBreak />
      <BetaPerks />
      <HowTo />
      <Faq />
      <FinalCta />
      <Footer />
    </>
  )
}

export default App
