export default function Stats() {
  const stats = [
    { number: '1,247', label: '共有済みスポット' },
    { number: '312', label: '今週の更新' },
    { number: '89%', label: '鮮度30日以内' },
  ]

  const activities = [
    { color: 'var(--success)', text: '渋谷駅前に新スポット追加', time: '2分前' },
    { color: 'var(--fresh-blue)', text: '新宿西口の情報を確認', time: '8分前' },
    { color: 'var(--accent)', text: '池袋東口「空きあり」報告', time: '15分前' },
  ]

  return (
    <section className="section stats">
      <div className="container">
        <h2 className="section-title">今この瞬間も、仲間が走っている。</h2>
        <div className="stats-grid">
          {stats.map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-number">{s.number}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="activity-feed">
          {activities.map((a, i) => (
            <div key={i} className="activity-item">
              <div className="activity-dot" style={{ background: a.color }} />
              <span>{a.text}</span>
              <span className="activity-time">{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
