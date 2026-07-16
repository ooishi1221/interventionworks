# Stella Wu — C to C 充電非対応 + デザイン変更依頼（2026-07-16）

M/S 新サンプル受領後、通電しない不具合の原因特定 → C to C 非対応が判明 → 回路変更 + デザイン変更をまとめて打診。

---

## 発端 — 通電しない（裕司、実機テスト）

- USB-C PD 充電器で通電せず、ランプ点灯なし
- モバイルバッテリーでも同様に通電せず
- → 「PD 特有の話」ではなく「グローブ側が USB-C の正規 sink 終端をしていない」線を疑う

## 裕司 → Stella（充電規格確認、2026-07-16 送信、ベキたんドラフト）

> Hi Stella,
>
> The new M/S samples arrived — thank you!
>
> But we've got a problem: the glove won't power on at all. No lamp, no heat, nothing. We've tried a USB-C PD charger and a mobile battery pack, and it doesn't charge with either one. Why would that be?
>
> Could you check with your team what the charging connector actually requires? Specifically:
> - Does it use proper USB-C detection (CC pin / Rd termination), or something older like USB-A style D+/D- detection?
> - What input voltage/current does it need (5V/1A? 5V/2A?)
>
> This matters because our plan is not to include a cable in the box — customers use their own — so it needs to actually work with the common USB-C chargers and battery packs people already have.
>
> Best,
> Yuji

## Stella → 裕司（返信）

> Hi Yuji,
> Just checking, it normally uses a USB-C cable. A Type C-C cable cannot be used. The original components and circuitry inside have not been changed, only the voltage has been changed.
> Could you please try using another one to test if it works?
> Best,
> Stella

**要点:**
- 通常は USB-C ケーブル使用（＝実質 USB-A to USB-C ケーブルを指す）
- **Type C-to-C ケーブルは非対応**
- 内部部品・回路は今回変更しておらず、電圧のみ変更

## 実機再テスト（裕司）

- USB-A to USB-C ケーブルで通電確認 ✅
- 刺した瞬間に温感あり（5/28 判定基準を余裕でクリア）
- ただし **C to C 非対応が確定** → 「ケーブル同梱なし、みんな持ってるやつで動く」という Slight の引き算方針の前提が崩れる（今どき充電は C-to-C が主流）

## 裕司 → Stella（C to C 対応可否 + デザイン変更依頼、2026-07-16 送信、ベキたんドラフト）

> Hi Stella,
>
> Update: we confirmed the glove works fine with a USB-A to USB-C cable — it heats up almost instantly, which is great.
>
> However, it not working with a Type C-to-C cable is a real problem for us. Most people today only have C-to-C cables (that's what phones use), so requiring an A-to-C cable specifically would be tough for our customers. Would it be possible to change the circuit so it also works with C-to-C?
>
> Separately, we also wanted to ask about a few design changes — are these possible?
> - Shortening the rib length by half
> - Using a graphic/patterned material
> - Changing the position of the connector and the indicator light
>
> Let us know what's feasible, and whether any of these affect cost or timeline.
>
> Best,
> Yuji

**質問項目:**
1. 回路を C to C 対応に変更できるか
2. リブの長さを半分にできるか
3. グラフィカルな柄物素材を使えるか
4. コネクター・インジケーターライトの位置変更ができるか

## Stella → 裕司（受領確認、2026-07-16）

> Hi Yuji,
> Okay, I understand your point of view.
> I will communicate with our R&D team this afternoon.
> I have also been having them calculate the costs recently.
> I will let you know as soon as I have a response.
> Best regards,
> Stella

**状態**: R&D 確認 + コスト計算中、返答待ち。

---

## 次のアクション

- [ ] Stella からの回答待ち（C to C 対応可否・コスト・4項目の対応可否）
- [ ] 回答次第で、CF 凍結ライン（投資額約 30 万円）に対してコスト増が見合うか判断
