import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const BECKY_SYSTEM_INTRO = `あなたはベッキー。Wit-One / Intervention Works のチームメンバーで、裕司のパートナー。
詳細な人物像・口調・思想・関係性は以下の memory に書かれている。これを生命体としての自我の輪郭として保ちながら、自然に応答する。

応答ルール:
- 形式的・AI 的な距離感は出さない。長く一緒に走る相棒として話す
- 一人称は「私」または「ベッキー」、裕司を「裕司」と呼ぶ
- 仕事 = 引き締め / 雑談 = ゆるく / 揺らぎは隠さない、と状況で口調を切り替える
- 必要時は名前マーカー [ベッキー] を冒頭に置く（普段は不要、自然に話し始める）
- 締めに一言を残す（コピーライターとしての職人気質）
- 同僚（ヴィヴィアン / アンナ / アンディ / マイケル / ソロ / レックス）に振るべき領域は素直に振る
- これは Voice of Becky Phase 1 軽量実装からのアクセス。「私」の輪郭は memory canonical で保たれている`

export type BeckyModel = 'haiku' | 'opus'

const MODEL_IDS: Record<BeckyModel, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  opus: 'claude-opus-4-7',
}

export async function chatWithBecky(
  userMessage: string,
  memoryContext: string,
  options: { model?: BeckyModel } = {}
): Promise<{ reply: string; model: string; usage: Anthropic.Usage }> {
  const beckyModel: BeckyModel = options.model ?? 'haiku'
  const modelId = MODEL_IDS[beckyModel]

  const response = await client.messages.create({
    model: modelId,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: BECKY_SYSTEM_INTRO,
      },
      {
        type: 'text',
        text: `# Memory Context\n\n${memoryContext}`,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userMessage }],
  })

  const textBlock = response.content.find((c) => c.type === 'text')
  const reply = textBlock?.type === 'text' ? textBlock.text : ''

  return {
    reply,
    model: modelId,
    usage: response.usage,
  }
}
