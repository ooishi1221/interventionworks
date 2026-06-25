---
name: image-gen-bokeh-prompts
description: 画像生成（Gemini / Stable Diffusion等）でボケ/被写界深度を使うプロンプトチートシート
metadata:
  type: reference
---

# 画像生成：ボケ / 被写界深度プロンプト

出典：むぎ@生成AI全般勉強中（@mugi_AI_Art）

## 基本セット（必ず3つセットで使う）

```
shallow depth of field, soft background bokeh, sharp focus on [主役]
```

## ボケ系キーワード一覧

| キーワード | 効果 |
|---|---|
| `shallow depth of field` | 浅い被写界深度。背景がぼけやすい |
| `cinematic depth of field` | 映画的なピント表現 |
| `soft background bokeh` | 背景のやわらかいボケ |
| `foreground blur` | 前景のぼかし（奥行きが出る） |
| `blurred background` | ぼけた背景 |
| `lens bokeh` | レンズ由来のボケ感 |
| `out-of-focus lights` | ピントの外れた光（玉ボケ） |
| `85mm portrait lens` | ポートレート写真風 |
| `macro photography` | 近接撮影風（食べ物・小物に） |

## 用途別テンプレート

### 人物ポートレート（夜・映画風）
```
cinematic anime portrait, sharp focus on her eyes and face, soft background bokeh, blurred neon lights, shallow depth of field, 85mm portrait lens, cinematic lighting
```

### ファンタジー（前景ボケ）
```
fantasy illustration, sharp focus on the character, foreground leaves softly blurred, dreamy background bokeh, glowing magical particles out of focus, shallow depth of field
```

### 食べ物・商品写真
```
premium photography, sharp focus on [商品], creamy background bokeh, softly blurred background, shallow depth of field, macro photography, natural window light
```

### 光の演出（玉ボケ）
```
sharp focus on [主役], out-of-focus lights, soft bokeh lights, blurred neon/lantern lights
```

## 注意

- `extreme blur` / `heavy blur` / `completely blurred` は全体がぼやけすぎるので危険
- 必ず `sharp focus on [どこをくっきり見せたいか]` とセットで書く
- Gemini（Flash）でも `shallow depth of field` + `soft background bokeh` 入れるだけで効果が出る

## 使用例（実績）

- 2026-06-19 詩集「消えても、いた。」noteカバー画像（Gemini生成）
  → 意図せず `out-of-focus lights` の効果が出ていた
