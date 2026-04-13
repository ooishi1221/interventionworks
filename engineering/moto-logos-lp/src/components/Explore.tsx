export default function Explore() {
  return (
    <section className="section feature-section">
      <div className="container">
        <div className="feature-label">&#x1F50D; 探す</div>
        <h2 className="section-title">
          困ったら、すぐ探せる。
        </h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">📍</div>
            <h3>最寄りのスポットを距離順で</h3>
            <p>画面上部のバーに近くのバイク置き場が距離順で表示。タップするだけで詳細情報が見られます。</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h3>場所で検索もできる</h3>
            <p>目的地の地名を入力すれば、周辺のバイク駐輪場を一発検索。ツーリング計画にも。</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🏍</div>
            <h3>自分の排気量にあったスポット</h3>
            <p>排気量フィルターで、自分のバイクが停められるスポットだけを表示。大型お断りの心配なし。</p>
          </div>
        </div>
        <div className="feature-visual">
          アプリ画面: 探す（後日差し替え）
        </div>
      </div>
    </section>
  )
}
