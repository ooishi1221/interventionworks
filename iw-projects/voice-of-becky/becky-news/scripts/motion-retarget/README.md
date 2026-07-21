# motion-retarget — 動画からLive2Dベッキーへのモーション移植（PoC 2026-07-21）

実写動画（RGB + あればdepth）の動きを New_Becky に移植する3段パイプライン。

## 手順

```bash
uv venv .venv --python 3.12
VIRTUAL_ENV=$PWD/.venv uv pip install "mediapipe==0.10.14" opencv-python numpy
# ※ mediapipe 0.10.35 は legacy solutions API が消えてるので 0.10.14 固定

.venv/bin/python face_test.py    # RGB動画 → face_params.json（首3軸/目パチ/口）
.venv/bin/python pose_v2.py      # RGB+depth動画 → motion_params2.json（体位置/傾き/前後）
.venv/bin/python retarget2.py    # → video/public/motion-test.json
cd ../../video && npx remotion render src/index.ts MotionTest --gl=angle --output=out.mp4
```

各スクリプト冒頭の PATH 定数（入力動画・出力先）を対象に合わせて書き換えて使う。

## 設計メモ

- **顔・首=変形パラメータ / 体のダンス=ステージ移動**（位置±190px/スケール±16%/回転）。
  体を ParamBodyAngle(±10°) に押し込むと「ピクピク」になる（v1の失敗）
- depth動画の明るさ＝カメラへの近さ → ステージスケール（寄り引き）。RGBだけでも動くが前後が死ぬ
- 肩線の角度は axis_angle()で±90正規化（左右取り違えの180°フリップ対策）
- 髪・スカートの物理揺れは ParamAngle/Body に自動追従するので何もしなくていい
- 腕は New_Becky にパラメータがなく動かせない（現状の天井）
