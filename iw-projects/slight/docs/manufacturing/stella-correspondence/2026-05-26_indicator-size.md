# Stella Wu — Indicator Size Discussion (2026-05-26)

サンプル第 2 弾受領 → インジケーターサイズの小型化依頼。

---

## Stella → 裕司（2026-05-26 10:11〜10:15）

> Hi Yuji,
> Hope you are doing well.
> The gloves have received the latest update.
> We chose an indicator light that does not require mold making.
> Currently, this sample does not have a logo printed on it; we are just confirming whether the position of the indicator light next to the socket is appropriate.
> If we confirm it's suitable, we will then print the logo.
> In addition, the size L made this time is much more compact than the previous sample, making it more comfortable to wear.
> Would you like to confirm whether the position of the indicator light is appropriate this time?
> Hope to receive your reply.
> Best Regards,
> Stella

添付:
- `../samples/2026-05-26_sample2_G99_flat.jpg`
- `../samples/2026-05-26_sample2_worn_190cm.jpg`（身長 190cm の人着用）

---

## 裕司 → Stella（2026-05-26 送信、ベキたんドラフト）

> Hi Stella,
>
> Thanks for the update — the size L fit is much better, exactly the tight feel we wanted.
>
> About the indicator light: the **position is fine**, but the **current size feels a bit too prominent** for our brand direction (we want it to be barely noticeable when worn). Could you make it **significantly smaller** — ideally a pinhole-sized LED — while still keeping the no-mold approach?
>
> Once we confirm the smaller indicator works, please proceed with the logo printing.
>
> Best,
> Yuji

**日本語訳（裕司の確認用）:**

> Stella さん、アップデートありがとうございます。サイズ L のフィット感、前回よりずっと良くなっていて、我々が求めていたタイトな着用感そのものです。
>
> インジケーターライトについて：**位置は問題ありません**が、**現在のサイズが、我々のブランド方向性からするとやや主張しすぎている**ように感じます（着用時にほとんど気付かない、くらいが理想です）。**no-mold（金型不要）の方針を維持したまま、もっと大幅に小さく**できないでしょうか。理想はピンホール（針穴）サイズの LED です。
>
> 小型化したインジケーターで問題ないことを確認できたら、ロゴ印字に進んでください。

---

## Stella → 裕司（2026-05-28 返信）

> Hi Yuji,
> The mold cost for the indicator light is relatively expensive.
> Because the indicator light requires a mold cost of around 1100-1300 USD.
> We are currently using the lowest-cost method.
> As you said, the sample gloves have decreased significantly compared to the beginning. First, the absence of battery costs reduces the cost by about 10 dollars.
> The specific pricing system has not been fully developed yet. Because we are still making adjustments to the temperature.
> Which model do you currently prefer?
> Best Regards,
> Stella

**Stella の言い分の要点:**
- pinhole 化には mold 必要 → $1100-1300 USD（17〜20 万円追加）
- 現サンプルは「mold なし = 最安 method」を採用中
- バッテリー無し設計で既に約 $10/個 コスト減
- 価格体系は未確定（温度調整中）
- 「どっち（pinhole + mold / 現状 no-mold）で進めたい？」と判断ボールを返してきた

---

## 裕司 → Stella（2026-05-28 14:19 送信、ベキたんドラフト）

> Hi Stella,
>
> Thanks for the clarification on the mold cost — I understand the trade-off now.
>
> Before deciding on the indicator, I want to test the actual heat feel of this 2nd sample on a real ride first. Since we doubled the wattage from 5W to 10W per glove, the heat should now be strong enough that the indicator may not be necessary at all.
>
> I'll get back to you within a few days with my decision. If the heat is clearly noticeable within 30 seconds of starting, we can remove the indicator entirely and proceed straight to logo printing. If not, we'll stick with the current no-mold indicator as-is.
>
> Best,
> Yuji

**craft 転換のポイント（判断の根**:
- 1st sample = **5W / インジケーターなし** → 「ついてるか分からない」問題 → 2nd で indicator 採用の根拠
- 2nd sample = **10W に倍増** → 温感が十分なら **indicator 自体が不要**になる可能性
- インジケーターは「電力弱さの band-aid」だったので、根本（電力倍増）が効いてるなら band-aid も外せる
- Slight の引き算思想（USB ケーブル同梱なし、物理スイッチなし）と同じ系譜で「機能の妥当性そのものを問い直す」判断

---

## 実機テスト判定基準（裕司 → バイクで検証）

- [ ] エンジン ON 〜 **30 秒以内に明確な温感**あるか
- [ ] 「ついてるか分からない」不安が消えるレベルか
- [ ] 指先 vs 手の甲、温まりムラ
- [ ] 指先タッチ感度（タッチパネル・スイッチ操作）
- [ ] 指先シーム部の風入り（パターン調整リクエストの効き）

### 結果分岐

| 温感 | 次の craft |
|---|---|
| 十分（30 秒以内に明確に温かい）| Stella にインジケーター削除 GO → ロゴ印字直行 |
| 不足 | 現状 no-mold インジケーターのまま受け入れ（mold 17-20 万は CF 凍結ライン考えると重すぎ）|

---

## 返答待ちのチェックポイント（実機テスト後、別途 Stella に依頼）

- [ ] 着用サイズ表（手囲・手長 cm レンジ）— 別途依頼
- [ ] 電熱端子の規格（汎用品互換性確認）— 別途依頼
