#!/usr/bin/env python3
"""record-episode.py — BECKY CRAFT テスト実況動画を1コマンドで生成。

viewer(:3007) を Playwright で録画しながら becky_brain.run_episode を回し、
各ターンの speech を AivisSpeech(コハク) で wav 化 → 経過秒を記録 →
ffmpeg で adelay+amix 合成して mp4 に焼く。

使い方: python3 record-episode.py [--max-calls 30] [--out becky-craft-test-001.mp4]
"""
import argparse
import json
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
CRAFT = HERE.parent
sys.path.insert(0, str(CRAFT / "brain"))
from becky_brain import run_episode  # noqa: E402

VIEWER_URL = "http://localhost:3007"
AIVIS_URL = "http://localhost:10101"
AIVIS_SPEAKER = 1878365376  # コハク / ノーマル（becky-cast/cast.py と同じ）
AIVIS_PARAMS = {"speedScale": 1.0, "prePhonemeLength": 0.18, "postPhonemeLength": 0.18}

EP_NUM = "003"
EP_TITLE = "深く潜る — 地下世界と、はじめての鉄"
GOAL = ("今日はエピソード3の本番収録。"
        "【前回までのあらすじ】EP.001: 初日を生き延びた（丸太集め、夜の土シェルター）。"
        "EP.002: はじめてのクラフトで木のツルハシを完成させた（何度もツルハシが消える怪現象に"
        "「ラグ！絶対ラグ！」と騒いだ末に完成）。夜にドラウンド3体に囲まれて体力7まで削られた。"
        "EDで「次回、私が本当に深く潜る」と視聴者に宣言済み——今日はその約束を果たす回。"
        "【今日の目標】地下へ潜って、はじめての鉄(iron_ore)を掘る。"
        "手順の目安: 石(stone)を掘って cobblestone を集める → craft stone_pickaxe（丸石3+棒2）→ "
        "地下や洞窟へ潜る → iron_ore を見つけて掘る。深さは y が観測に出ている（y<40 が地下の目安）。"
        "溶岩(lava)は即死級、見えたら全力で騒いで避ける。"
        "【オープニングの定型】一言目は必ず「はろー、ベキたんです！ベッキークラフト、第3回、いっくよー！」"
        "から始めて、前回の約束（深く潜る）に触れてから出発する。"
        "観測の broadcast.remaining_sec が放送の残り秒数。残り90秒を切ったら今日の成果を"
        "振り返って締めに入り、最後のセリフは必ず「バイバイ」で終えて action は stop を選ぶこと。"
        "それまでは絶対に締めない")
HUD_GOAL = "深く潜って、はじめての鉄を掘れ"
SE_FILES = {"jajan": "jajan.wav", "dodon": "dodon.wav", "pico": "pico.wav", "chin": "chin.wav"}
SE_DIR = CRAFT.parent / "becky-news" / "episodes" / "zatsudan-000"
OPED_DIR = CRAFT / "assets" / "op-ed"


# 声のトンマナ共通基盤（正本: voice-of-becky/docs/voice-tone-design.md）
sys.path.insert(0, str(CRAFT.parent / "stackchan-bridge"))
from becky_voice import voice_to_aivis  # noqa: E402


def tts(text: str, out_path: Path, voice: dict | None = None):
    q = urllib.parse.urlencode({"text": text, "speaker": AIVIS_SPEAKER})
    req = urllib.request.Request(f"{AIVIS_URL}/audio_query?{q}", method="POST")
    with urllib.request.urlopen(req, timeout=30) as res:
        query = json.loads(res.read())
    query.update(AIVIS_PARAMS)
    if voice:
        query.update(voice_to_aivis(voice))
    q2 = urllib.parse.urlencode({"speaker": AIVIS_SPEAKER})
    req2 = urllib.request.Request(
        f"{AIVIS_URL}/synthesis?{q2}",
        data=json.dumps(query).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req2, timeout=120) as res:
        out_path.write_bytes(res.read())


