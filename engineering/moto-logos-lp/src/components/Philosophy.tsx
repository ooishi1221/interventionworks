export default function Philosophy() {
  return (
    <section className="section philosophy">
      <div className="philosophy-bg" data-parallax="0.15" aria-hidden="true"></div>
      <div className="container">
        <h2 className="section-title reveal">
          車社会の地図に<br />
          <span className="accent">ライダーの居場所はなかった。</span>
        </h2>
        <p className="philosophy-body reveal">
          ナビに載っていない駐輪場。3年前の情報を信じて走った先にあったフェンス。
          大型お断りの看板は着いてからしか読めない。
        </p>
        <p className="philosophy-body reveal">
          Google Mapsは車のための地図だ。
          バイク乗りはいつだって地図の上では透明人間だった。
        </p>
        <div className="philosophy-divider reveal-wipe-center"></div>
        <p className="philosophy-shift reveal">
          だから自分たちの地図をつくることにした。<br />
          正確なデータベースじゃない。<br />
          <strong>「ここにいたよ」</strong>というライダーの足跡が重なる地図。
        </p>
      </div>
    </section>
  )
}
