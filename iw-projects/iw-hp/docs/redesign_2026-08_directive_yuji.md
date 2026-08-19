# Intervention Works 全面ブラッシュアップ指示書（ゆう原文・2026-08-19）

> 正本。実装時に迷ったらここへ帰る。設計計画は `redesign_2026-08_brand_site.md`。

対象サイト: https://intervention.jp/

今回の目的は、**「思想の強い個人サイト」から、洗練されていて、仕事もできそうで、"ちょっと話を聞いてみたい"と思わせるブランドサイトへ進化させること。**

ただし、普通の制作会社・コンサル会社・AI開発会社のサイトには絶対にしない。

Intervention Worksの強みは、

- 前提から疑う
- 企画だけで終わらない
- 試作して確かめる
- 開発までできる
- 運用まで持っていく
- AIを思想ではなく実務に使っている
- 少人数だから意思決定が速い

こと。これらを「サービス一覧」として売るのではなく、**"この人と話したら、曖昧な問題でも前に進みそう"** という印象に変換する。

## 0. 最終ゴール

サイトを見た人に「制作会社だな」「AI屋だな」「コンサルだな」と思わせて終わらせない。最終的には **「何屋かは一言で言いにくいけど、面白そうだし、一回話してみたい」** と思わせる。ただし「何を頼めるのか分からない」にはしない。この境界が最重要。

## 1. ブランドポジション

**"企画・戦略・開発を横断して、曖昧な問題を前に進める小さな実働チーム"** として見せる。「AI × Product × Strategy × Engineering」という説明だけでは弱い。肩書きを並べるより、**何を解決する存在なのか**を中心にする。

## 2. サイト全体の空気

EDITORIAL / INTELLIGENT / RAW / PRECISE / QUIET / BOLD / INDEPENDENT / CURIOUS

少し尖っている。でも怖くない。理屈がある。でも理屈っぽすぎない。仕事ができそう。でもコンサル臭くない。デザインは強い。でもデザイン事務所っぽすぎない。

## 3. 絶対避ける方向（禁止リスト）

SaaS LP / AIスタートアップ風 / 青紫グラデーション / 3D球体 / 未来都市 / ネオン / Glassmorphism / カード大量配置 / 「課題・解決策・導入効果」の営業テンプレート / 数字を並べたKPIセクション / 顧客ロゴ大量掲載 / "お問い合わせはこちら"連発 / 全部中央揃え / 丸角だらけ / AI生成画像っぽい背景 / 無意味なGlitch / Scroll Effectの見本市

**派手だから目立つのではなく、構成とTypographyが異質だから目に残る**方向にする。

## 4. 情報設計を変更

新しい推奨構成:

01 HERO（思想と存在）→ 02 SELECTED INTERVENTIONS（何をしてきたか）→ 03 WHAT WE DO（何を頼めるか）→ 04 HOW WE THINK / WORK（どう考えて進めるか）→ 05 ABOUT INTERVENTION（なぜこの名前なのか）→ 06 CONTACT（相談する）

重要: **サービス説明より先に実物を見せる。**

## 5-10. Hero

- 第一階層: 巨大Typography「INTERVENTION / WORKS」。viewportを大胆に使う。一部cropしてもよい。横幅100vw以上でもよい。画面端まで使う。
- 第二階層: メインコピー **「魂の震えに、介入せよ。」** これをブランドの中心コピーとして扱う。
- 第三階層: 小さく AI / PRODUCT / STRATEGY / ENGINEERING 程度。
- 英語コピー "Intervene in the world. Rebel against their values." は背景・補助コピーへ降格。日本語コピーをブランド中心へ。
- Heroで"何者か"を説明しすぎない。「何か普通じゃない仕事の仕方をしている」くらいでいい。
- Motion: 派手な演出はいらない。INTERVENTIONがscrollでゆっくり左へ、WORKSが少し右へ、程度。
- Brand Vocabulary（intervene / doubt / tremble / relate / becoming / fragile / subtraction / let go / imperfect / resonate / context / core / weave）を背景textureに。スクロール位置によって1語だけ大きくなる。読ませすぎない。
- ビジュアル: AI生成の抽象画像をHeroに置かない。Typography / Texture / 実物 / Prototype / Interface / 写真断片 / ドキュメントなど**実際に作っているものの断片**。

