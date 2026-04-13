export default function Before() {
  return (
    <section className="section pain">
      <div className="container">
        <h2 className="section-title">
          着いたら閉鎖。<br />この経験、もう終わりにしよう。
        </h2>
        <div className="pain-cards">
          <div className="pain-card">
            <h3>ナビに載っていない</h3>
            <p>バイク駐輪場は Google Maps にもカーナビにも出てこない。車は停められるのに、バイクだけが路上を彷徨う。</p>
          </div>
          <div className="pain-card">
            <h3>情報が古い。行ったら工事中</h3>
            <p>最後に更新されたのは3年前。「あります」の情報を信じて走った先に、あったのはフェンスだった。</p>
          </div>
          <div className="pain-card">
            <h3>大型お断り。着くまで分からない</h3>
            <p>排気量制限は現地に行かないと分からない。400ccで停められるか、原付専用か。賭けで走るしかない。</p>
          </div>
        </div>
        <p className="pain-challenge">
          <span className="stale-badge">⚠ 最終更新: 3年前</span>
          <br />この情報で、安心して走れますか？
        </p>
      </div>
    </section>
  )
}
