export default function Pain() {
  const cards = [
    {
      title: '「ナビに載っていない」',
      text: 'バイク駐輪場は Google Maps にもカーナビにも、ほとんど出てこない。車は停められるのに、バイクだけが路上を彷徨う。',
    },
    {
      title: '「情報が古い。行ったら閉鎖」',
      text: 'ネットの駐輪場情報、最後に更新されたのはいつ？3年前のデータで「あります」と言われても、着いたら工事中。',
    },
    {
      title: '「大型お断り。着くまで分からない」',
      text: '排気量制限は現地に行かないと分からない。400ccで停められるか、原付専用か。賭けで走るしかない。',
    },
  ]

  return (
    <section className="section pain">
      <div className="container">
        <h2 className="section-title">着いてみたら、閉鎖されていた。</h2>
        <div className="pain-cards">
          {cards.map((card, i) => (
            <div key={i} className="pain-card">
              <h3>{card.title}</h3>
              <p>{card.text}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="pain-badge">&#x26A0; 最終更新: 3年前</div>
          <p className="pain-question">この情報で、安心して走れますか？</p>
        </div>
      </div>
    </section>
  )
}