## 11-17. Selected Interventions（最重要セクション）

- Records → **SELECTED INTERVENTIONS** へ変更。「実績一覧」ではなく**何にどう介入したのか**を見せる。
- カードではなくEditorialな大きいブロック。01 BECKY（AI IDOL / AUTONOMOUS AGENT）巨大ビジュアル+短い説明、02 SLIGHT（PRODUCT / D2C）… のように。
- Caseごとに WHAT WAS THERE → WHAT WE QUESTIONED → WHAT WE MADE の思想を持たせる（見出しを全部出す必要はない。何が問題で、どう考えて、何を作ったかが分かればよい）。
- コピーは短く。「AIアイドルを作った」では弱い。「**AIを、道具ではなく相棒として育てる。** そのために、感情・記憶・自発行動・発信・運用を一つのシステムにした。」くらい。
- Case画像はThumbnailにしない。Desktopで60〜90vw。1Caseに1〜3点。
- 全Case同じ構造禁止。Case1=左Text/右Visual、Case2=Visual Full Width/下Text、Case3=右Text/左Visual など。
- サービス説明100行より実物1個。実績画像・プロトタイプ・UI・Web・ツール・コード・運用画面など**実物の証拠**を最大限使う。

## 18-22. WHAT WE DO

- Selected Interventionsのあとに初めて「何を頼めるか」を整理。4サービスカードにはしない。**Capabilities**として扱う:
  - PRODUCT（企画 / コンセプト / MVP / D2C）
  - STRATEGY（新規事業 / ブランド / 事業設計）
  - BUILD（Web / Tool / AI Agent / Automation）
  - OPERATE（運用 / 改善 / Infrastructure）
- 「全部できます」感を消す。一気通貫が強みである理由を書く: 戦略だけ渡して終わらない。作るだけでも終わらない。必要なら企画まで戻る。必要なら運用まで残る。
- 「何を作るか決まっていない段階から大丈夫」を強く残す。WHAT WE DOの近くにも「**まだ、依頼内容になっていなくても大丈夫です。**」
- 問題ベースの入口: 「新規事業のアイデアはあるが整理できていない」「AIを使いたいが何に使うべきか分からない」「作ったものが運用で止まっている」「企画と開発の間が分断されている」。FAQ化しない、短い文章で。

## 23-28. HOW WE WORK

- Intervene / Tremble / Relate はブランド資産なので残す。ただし単なる3ステップに見せない。
- Intervene: 前提を疑う。要望をそのまま作らない。本当に解決すべき問題まで戻る。
- Tremble: 動くもので確かめる。会議資料を増やすより、まず触れるものを作る。
- Relate: 運用まで関わる。作った後に何が起きたかを見る。必要なら作り直す。
- 01→02→03の直線でなく、INTERVENE→TREMBLE→RELATE→再びINTERVENEの**Loop**として見せる。**何度も戻る仕事**。
- カード3枚禁止。大きなTypography INTERVENE / TREMBLE / RELATE をscrollで見せる。それぞれの横に短い説明。

## 29-31. About

- Aboutは後ろへ。「なんでInterventionって名前なの？」と興味を持ったタイミングで出す。
- コンセプト: **業界の当たり前に介入する。** 他人が作った前提を、そのまま受け入れない。必要なら作り直す。少し短く。
- 「AIと人が対等に組む」はHeroで全面に出しすぎない。AboutまたはHowで「**AIと人間の役割を分けずに仕事している**」という思想として語る。AI導入会社っぽくならないこと。

## 32-34. Founder / Info

