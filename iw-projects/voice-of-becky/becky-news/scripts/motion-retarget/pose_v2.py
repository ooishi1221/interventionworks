"""RGB動画で姿勢推定（精度重視）+ depth動画から前後情報 → motion_params2.json

v1の反省: 体はステージ移動(位置/スケール/回転)で表現するため、絶対座標系の
body_x/body_y/scale素材と、軸対称で±180曖昧さのない lean を出す。
"""
import cv2
import json
import numpy as np
import mediapipe as mp

RGB = "/Users/yuji.ooishi/Desktop/ダウンロード.mp4"
DEPTH = "/Users/yuji.ooishi/Desktop/ダウンロード_depth.mp4"
OUT = "/private/tmp/claude-501/-Volumes-SSD2TB-interventionworks/f424b87d-433d-450f-84c5-dac04ca3fc11/scratchpad/depth/motion_params2.json"

mp_pose = mp.solutions.pose
pose = mp_pose.Pose(static_image_mode=False, model_complexity=1,
                    min_detection_confidence=0.3, min_tracking_confidence=0.3)

cap_rgb, cap_d = cv2.VideoCapture(RGB), cv2.VideoCapture(DEPTH)
fps = cap_rgb.get(cv2.CAP_PROP_FPS)
frames, detected, i = [], 0, 0

def axis_angle(dy: float, dx: float) -> float:
    """線分の傾き（度）を (-90, 90] に正規化。左右の取り違えに影響されない"""
    a = np.degrees(np.arctan2(dy, dx))
    return ((a + 90) % 180) - 90

while True:
    ok, img = cap_rgb.read()
    ok_d, img_d = cap_d.read()
    if not ok:
        break
    res = pose.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
    if res.pose_landmarks:
        detected += 1
        lm = res.pose_landmarks.landmark
        L = mp_pose.PoseLandmark
        l_sh, r_sh = lm[L.LEFT_SHOULDER], lm[L.RIGHT_SHOULDER]
        l_hip, r_hip = lm[L.LEFT_HIP], lm[L.RIGHT_HIP]
        sh_cx, sh_cy = (l_sh.x + r_sh.x) / 2, (l_sh.y + r_sh.y) / 2
        hip_cy = (l_hip.y + r_hip.y) / 2
        # 前後: depth動画の胸元の明るさ（フレームずれは±1程度なので同indexでOK）
        depth_z = 0.5
        if ok_d and img_d is not None:
            h, w = img_d.shape[:2]
            dx_, dy_ = int(sh_cx * w), int(min(sh_cy + 0.05, 0.99) * h)
            patch = img_d[max(0, dy_-12):dy_+12, max(0, dx_-12):dx_+12]
            if patch.size:
                depth_z = float(patch.mean()) / 255
        frames.append({
            "t": i / fps,
            "body_x": sh_cx,                       # 画面内の左右位置 → ステージX
            "body_y": sh_cy,                       # 上下（跳ね） → ステージY
            "torso_len": abs(hip_cy - sh_cy),      # 屈み/伸び の補助
            "lean": axis_angle(r_sh.y - l_sh.y, r_sh.x - l_sh.x),  # 肩線の傾き → ステージ回転
            "depth_z": depth_z,                    # 前後 → ステージスケール
        })
    i += 1
cap_rgb.release(); cap_d.release()

print(f"検出率: {detected}/{i} ({detected/i*100:.0f}%)")
with open(OUT, "w") as f:
    json.dump(frames, f)
arr = lambda k: np.array([fr[k] for fr in frames])
for k in ("body_x", "body_y", "lean", "depth_z"):
    a = arr(k)
    print(f"{k}: min={a.min():.3f} max={a.max():.3f} 振れ幅={a.max()-a.min():.3f}")
assert detected / i > 0.8, "RGB姿勢推定の検出率が低すぎる"
