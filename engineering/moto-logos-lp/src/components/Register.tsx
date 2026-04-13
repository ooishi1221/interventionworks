export default function Register() {
  return (
    <section className="section feature-section surface-bg">
      <div className="container">
        <div className="feature-label">&#x1F4F8; 登録する</div>
        <h2 className="section-title">
          新しい場所は、📸で共有。
        </h2>
        <p className="section-sub">
          見つけたバイク置き場を写真1枚で即登録。<br />
          住所は自動取得。グローブしたままでも、親指1本で完了。
        </p>
        <div className="register-steps">
          <div className="register-step">
            <div className="register-num">1</div>
            <p>カメラボタンをタップ</p>
          </div>
          <div className="register-arrow">→</div>
          <div className="register-step">
            <div className="register-num">2</div>
            <p>写真を撮る</p>
          </div>
          <div className="register-arrow">→</div>
          <div className="register-step">
            <div className="register-num">3</div>
            <p>登録完了！</p>
          </div>
        </div>
        <p className="register-caption">
          あなたが見つけた場所が、次に走るライダーの道しるべになる。
        </p>
      </div>
    </section>
  )
}
