export default function Notify() {
  const feed = [
    { icon: '🏍', text: 'CBR650Rのライダーが渋谷駅前を登録', time: '2分前', color: 'var(--fresh-blue)' },
    { icon: '👍', text: 'PCX150で北千住駅東口「停められた」', time: '5分前', color: 'var(--success)' },
    { icon: '👎', text: 'Ninja400で赤羽駅東口「満車だった」', time: '12分前', color: 'var(--fresh-yellow)' },
    { icon: '🏍', text: 'レブル250のライダーが池袋東口を登録', time: '15分前', color: 'var(--fresh-blue)' },
    { icon: '👍', text: 'YZF-R25で秋葉原UDX前「停められた」', time: '22分前', color: 'var(--success)' },
  ]

  return (
    <section className="section feature-section">
      <div className="container">
        <div className="feature-label">&#x1F514; 届く</div>
        <h2 className="section-title">
          みんなの報告がリアルタイムで流れる。
        </h2>
        <p className="section-sub">
          アプリを開くだけで、今この瞬間のライダーの動きが見える。<br />
          バイクの車種名付きで流れるから、「仲間がいる」と感じられる。
        </p>
        <div className="notify-feed">
          {feed.map((item, i) => (
            <div className="notify-item" key={i}>
              <span className="notify-icon">{item.icon}</span>
              <span className="notify-text">{item.text}</span>
              <span className="notify-time">{item.time}</span>
            </div>
          ))}
        </div>
        <p className="notify-caption">
          あなたの報告も、こうやって仲間に届きます。
        </p>
      </div>
    </section>
  )
}
