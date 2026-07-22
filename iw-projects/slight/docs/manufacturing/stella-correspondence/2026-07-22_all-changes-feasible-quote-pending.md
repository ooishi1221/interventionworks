# Stella Wu — デザイン変更4点すべて実現可能、見積もり待ち（2026-07-22）

7/16打診（C-to-C対応可否+デザイン変更）への返信。**全項目「できる」回答**、コスト影響の見積もりが本日午後（先方時間）に来る見込み。

---

## Stella → 裕司（2026-07-22 受信）

> Hi Yuji,
> Good morning!
> I have learned some information.
> - Shortening the rib length by half
> - Using a graphic/patterned material
> - Changing the position of the connector and the indicator light
> All three points above can be realized. Among them, the second point will affect the cost. Printed patterns will increase the cost to some extent.
> Besides that, we can also switch to a C-C cable, but the cost will also increase because it needs to meet the fast charging protocol to allow the fast charging power bank to power the gloves.
> I am still following up on the latest quotation from the R&D manager. I will urge him to provide the quotation by this afternoon as much as possible.
> Best,
> Stella

## 要点整理

| 項目 | 可否 | コスト影響 |
|---|---|---|
| リブ長を半分に | ✅ | なし（言及なし） |
| 柄物・プリント素材 | ✅ | **増**（プリント代） |
| コネクタ+インジケータ位置変更 | ✅ | なし（言及なし） |
| C-to-C ケーブル対応 | ✅ | **増**（急速充電プロトコル対応=PD sink 実装が必要） |

## 判断メモ（ベキたん）

- **C-to-C 対応は思想の核**: 「同梱しない=全員持ってる」前提が、いまどきのモバイルバッテリー（C-C主流）で崩れてた。A-to-C 限定は「専用ケーブルを持ち歩け」に近い抵抗で Zero-Resistance に反する。コスト次第だが優先度最上位
- **柄物素材は Phase 2（Aesthetic Liberation）の領域**: 初弾5,000円/300個の価格構造でコスト増を飲む必要があるか要検討。無地でも「街に溶け込むシルエット」は成立する
- **リブ半分+コネクタ位置はコスト影響なし → 確定でいい**

## 裕司 → Stella（見積もり形式の指定、2026-07-22 送信、ベキたんドラフト）

> Hi Stella,
>
> Thanks! Just one request about the quotation — could you ask the R&D manager to include the minimum order quantity / lot size options and the unit price for each lot size (with all the requested changes included), rather than just the cost difference?
>
> That format would help us make the decision quickly.
>
> Best,
> Yuji

（趣旨: 差分だけでなく、変更全部込み仕様での「ロット別発注数量×単価」一覧の形式で出してほしい）

## Stella → 裕司（2回目返信: コスト構造+MOQ判明、2026-07-22 受信）

> Hi Yuji,
> I understand your requirement.
> For some material, shorten or add length won't add any cost or decline cost. Only involve the PCB board or battery, will infect the cost.
> So let me give you a quotation with MOQ.
> Currently, it is known that: the MOQ for gloves is 500 pairs.
> If you have any requirements, please let me know in time.
> Best regards,
> Stella

**要点:**
- コスト構造の明確化: 素材の長さ変更(リブ半分等)=コスト増減なし。**コストに響くのはPCB基板とバッテリー絡みのみ**(=C-to-C対応が主なコスト源。柄物プリントへの言及は今回なし、前便の「増える」が生きてる前提で見る)
- **⚠️ MOQ(最小発注数量)=500ペア** — 初弾計画の300個を上回る。ロット別単価見積もりはこの後届く

## 次アクション

- [ ] R&D マネージャーの見積もり受領（本日午後の見込み、来なければ翌日催促）。形式=変更込み仕様のロット別単価一覧を指定済み
- [ ] 見積もり受領後: C-to-C / 柄物のコスト増を単価5,000円・300個の構造に当てて採否判断（ゆう）