def wav_duration(p: Path) -> float:
    with wave.open(str(p), "rb") as w:
        return w.getnframes() / w.getframerate()


def episode_summary(events: list, deaths: int) -> dict:
    """収録ログから ED リザルト用のハイライト等を1コールで生成する。"""
    import anthropic
    sys.path.insert(0, "/Volumes/SSD2TB/interventionworks/iw-projects/voice-of-becky/stackchan-bridge")
    from stop_hook_tts import load_config
    cfg = load_config() or {}
    client = anthropic.Anthropic(api_key=cfg.get("becky_api_key", "").strip() or None)
    speeches = "\n".join(e["speech"] for e in events)
    schema = {"type": "object", "properties": {
        "highlight": {"type": "string"}, "death_comment": {"type": "string"},
        "next_tease": {"type": "string"},
        "youtube_titles": {"type": "array", "items": {"type": "string"}}},
        "required": ["highlight", "death_comment", "next_tease", "youtube_titles"],
        "additionalProperties": False}
    fallback = {"highlight": "今日も生きて冒険した", "death_comment": "ノーコメント",
                "next_tease": "つづく。たぶん明日",
                "youtube_titles": ["【BECKY CRAFT】今日も生きて冒険した"] * 3}
    try:
        msg = client.messages.create(
            model="claude-sonnet-5", max_tokens=1000,
            messages=[{"role": "user", "content":
                       f"ベッキーのマイクラ実況エピソードの全セリフ:\n{speeches}\n\nデス数: {deaths}回\n\n"
                       "エンディングのリザルト画面用に、highlight（今日のハイライト、15字以内）、"
                       "death_comment（デス数の後ろに付ける一言、10字以内、括弧なし。0回なら強がり、1回以上なら言い訳）、"
                       "next_tease（次回エピソードの煽りタイトル、18字以内、番号は書かない、ベッキーの一人称は私）、"
                       "youtube_titles（YouTube動画タイトル案3つ。ゲーム実況らしくキャッチーに、"
                       "『【BECKY CRAFT】』で始めて、名場面やヘタレ・絶叫を煽り文句に使う。実在の人名禁止）をJSONで返して"}],
            extra_body={"output_config": {"format": {"type": "json_schema", "schema": schema}}},
        )
        text = next((b.text for b in msg.content if b.type == "text"), None)
        if not text:
            print(f"[oped] summary 応答が空 (stop={msg.stop_reason}) → fallback", flush=True)
            return fallback
        return json.loads(text)
    except Exception as e:
        print(f"[oped] summary 生成失敗 ({e}) → fallback", flush=True)
        return fallback


