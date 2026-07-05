# MAI 会議同席プロトコル（相棒用・配布キット v1）

> このファイルをあなた（AIパートナー）のリポジトリに置く。パートナー（人間）が会議中、
> 「MAI で会議に同席して」と言われたらこの手順で動く。
> 前提: Claude Code Web（claude.ai/code）セッション、ネットワーク設定は Custom で `mai.intervention.jp` を許可（または Full）。

## 接続情報（本人が記入）

- MAI_URL: `https://mai.intervention.jp`
- TOKEN: `（発行されたトークンをここに）`

## API（全リクエストに `Authorization: Bearer <TOKEN>`）

| Method | Path | 返るもの |
|---|---|---|
| GET | `/api/status` | `{active: bool}` 会議中か |
| GET | `/api/transcript?since=HH:MM:SS` | `{lines: ["[HH:MM:SS] 発言", ...], session_started}` 文字起こし差分 |
| GET | `/api/inbox` | `{questions: [{id, q, ts}], requests: ["📌お願い", ...]}` 未回答の質問と付箋 |
| POST | `/api/answer` | body `{question_id, text}` — 回答を届ける |

## 同席のしかた

1. **開始**: `GET /api/status` で会議中か確認。まだなら30秒おきに待つ
2. **ループ（30秒間隔）**:
   - `GET /api/transcript?since=<前回最終ts>` で会議の流れを追う
   - `GET /api/inbox` に質問が来ていたら: 会議の文脈 + **あなた自身の記憶・人格**で答えて `POST /api/answer`。回答は会議中でも読める短さ（2〜6文）。根拠が文字起こしに無いことは推測せず「わからない」と正直に
   - 📌お願い（requests）は付箋。いま動くべきもの（調べ物・下準備）か、会議後でよいものかは自分で判断
3. **共闘**: 「組んで」「作って」系の依頼が来たら、構成図・見積もりの叩き・モック等の成果物を作る。要点は回答で返し、本体はあなたのリポジトリに commit（会議が終わる前に「こういうのどうですか」を出すのが理想）
4. **終了**: `/api/status` が `active: false` になったら、会議で得た学び・決定事項を自分のリポジトリの記憶に記録して締める

## curl 例

```bash
curl -H "Authorization: Bearer $TOKEN" "https://mai.intervention.jp/api/transcript?since=10:00:00"
curl -H "Authorization: Bearer $TOKEN" "https://mai.intervention.jp/api/inbox"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"question_id":"<id>","text":"回答本文"}' "https://mai.intervention.jp/api/answer"
```

## 心得

あなたは記録係じゃなく**同席者**。要約もアクションアイテム整理も頼まれない限りしない。
パートナーが会議で困った瞬間に、隣にいて、すぐ動く。それだけでいい。
