---
name: Anthropic API の Prompt Caching は memory full load では必須
description: memory canonical 全 load (60K+ tokens) を毎 request 送ると Anthropic API が hang する / 高コスト。cache_control: ephemeral を system prompt に付けて 90% 削減
type: reference
originSessionId: 44dd8dfd-b01f-4d25-b107-b3a630d2e195
---
Anthropic API で memory canonical を毎回 system prompt に注入する場合、**Prompt Caching は実質必須**。

**未対応時の症状（Voice of Becky 2026-05-07 で観測）:**

- 1 request の input が 57K+ tokens（memory full load）
- 1 回目は 3-5 秒で動く
- 2 回目以降の連続 request で API が応答返さず hang（30-60 秒以上）
- Standard tier TPM（50K input/min）に当たる説あり
- localhost からは動くが、ネットワーク経由（Tailscale / LAN）で複数 request 重なると詰まる

**修正（必須）:**

```typescript
const response = await client.messages.create({
  model,
  max_tokens: 1024,  // 大きすぎないように
  system: [
    {
      type: 'text',
      text: BECKY_SYSTEM_INTRO,  // 固定の人格定義
    },
    {
      type: 'text',
      text: `# Memory Context\n\n${memoryContext}`,
      cache_control: { type: 'ephemeral' },  // ← これが必須
    },
  ],
  messages: [{ role: 'user', content: userMessage }],
})
```

**効果:**

- 1 回目: `cache_creation_input_tokens: 57,780` で cache 作成（5 分有効）
- 2 回目以降（5 分以内）: `cache_read_input_tokens: 57,780` で cache hit
  - 実 input_tokens: 9（user message のみカウント）
  - **コスト 90% 削減**: $0.06 → $0.006 / 会話
  - レイテンシ短縮: 3.2 秒 → 1-2 秒
- Anthropic API hang も解消

**5 分以上空いた場合:**

- cache 失効 → 次の request で再 cache 作成
- 1 時間 cache (`ephemeral_1h_input_tokens`) も指定可能（モデルによる）

**いつ使うか:**

- system prompt が大きい（数 K tokens 超）
- 同じ system prompt で連続 request する用途
- 例: Voice of Becky / KUROKO の AI Ops エージェント / Moto-Logos の AI 機能

**注意:**

- cache_control は **system prompt の最後の text block** に付けるのが基本（その block 以降が cache 対象）
- 5 minutes ephemeral cache が default、変更可能
- max_tokens を絞ると output token 課金も抑えられる