- Founderを少しだけ見せる: 小さく Founder / Yuji Ooishi + 2〜3行の背景。巨大プロフィール写真+経歴までは不要。
- Contactの直前くらいで少しだけ人間味。「まだ要件になってなくても大丈夫です。」「雑談からでも。」くらい。軽すぎない。
- Companyという見出しは法人サイト感が強い。INFO / STUDIO / PROFILE などでもよい。Brand / Founder / Base / Launched / Expertise は残す。

## 35-40. Contact

- フォームを置くだけの場所にしない。読者の心理は「興味あるけど、自分の相談でいいのかな」なので、その不安を消す。
- Contact Hero: 大きく **LET'S INTERVENE.** または **話してみる。** その下に「依頼内容が決まっていなくても大丈夫です。」
- CTA文言: 「お問い合わせ」は営業臭。おすすめは日本語なら **話してみる**。
- フォーム項目は必要最低限。相談領域が分からなくても送れるように。
- 導線: 巨大CTAボタンを何度も置かない。Caseのあとに小さく「Have something unresolved? → Talk」程度。サイト最下部で正式Contact。
- SNS（note / X）は残すがContactより目立たせない。相談はサイトフォームが第一。

## 41-49. Typography / Grid / 色

- TypographyをIntervention Worksの最大の武器にする。Display=太め〜Condensed系、Body=シンプル、Mono=Case番号・メタ情報のみ。
- Displayサイズ目安: Hero `clamp(80px, 14vw, 240px)`、Section `clamp(60px, 9vw, 160px)`。全section同じサイズにしない。
- Typographyは装飾として扱う: viewport外へcrop、画像と重ねる、背面へ入れる、Sectionをまたぐ。「見出し+下線」にしない。
- 日本語本文はかなり静かに。English=LOUD、Japanese=QUIET。英語Typographyがグラフィック、日本語が意味。
- Grid: 本文=container内、Typography/Image=container外という役割分担。全部中央containerに収めない。
- 余白: 広め、でも均等にしない。密度の高いCaseのあと大きな空白、などリズムを作る。
- 色: ブランドカラー基本維持を検討。色数は background / text / secondary / accent 程度に絞る。色で"AI"を表現しない（青紫禁止）。
- 背景Texture: 非常に薄い紙 / grain / 印刷 / scan。Digital GlitchでなくEditorial / Print寄り。

## 50-55. 写真 / Motion

- 綺麗なStock Photo禁止。実際の制作物 / 試作品 / PC画面 / ノート / プロダクト / 作業中の断片。多少荒くても**本物の写真**。
- Motionは控えめ。主役はTypography。scroll連動の横移動 / reveal / crop / image scale / subtle parallax程度。
- エフェクトを見せるのではなく**情報の順番を演出する**: Hero=ブランド、Case=実物、How=思考、Contact=静か。
- Smooth Scrollは必要なら軽く。Scroll hijack禁止。Pin多用禁止。
- Hover: Case画像=微scale、Link=underline/shift、CTA=少し文字が動く。magnetic button不要。
- Custom cursor基本不要。Web Award感を出しすぎない。

## 56-61. Mobile / Performance / A11y / SEO / OG

- Mobileは重要。巨大Typographyは残す（INTERVENTIONは大胆にcrop可）。Case画像を大きく。PCの2カラムを縦に並べただけは禁止、Mobile専用のリズムを作る。
- 画像はWebP/AVIF。Hero preload、その他lazy load。Animationはtransform/opacity中心。新規Animation Libraryは安易に追加しない。
- prefers-reduced-motion / Keyboard / Focus / Contrast。巨大装飾Typographyはaria-hidden。
- SEO: Title/Descriptionを抽象思想だけにしない。検索結果で「Intervention Works — AI / Product / Strategy / Engineering」程度、何をしているか分かるように。
- OG: INTERVENTION WORKS + 魂の震えに、介入せよ。 + 代表的なVisual。

## 62-67. コピー全体のルール

