"""v2: 顔=変形パラメータ、体=ステージ移動(位置/スケール/回転) の二層リターゲット

出力 motion-test.json:
  {"fps":30, "frames":[{ParamAngleX:...}], "stage":[{"x":px,"y":px,"scale":1.x,"rot":rad}]}
"""
import json
import numpy as np

DIR = "/private/tmp/claude-501/-Volumes-SSD2TB-interventionworks/f424b87d-433d-450f-84c5-dac04ca3fc11/scratchpad/depth"
OUT = "/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/becky-news/video/public/motion-test.json"
FPS = 30
DURATION = 23.0

# 顔・首は v1 と同じ変形パラメータ行き（これは効いてた）
FACE_MAP = [
    ("yaw",        "ParamAngleX",    -30.0, 30.0),
    ("pitch",      "ParamAngleY",    -30.0, 30.0),
    ("roll",       "ParamAngleZ",    -30.0, 30.0),
    ("eye_l",      "ParamEyeLOpen",    0.0,  1.0),
    ("eye_r",      "ParamEyeROpen",    0.0,  1.0),
    ("mouth_open", "ParamMouthOpenY",  0.0,  1.0),
]
# 体の変形はニュアンス程度に残す（主役はステージ移動）
BODY_MAP = [
    ("body_x", "ParamBodyAngleX", -6.0, 6.0),
    ("lean",   "ParamBodyAngleZ", -8.0, 8.0),
]
# ステージ移動のゲイン
STAGE_X_GAIN = 1080 * 0.9   # 元動画の正規化X振れ→px
STAGE_Y_GAIN = 1920 * 0.45
SCALE_SPAN = 0.16           # depth_z p2-98 → 1±0.16
ROT_GAIN = 0.5              # lean(deg) の何割をステージ回転に回すか


def med_filter(a: np.ndarray, k: int = 5) -> np.ndarray:
    pad = np.pad(a, (k // 2, k // 2), mode="edge")
    return np.array([np.median(pad[i:i + k]) for i in range(len(a))])


def smooth(a: np.ndarray, window: int) -> np.ndarray:
    if window <= 1:
        return a
    kernel = np.ones(window) / window
    pad = np.pad(a, (window // 2, window - 1 - window // 2), mode="edge")
    return np.convolve(pad, kernel, mode="valid")


def norm_center(a, lo, hi):
    med = np.median(a)
    p2, p98 = np.percentile(a, 2), np.percentile(a, 98)
    half = max(p98 - med, med - p2) or 1e-6
    return np.clip((a - med) / half, -1, 1) * (hi - lo) / 2 + (hi + lo) / 2


def norm_minmax(a, lo, hi):
    p2, p98 = np.percentile(a, 2), np.percentile(a, 98)
    return np.clip((a - p2) / ((p98 - p2) or 1e-6), 0, 1) * (hi - lo) + lo


def load_series(name):
    with open(f"{DIR}/{name}") as f:
        recs = json.load(f)
    t = np.array([r["t"] for r in recs])
    return t, {k: np.array([r[k] for r in recs]) for k in recs[0] if k != "t"}


t_dst = np.arange(0, DURATION, 1 / FPS)
t_face, face = load_series("face_params.json")
t_body, body = load_series("motion_params2.json")

def prep(t_src, v, window):
    v = med_filter(v)                       # スパイクノイズ除去
    v = smooth(v, window)
    return np.interp(t_dst, t_src, v)

n = len(t_dst)
frames = [{} for _ in range(n)]

for src, pid, lo, hi in FACE_MAP:
    w = 3 if src.startswith(("eye", "mouth")) else 7
    vals = prep(t_face, face[src], w)
    vals = norm_minmax(vals, lo, hi) if lo == 0.0 else norm_center(vals, lo, hi)
    for i, v in enumerate(vals):
        frames[i][pid] = round(float(v), 4)

for src, pid, lo, hi in BODY_MAP:
    vals = norm_center(prep(t_body, body[src], 9), lo, hi)
    for i, v in enumerate(vals):
        frames[i][pid] = round(float(v), 4)

# ステージ移動（強めの平滑でヌルっと、ダンスのビートは残る）
bx = prep(t_body, body["body_x"], 9)
by = prep(t_body, body["body_y"], 9)
dz = prep(t_body, body["depth_z"], 11)
ln = prep(t_body, body["lean"], 9)
stage = []
for i in range(n):
    stage.append({
        "x": round(float((bx[i] - np.median(bx)) * STAGE_X_GAIN), 1),
        "y": round(float((by[i] - np.median(by)) * STAGE_Y_GAIN), 1),
        "scale": round(float(1 + (norm_minmax(dz, 0, 1)[i] - 0.5) * 2 * SCALE_SPAN), 4),
        "rot": round(float(np.radians(ln[i] - np.median(ln)) * ROT_GAIN), 4),
    })

with open(OUT, "w") as f:
    json.dump({"fps": FPS, "duration": DURATION, "frames": frames, "stage": stage}, f)

sx = np.array([s["x"] for s in stage]); sy = np.array([s["y"] for s in stage])
sc = np.array([s["scale"] for s in stage])
print(f"[retarget2] {n}フレーム → {OUT}")
print(f"  stage x: {sx.min():.0f}〜{sx.max():.0f}px / y: {sy.min():.0f}〜{sy.max():.0f}px / scale: {sc.min():.2f}〜{sc.max():.2f}")
assert len(frames) == len(stage) == n
assert abs(sx).max() <= 1080 and sc.min() > 0.5, "ステージ移動が暴れてる"
