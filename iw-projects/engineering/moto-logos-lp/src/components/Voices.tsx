export default function Voices() {
  const voices = [
    {
      name: 'タカシ',
      bike: 'CB400SF',
      text: '自分用のメモのつもりで残した場所に「ありがとう」が来たとき、なんか不思議な気持ちになった。見知らぬ誰かの役に立ってた。',
    },
    {
      name: 'サトミ',
      bike: 'Ninja 400',
      text: 'ピンが温かいと「あ、さっき誰かいたんだ」って分かるのが好き。孤独に走ってるようで、実は仲間がいる感じ。',
    },
    {
      name: 'ケンジ',
      bike: 'BOLT',
      text: '星をつけるとかレビューするとか、そういうのじゃないのがいい。ただ「ここにいたよ」って残すだけ。それがちょうどいい距離感。',
    },
  ]

  return (
    <section className="section voices">
      <div className="container">
        <h2 className="section-title">ライダーの声</h2>
        <div className="voices-grid">
          {voices.map((v, i) => (
            <div className="voice-card" key={i}>
              <p className="voice-text">{v.text}</p>
              <div className="voice-footer">
                <span className="voice-name">{v.name}</span>
                <span className="voice-bike">{v.bike}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