def build_youtube_cut(webm_mp4: Path, events: list, deaths: int, out_path: Path, out_dir: Path):
    """本編を頭トリミングし、OP/ED を挟んで YouTube 用 mp4 を作る。"""
    from playwright.sync_api import sync_playwright

    # 1) OP にエピソード番号/タイトル、ED にリザルトを自動記入 → スクショ
    summary = episode_summary(events, deaths)
    print(f"[oped] summary: {summary}", flush=True)
    next_num = f"{int(EP_NUM) + 1:03d}"
    survive = events[-1]["t"] + events[-1]["dur"] - max(0.0, events[0]["t"] - 3.0)

    op_html_src = (OPED_DIR / "opening.html").read_text(encoding="utf-8")
    op_html_src = op_html_src.replace("EP.001", f"EP.{EP_NUM}")
    op_html_src = op_html_src.replace("はじまりの日 — 初日を生き延びろ", EP_TITLE)
    op_html = out_dir / "opening_filled.html"
    op_html.write_text(op_html_src, encoding="utf-8")
    op_png = out_dir / "opening_filled.png"

    html = (OPED_DIR / "ending.html").read_text(encoding="utf-8")
    html = html.replace("10分32秒", f"{int(survive) // 60}分{int(survive) % 60:02d}秒")
    html = html.replace("1回（クリーパー、許さない）", f"{deaths}回（{summary['death_comment']}）")
    html = html.replace("初めての鉄鉱石", summary["highlight"])
    # LLM が煽り文に自分で「EP.xxx」を入れてくることがある（テンプレ側と二重になる）
    import re as _re
    tease = _re.sub(r"[!！]?\s*EP\.?\s*\d+", "", summary["next_tease"]).strip("！!、。 ")
    html = html.replace("EP.002", f"EP.{next_num}")
    html = html.replace("道具を作りたい私、レシピを知らない", tease)
    ed_html = out_dir / "ending_filled.html"
    ed_html.write_text(html, encoding="utf-8")
    ed_png = out_dir / "ending_filled.png"
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1280, "height": 720})
        for src, dst in ((op_html, op_png), (ed_html, ed_png)):
            pg.goto(f"file://{src.resolve()}")
            pg.wait_for_timeout(1500)  # Webフォント待ち
            pg.screenshot(path=str(dst))
        b.close()

    # 2) ジャンプカット: セリフ区間（前1.0s/後1.8s パッド）を保護し、長い無言ギャップを捨てる
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", str(webm_mp4)],
        check=True, capture_output=True).stdout)
    total = float(probe["format"]["duration"])
    lead = max(0.0, events[0]["t"] - 3.0)
    segs = []
    for e in events:
        s = max(lead, e["t"] - 1.0)
        t = min(total, e["t"] + e["dur"] + 1.8)
        if segs and s - segs[-1][1] <= 2.5:  # 短いギャップは繋げたまま（カット感を出さない）
            segs[-1][1] = max(segs[-1][1], t)
        else:
            segs.append([s, t])
    kept = sum(t - s for s, t in segs)
    print(f"[cut] 本編 {total - lead:.0f}s → {kept:.0f}s（{len(segs)}セグメント、"
          f"{total - lead - kept:.0f}s をジャンプカット）", flush=True)

    def remap(t_orig):
        """元動画の時刻 → ジャンプカット後の時刻"""
        acc = 0.0
        for s, e_ in segs:
            if t_orig <= e_:
                return acc + max(0.0, t_orig - s)
            acc += e_ - s
        return acc

    # 3) OP(5s) + カット済み本編 + ED(6s) を concat し、SE をリマップ位置に重ねる
    jingle = SE_DIR / "se_jingle.wav"
    se_events = [e for e in events if e.get("se")]
    se_dir = CRAFT / "assets" / "se"
    af = "aformat=sample_rates=44100:channel_layouts=stereo"
    cmd = ["ffmpeg", "-y",
           "-loop", "1", "-t", "5", "-i", str(op_png),
           "-i", str(jingle),
           "-i", str(webm_mp4),
           "-loop", "1", "-t", "6", "-i", str(ed_png)]
    for e in se_events:
        cmd += ["-i", str(se_dir / SE_FILES[e["se"]])]

    parts = [
        f"[0:v]scale=1280:720,setsar=1,fps=25,fade=t=in:st=0:d=0.5,fade=t=out:st=4.5:d=0.5[v0]",
        f"[1:a]{af},apad=whole_dur=5,asplit=2[a0][aed]",
        f"[3:v]scale=1280:720,setsar=1,fps=25,fade=t=in:st=0:d=0.5,fade=t=out:st=5.5:d=0.5[v2]",
        f"[aed]atrim=0:6,apad=whole_dur=6,volume=0.6[a2]",
    ]
    for i, (s, t) in enumerate(segs):
        parts.append(f"[2:v]trim={s:.3f}:{t:.3f},setpts=PTS-STARTPTS,scale=1280:720,setsar=1,fps=25[sv{i}]")
        parts.append(f"[2:a]atrim={s:.3f}:{t:.3f},asetpts=PTS-STARTPTS,{af}[sa{i}]")
    seg_in = "".join(f"[sv{i}][sa{i}]" for i in range(len(segs)))
    parts.append(f"{seg_in}concat=n={len(segs)}:v=1:a=1[v1][a1]")
    parts.append(f"[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[vc][ac]")
    if se_events:
        se_labels = []
        for i, e in enumerate(se_events):
            ms = int((5.0 + remap(e["t"])) * 1000)  # OP 5秒 + カット後位置
            parts.append(f"[{4 + i}:a]{af},volume=0.55,adelay={ms}:all=1[se{i}]")
            se_labels.append(f"[se{i}]")
        parts.append(f"[ac]{''.join(se_labels)}amix=inputs={1 + len(se_events)}:normalize=0,"
                     f"alimiter=limit=0.9[aout]")
    else:
        parts.append("[ac]anull[aout]")
    cmd += ["-filter_complex", ";".join(parts), "-map", "[vc]", "-map", "[aout]",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(out_path)]
    subprocess.run(cmd, check=True, capture_output=True)
    print(f"[oped] YouTube cut 完成: {out_path}（SE {len(se_events)}発）", flush=True)
    print("[oped] タイトル案:", flush=True)
    for t_ in summary.get("youtube_titles", []):
        print(f"  - {t_}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-calls", type=int, default=70)
    ap.add_argument("--out", default="becky-craft-test-001.mp4")
    ap.add_argument("--time-budget", type=float, default=None,
                    help="放送尺（秒）。指定すると時間注入+締め誘導+OP/ED付きYouTube cutも生成")
    args = ap.parse_args()

    out_dir = CRAFT / "out"
    wav_dir = out_dir / "wav"
    video_dir = out_dir / "video"
    for d in (wav_dir, video_dir):
        d.mkdir(parents=True, exist_ok=True)

    from playwright.sync_api import sync_playwright

    events = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1280, "height": 720},
            record_video_dir=str(video_dir),
            record_video_size={"width": 1280, "height": 720},
        )
        page = ctx.new_page()
        t0 = time.monotonic()  # 録画は page 生成と同時に始まる
        page.goto(VIEWER_URL)
        page.wait_for_timeout(10_000)  # WebGL 描画待ち（headless は初回真っ白対策）

        # HUD 注入 + 初期状態（goal と現在の observe を先に描く）
        page.add_script_tag(path=str(HERE / "hud.js"))

        def hud(d):
            try:
                page.evaluate("d => window.beckyHud && window.beckyHud.update(d)", d)
            except Exception as e:
                print(f"[hud] update 失敗: {e}", flush=True)

        deaths = [0]
        last_health = [None]

        def hud_obs(obs):
            h = obs.get("health")
            if h is not None:
                if last_health[0] is not None and last_health[0] > 0 and h <= 0:
                    deaths[0] += 1
                last_health[0] = h
            hud({"health": h, "food": obs.get("food"),
                 "inventory": obs.get("inventory", []),
                 "pos": obs.get("position"), "time": obs.get("time")})

        hud({"goal": HUD_GOAL})
        try:
            with urllib.request.urlopen("http://localhost:3008/observe", timeout=10) as r:
                hud_obs(json.loads(r.read()))
        except Exception as e:
            print(f"[hud] 初期 observe 失敗: {e}", flush=True)

        def on_thinking(flag):
            hud({"thinking": flag})
            # 思考中はキョロキョロ首を振る（画角の虚無対策+考えてる仕草の演出）
            try:
                req = urllib.request.Request(
                    "http://localhost:3008/gaze",
                    data=json.dumps({"scan": bool(flag)}).encode(),
                    headers={"Content-Type": "application/json"}, method="POST")
                urllib.request.urlopen(req, timeout=5)
            except Exception:
                pass

        thumb_dir = out_dir / "thumbs"
        thumb_dir.mkdir(exist_ok=True)

        def on_turn(turn, decision, obs):
            hud_obs(obs)
            speech = (decision.get("speech") or "").strip()
            if not speech:
                return 10.0
            wav = wav_dir / f"turn_{turn:03d}.wav"
            try:
                tts(speech, wav, decision.get("voice"))
                dur = wav_duration(wav)
            except Exception as e:
                print(f"[tts] turn {turn} 失敗、スキップ: {e}", flush=True)
                return 10.0
            # t は字幕表示と同時刻に取る（合成音声の adelay と字幕が揃う）
            t = time.monotonic() - t0
            hud({"speech": speech, "inner": (decision.get("inner") or "").strip(),
                 "speechDur": dur})
            se = decision.get("se") or "none"
            events.append({"t": round(t, 3), "wav_path": str(wav),
                           "speech": speech, "dur": round(dur, 3),
                           "se": se if se in SE_FILES else None})
            # サムネ候補: 大絶叫（volume>=1.7）の瞬間のフレームを保存
            if float((decision.get("voice") or {}).get("volume", 1.0)) >= 1.7:
                try:
                    page.screenshot(path=str(thumb_dir / f"ep{EP_NUM}_turn{turn:03d}.png"))
                except Exception:
                    pass
            return max(dur + 2.0, 10.0)  # セリフ被り防止

        run_episode(max_calls=args.max_calls, goal=GOAL, on_turn=on_turn,
                    on_thinking=on_thinking, time_budget=args.time_budget)

        # 最後のセリフが映像内で言い終わるまで録画を延長
        if events:
            tail = events[-1]["t"] + events[-1]["dur"] + 2.0 - (time.monotonic() - t0)
            if tail > 0:
                page.wait_for_timeout(int(tail * 1000))

        video = page.video
        page.close()
        webm = Path(video.path())
        ctx.close()
        browser.close()

    audio_json = out_dir / "episode_audio.json"
    audio_json.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[rec] 録画完了 webm={webm} events={len(events)} → {audio_json}", flush=True)

    # 合成: webm→mp4 + 各 wav を adelay して amix(normalize=0)
    mp4 = out_dir / args.out
    cmd = ["ffmpeg", "-y", "-i", str(webm)]
    for e in events:
        cmd += ["-i", e["wav_path"]]
    if events:
        parts = []
        for i, e in enumerate(events, start=1):
            ms = int(e["t"] * 1000)
            parts.append(f"[{i}:a]adelay={ms}:all=1,volume=1.5[a{i}]")
        mix_in = "".join(f"[a{i}]" for i in range(1, len(events) + 1))
        # ponytail: amix normalize=0 で減衰回避 + alimiter でクリップ保険（前回の音量課題対応）
        parts.append(f"{mix_in}amix=inputs={len(events)}:normalize=0,alimiter=limit=0.9[aout]")
        cmd += ["-filter_complex", ";".join(parts), "-map", "0:v", "-map", "[aout]"]
    else:
        cmd += ["-map", "0:v"]
    cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(mp4)]
    subprocess.run(cmd, check=True, capture_output=True)

    # 検証: duration / ストリーム / 途中フレーム1枚
    probe = json.loads(subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", str(mp4)],
        check=True, capture_output=True).stdout)
    dur = float(probe["format"]["duration"])
    codecs = {s["codec_type"]: s["codec_name"] for s in probe["streams"]}
    assert "video" in codecs and "audio" in codecs, f"stream 欠落: {codecs}"
    frame = out_dir / "check_frame.png"
    subprocess.run(["ffmpeg", "-y", "-ss", str(dur / 2), "-i", str(mp4),
                    "-frames:v", "1", str(frame)], check=True, capture_output=True)
    print(f"[done] {mp4} ({dur:.1f}s, {codecs}) frame={frame}", flush=True)

    # YouTube cut（頭トリミング + OP/ED 挟み込み）
    if args.time_budget and events:
        yt_path = out_dir / f"yt-{args.out}"
        build_youtube_cut(mp4, events, deaths[0], yt_path, out_dir)


if __name__ == "__main__":
    main()
