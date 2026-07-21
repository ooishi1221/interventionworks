"""RGB元動画で FaceMesh が通るか検証 → 顔系Live2Dパラメータの取得可能性を測る"""
import cv2
import json
import numpy as np
import mediapipe as mp

VIDEO = "/Users/yuji.ooishi/Desktop/ダウンロード.mp4"
OUT_DIR = "/private/tmp/claude-501/-Volumes-SSD2TB-interventionworks/f424b87d-433d-450f-84c5-dac04ca3fc11/scratchpad/depth"

mp_face = mp.solutions.face_mesh
face = mp_face.FaceMesh(static_image_mode=False, max_num_faces=1,
                        refine_landmarks=True, min_detection_confidence=0.3,
                        min_tracking_confidence=0.3)

cap = cv2.VideoCapture(VIDEO)
fps = cap.get(cv2.CAP_PROP_FPS)
frames, detected, i = [], 0, 0

def dist(a, b):
    return float(np.hypot(a.x - b.x, a.y - b.y))

while True:
    ok, img = cap.read()
    if not ok:
        break
    res = face.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if res.multi_face_landmarks:
        detected += 1
        lm = res.multi_face_landmarks[0].landmark
        # 顔の基準幅（左右こめかみ 234-454）で正規化
        fw = dist(lm[234], lm[454]) or 1e-6
        # 目の開き: 上瞼/下瞼 (159,145)=左, (386,374)=右
        eye_l = dist(lm[159], lm[145]) / fw
        eye_r = dist(lm[386], lm[374]) / fw
        # 口の開き: 上唇13 / 下唇14、横は 61-291
        mouth_open = dist(lm[13], lm[14]) / fw
        mouth_wide = dist(lm[61], lm[291]) / fw
        # 頭の向き: 鼻先1 と 顔中心のオフセット + こめかみ線の傾き
        cx = (lm[234].x + lm[454].x) / 2
        cy = (lm[234].y + lm[454].y) / 2
        yaw = (lm[1].x - cx) / fw          # 左右 → ParamAngleX
        pitch = (lm[1].y - cy) / fw        # 上下 → ParamAngleY
        roll = np.degrees(np.arctan2(lm[454].y - lm[234].y, lm[454].x - lm[234].x))  # → ParamAngleZ
        frames.append({"t": i / fps, "eye_l": eye_l, "eye_r": eye_r,
                       "mouth_open": mouth_open, "mouth_wide": mouth_wide,
                       "yaw": yaw, "pitch": pitch, "roll": roll})
    i += 1
cap.release()

print(f"顔検出率: {detected}/{i} フレーム ({detected/i*100:.0f}%)")
if frames:
    with open(f"{OUT_DIR}/face_params.json", "w") as f:
        json.dump(frames, f)
    arr = lambda k: np.array([f[k] for f in frames])
    for k in ("eye_l", "mouth_open", "yaw", "roll"):
        a = arr(k)
        print(f"{k}: min={a.min():.3f} max={a.max():.3f} 振れ幅={a.max()-a.min():.3f}")
    # まばたき回数のラフ推定（eye_l が平均の半分を下回る谷の数）
    e = arr("eye_l")
    th = e.mean() * 0.55
    blinks = int(((e[:-1] >= th) & (e[1:] < th)).sum())
    print(f"まばたき検出（ラフ）: {blinks}回 / 23秒")

assert i > 0, "動画が読めていない"
