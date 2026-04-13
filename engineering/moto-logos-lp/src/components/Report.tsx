export default function Report() {
  return (
    <section className="section feature-section surface-bg">
      <div className="container">
        <div className="feature-label">&#x1F44D; 報告する</div>
        <h2 className="section-title">
          停めたらワンタップで報告。<br />
          <span className="accent">あなたの報告が、次のライダーを救う。</span>
        </h2>
        <div className="feature-grid">
          <div className="feature-card">
            <div className="feature-icon">📲</div>
            <h3>アプリが自動で聞いてくる</h3>
            <p>スポットの近くに来ると「停められましたか？」が自動表示。わざわざアプリを操作する必要なし。</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⏱</div>
            <h3>情報の鮮度がリフレッシュ</h3>
            <p>あなたの報告でスポットの鮮度バッジが更新。青＝最近確認済み、黄＝やや古い、赤＝要注意。一目でわかる。</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🚫</div>
            <h3>閉鎖・満車もワンタップ</h3>
            <p>「ダメだった」をタップして理由を選ぶだけ。閉鎖、満車、料金違い、CC制限。次のライダーが同じ目に遭わない。</p>
          </div>
        </div>
        <div className="freshness-demo">
          <div className="freshness-row">
            <span className="freshness-dot blue" />
            <span>30日以内 — 信頼できる</span>
          </div>
          <div className="freshness-row">
            <span className="freshness-dot yellow" />
            <span>1〜3ヶ月 — 確認推奨</span>
          </div>
          <div className="freshness-row">
            <span className="freshness-dot red" />
            <span>3ヶ月以上 — 要注意</span>
          </div>
        </div>
      </div>
    </section>
  )
}
