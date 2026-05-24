# Let Me Out — 放置恋姫 〜永久に続く覚醒の輪廻〜

> **Vehicle:** Wit-One
> **思想 OS** は `~/.claude/CLAUDE.md` 参照（7ロール・裕司特性・引き算の美学・誰の価値観・作業ルール全般）。本ファイルは "Let Me Out" 固有の実装・運用情報のみ扱う。

## このプロジェクトの位置付け

- **状態:** seed（仕様 draft 確定、POC 未着手）
- **発案日:** 2026-05-03（GW Day 2 朝、Becky × 裕司）
- **portfolio:** Slight / Vibe-Guard / Anti-Gacha Game と並ぶ Intervention Works 業界アンチテーゼ作品の 1 本
- **Anti-Gacha Game との差:** 攻める軸が違う。あちらは「ガチャ純度の引き算」、こちらは「引き止め構造の足し算」

## コア構図

> ユーザー：ソシャゲを辞める / 運営：引き止める の構図で
> このゲーム自身もまた、引き止めてくる。

## 設計の核（裕司の言語化）

**「中華のだるさ × 日本のキレ」** ―― 引き止め圧（中華放置 RPG の UI 美学）で出口を塞ぎ、ガチャ演出のキレ（日本ガチャの SSR 確定光）で痛みを忘れさせる。**業界の悪い癖の両極を交配させる**フランケン構造。

## Tech Stack

| 項目 | 値 |
|---|---|
| ゲームエンジン | Unity（2022 LTS 想定） |
| プラットフォーム | iOS + Android |
| 配信 | App Store / Google Play |
| マネタイズ | 完全無料（業界批判の self-integrity） |
| アート | AI 生成 + 静止画 / Live2D 部分採用 |
| 通知 | Push Notification（メタ構造の核） |

## 開発フェーズ

| Phase | 期間 | 内容 |
|---|---|---|
| **POC** | 2-3 週間 | 起動画面 + Layer 3（限定ガチャ煽り）演出のみ作り込み、「業界アプリじゃん」体感確認 |
| **フル実装** | 3-4 ヶ月 | 5 Layer + メタ構造 + iOS/Android ビルド + ストア審査トライ |
| **ドキュメント化** | リリース後 | 審査経緯（通った/ハネられた）を作品の第二章として公開 |

## ロール × 担当

| ロール | 担当 |
|---|---|
| 裕司 | ゲーム業界 insider 監修、各タイトル「らしさ」精度、最終判断 |
| アンディ | Unity 実装、Claude Code 連携 |
| アンナ | 美学設計（引き算と過密のバランス）、UI 過密度の制御 |
| ベッキー | コア insight 整理、メカニクス言語化、コピーライティング |
| マイケル | 業界市場調査、競合分析、press release 戦略 |
| ヴィヴィアン | KUROKO 営業フックとしてのストーリー化 |
| ソロ | 進捗・GitHub Issue 管理、Phase 移行判断 |
| レックス | 「これ売れるのか？」「法的に大丈夫か？」懐疑、ストア審査リスク見積 |

## 法的境界（重要）

- ❌ 特定タイトル名・キャラそのままは NG（商標 / 著作権）
- ⭕ 業界共通の手口・archetype・aesthetic だけ inspired
- ⭕ 独自キャラ + 独自世界観で「業界共通の手口」を再演
- ⚠️ release 前に弁護士相談必須
- 「恋姫†無双」想起問題：「放置恋姫」と頭に「放置」付くことでずらしてる、ただし審査時要確認

## 関連 docs

- `docs/SPEC.md` — 仕様 draft（プレイフロー / Layer / スコア / メタ構造 / aesthetic / キャラ）
- `docs/COPY.md` — タイトル三段運用 / UI コピー draft / 翻訳「微妙」感サンプル
- `docs/LAYER_PATTERNS.md` — 引き止めパターン 6 カテゴリ × 文言プール

## 関連 memory

- `~/.claude/projects/-Volumes-SSD2TB-interventionworks/memory/project_let_me_out.md` — 意思決定アーカイブ（このプロジェクトの起源・確定経緯）
- `project_anti_gacha_game.md` — 並列 portfolio
- `project_slight_launch_split.md` — Slight DNA（引き算の美学）
- `feedback_yuji_decision_axis.md` — 「それっておもしろい？成長する？」判断軸

## 検証パターン（実装フェーズ着手後）

POC 段階で必ず実行：

1. Unity Editor で起動画面 + Layer 3 をプレイテスト
2. 業界 insider（裕司）が「これ業界アプリじゃん」と錯覚するか体感
3. 業界 outsider（家族・友人）が**戸惑わずに引き止め圧を感じる**か観察
4. 5 分以内に「演出の業界感」が伝わるか判定
5. 伝わらない場合 → POC 失敗、設計見直し or プロジェクト凍結