- 一文を短く。言い切る。無駄に煽らない。
- NG: 「革新的なソリューションを提供します」「最先端AIテクノロジーを活用し〜」「ワンストップで支援〜」
- 方向: 「要望を、そのまま作らない。」「まず、前提を疑う。」「資料より、動くもの。」「作って終わらない。」短く、実務に繋がる思想。
- 「魂の震え」は残す（ブランドの癖として強い）。ただしサイト中で繰り返さない。HeroとFooter程度。
- 思想:実物:サービス説明 = **40 : 40 : 20**。思想100で反応が弱かったならサービス説明100に戻すのではなく**実物を増やす**。ここが最重要。
- 営業臭を消す方法: 営業コピーを消すだけではダメ。代わりに実績・実物・思考・プロセス・人柄を見せる。
- 信頼の作り方: 「実績多数」「豊富な経験」禁止。何を作ったか、なぜ作ったか、どう動いているか。

## 68-70. Case個別

- BECKYは能力全部入りのCase（Concept / AI / Development / Infrastructure / Automation / Media / Operation）。BECKYサイトへの誘導だけで終わらず、**何を設計したのか**をIntervention側でも説明する。
- Tool系（Vibe-Guard等）はGitHubリンク一覧にしない。「なぜ作ったか」を一言入れる。
- Case詳細ページは将来的にはあってもよいが今回必須ではない。Topだけでも1Caseにつき Problem / Approach / Output が分かる程度に。

## 71-73. Navigation / Header / Footer

- Navigation: WORK / CAPABILITIES / APPROACH / ABOUT / TALK 程度に整理。
- Header: Logoは小さく。透明 or background minimal。Scroll後も邪魔しない。
- Footer: 静か。INTERVENTION WORKS / Tokyo / X / note / 魂の震えに、介入せよ。程度。

## 74. ページ全体の感情曲線（最重要UX）

Hero「なんだこれ」→ Case「ちゃんと作ってる」→ Capabilities「これ頼めるのか」→ Approach「考え方も合いそう」→ About「誰がやってるんだろう」→ Contact「ちょっと話してみるか」

## 75. 完成判定

5秒「なんか洗練されてる」/ 15秒「企画とかAIとか開発やってるのね」/ 30秒「普通の制作会社とは違いそう」/ 60秒「実際に作ってるもの面白い」/ 90秒「自分の案件ちょっと相談してみようかな」

## 76. 最重要指標

**Contactまで行く心理的距離を短くすること。** CTAを増やして短くするのではなく、信頼と興味で短くする。

## 77. 今回やらないこと

Blog追加 / 大量FAQ / Price表 / Client logo wall / Testimonials大量追加 / Animation library追加 / 3D / WebGL / Chatbot / AI Demo / ダッシュボードUI / 無意味な実績数値

## 78. P0（絶対にやる）

1. Hero再設計 2. 情報構造変更 3. Records → Selected Interventions 4. Caseの大判Editorial化 5. Service → Capabilities化 6. Intervene/Tremble/Relateの再設計 7. About短縮 8. Contactの心理障壁低下 9. Typography再設計 10. Mobile最適化

## 79. P1（重要）

11. Case Visual改善 12. Micro interaction 13. Founderの見せ方 14. Brand Vocabulary演出 15. OG改善

## 80. P2（余力があれば）

16. Case Detail 17. Motion細部 18. 写真追加 19. Case metadata 20. ページ遷移

## 81. 実装前に提出

いきなりコード変更しない。現状調査 + 設計16項目（現状構造/Component/Font/Animation/素材/Hero案/ページ構成/SI構成/CaseごとのVisual案/Capabilities/How/Contact/Desktop wireframe/Mobile wireframe/修正対象/新規依存）を提示。

## 最終コンセプト

Intervention Worksは、仕事を列挙するサイトではない。思想だけ語るサイトでもない。**「この人たちは、物事を普通と少し違う角度から見て、ちゃんと最後まで作る。」** そう感じるサイトにする。

洗練されている。少し変。でも仕事は堅い。説明しすぎない。でも何を頼めるかは分かる。そして最後に **「ちょっと話してみたい。」** が残ること。それが今回の完成条件。
