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
import About from './components/About'
import Footer from './components/Footer'
import StickyHeader from './components/StickyCta'
import './App.css'

function App() {
  useScrollReveal()
  useParallax()

  return (
    <>
      <StickyHeader />
      <Hero />
      <HowTo />
      <BetaPerks />
      <Philosophy />
      <PhotoBreak />
      <CoreValues />
      <Faq />
      <FinalCta />
      <About />
      <Footer />
    </>
  )
}

export default App
