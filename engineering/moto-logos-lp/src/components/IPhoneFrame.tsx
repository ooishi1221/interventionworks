export default function IPhoneFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="iphone-frame">
      <div className="iphone-btn iphone-btn-right-1"></div>
      <div className="iphone-btn iphone-btn-right-2"></div>
      <div className="iphone-btn iphone-btn-left"></div>
      <div className="iphone-screen">
        <div className="iphone-notch"></div>
        <img src={src} alt={alt} className="mockup-img" />
      </div>
    </div>
  )
}
