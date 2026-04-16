import { useEffect, useState } from 'react'

const notifications = [
  { bike: 'CB400SF', spot: '渋谷マークシティ駐輪場', action: '停めた', time: '2分前', type: 'parked' },
  { bike: 'Ninja 400', spot: '新宿サブナード駐輪場', action: '満車だった', time: '5分前', type: 'full' },
  { bike: 'PCX150', spot: '北千住駅東口', action: '停めた', time: '15分前', type: 'parked' },
  { bike: 'BOLT', spot: '秋葉原UDX駐輪場', action: '閉鎖されていた', time: '23分前', type: 'closed' },
  { bike: 'MT-07', spot: '丸の内バイクパーキング', action: '停めた', time: '31分前', type: 'parked' },
]

export default function LiveFeed() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % notifications.length)
        setVisible(true)
      }, 400)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  const n = notifications[index]

  return (
    <div className={`livefeed-item ${visible ? 'livefeed-visible' : ''}`}>
      <span className={`livefeed-dot livefeed-dot-${n.type}`}></span>
      <span className="livefeed-text">
        <strong>{n.bike}</strong> で{n.spot} — {n.action}
      </span>
      <span className="livefeed-time">{n.time}</span>
    </div>
  )
}
