#!/usr/bin/env python3
"""crontab を読んで作戦本部（room.html）用の定期タスク可視化 JSON を吐く。

読むだけ。crontab は絶対に書き換えない。標準ライブラリのみ。
出力: iw-projects/beckyexists/cron_status.json

status 判定:
  never_ran … ログファイルが無い（一度も走ってない or 出力先が消えた）
  error     … ログ末尾に Traceback / Error / FAILED
  stale     … ログの最終更新が「前回走るべきだった時刻」より古すぎる（マージン超過）
  ok        … 上記いずれでもない
"""
import json
import os
import re
import subprocess
from datetime import datetime, timedelta

OUT = "/Volumes/SSD2TB/interventionworks/iw-projects/beckyexists/cron_status.json"

# 「stale」と見なすまでの猶予: 前回発火予定 + (発火間隔 or 90分) のさらに +猶予。
# ログ mtime がそれより古ければ「動いてないかも」。
STALE_GRACE_MIN = 90

DOW_JA = ["日", "月", "火", "水", "木", "金", "土"]  # cron 0=日


# ── cron フィールド 1 個を「マッチする値の set」に展開 ──
def expand_field(field, lo, hi):
    """'*' '*/5' '1,3,5' '1-4' '2' の混在を {int,...} に。範囲外は無視。"""
    values = set()
    for part in field.split(","):
        step = 1
        if "/" in part:
            part, s = part.split("/", 1)
            step = int(s)
        if part == "*":
            start, end = lo, hi
        elif "-" in part:
            a, b = part.split("-", 1)
            start, end = int(a), int(b)
        else:
            start = end = int(part)
        for v in range(start, end + 1, step):
            if lo <= v <= hi:
                values.add(v)
    return values


def parse_schedule(minute, hour, dom, mon, dow):
    return {
        "minute": expand_field(minute, 0, 59),
        "hour": expand_field(hour, 0, 23),
        "dom": expand_field(dom, 1, 31),
        "mon": expand_field(mon, 1, 12),
        # cron: 0 と 7 は両方日曜
        "dow": {d % 7 for d in expand_field(dow.replace("7", "0"), 0, 6)},
        "dom_star": dom == "*",
        "dow_star": dow == "*",
    }


def matches(sched, dt):
    if dt.minute not in sched["minute"]:
        return False
    if dt.hour not in sched["hour"]:
        return False
    if dt.month not in sched["mon"]:
        return False
    # 標準 cron: dom と dow が両方制限されてたら OR、片方だけなら AND（* 側は無視）
    dow = dt.weekday()  # Mon=0..Sun=6
    cron_dow = (dow + 1) % 7  # cron の 0=日 に変換
    dom_ok = dt.day in sched["dom"]
    dow_ok = cron_dow in sched["dow"]
    if sched["dom_star"] and sched["dow_star"]:
        return True
    if sched["dom_star"]:
        return dow_ok
    if sched["dow_star"]:
        return dom_ok
    return dom_ok or dow_ok


def prev_fire(sched, now):
    """now 以前で直近に発火するはずだった時刻。見つからなければ None（8日遡って探索）。"""
    dt = now.replace(second=0, microsecond=0)
    for _ in range(8 * 1440 + 1):  # ponytail: naive minute-step scan, bounded 8 days
        if matches(sched, dt):
            return dt
        dt -= timedelta(minutes=1)
    return None


def next_fire(sched, now):
    dt = (now + timedelta(minutes=1)).replace(second=0, microsecond=0)
    for _ in range(8 * 1440 + 1):
        if matches(sched, dt):
            return dt
        dt += timedelta(minutes=1)
    return None


def fire_interval_min(sched, now):
    """直近 2 回の発火間隔（分）。stale マージン算出用。"""
    p = prev_fire(sched, now)
    if not p:
        return None
    pp = prev_fire(sched, p - timedelta(minutes=1))
    if not pp:
        return None
    return int((p - pp).total_seconds() // 60)


# ── cron 式 → 日本語 ──
def humanize(minute, hour, dom, mon, dow):
    mins = sorted(expand_field(minute, 0, 59))
    hours = sorted(expand_field(hour, 0, 23))

    # 曜日プレフィックス
    prefix = ""
    if dow != "*":
        days = sorted({d % 7 for d in expand_field(dow.replace("7", "0"), 0, 6)})
        prefix = "毎週" + "・".join(DOW_JA[d] + "曜" for d in days) + " "
    elif dom != "*":
        doms = sorted(expand_field(dom, 1, 31))
        prefix = "毎月" + ",".join(str(d) for d in doms) + "日 "

    # 「N分毎」（minute が */n、hour が *）
    m_step = re.fullmatch(r"\*/(\d+)", minute.strip())
    if m_step and hour == "*":
        return f"{m_step.group(1)}分毎"

    # 毎時 M分（hour が *、minute 単一 or 複数）
    if hour == "*":
        return f"{prefix}毎時 {','.join(str(m) for m in mins)}分".strip()

    # hour 複数 → 「9,17,21時」（+ 分が 0 以外なら「30分」）
    if len(hours) > 1:
        base = f"{prefix}毎日 " if not prefix else prefix
        htxt = ",".join(str(h) for h in hours) + "時"
        if mins == [0]:
            return (base + htxt).strip()
        return (base + htxt + f"{mins[0]}分").strip()

    # hour 単一 → 「7:40」
    if len(hours) == 1 and len(mins) == 1:
        base = prefix if prefix else "毎日 "
        return f"{base}{hours[0]}:{mins[0]:02d}"

    # フォールバック
    return f"{prefix}{','.join(str(h) for h in hours)}時 {','.join(str(m) for m in mins)}分".strip()


# ── 名前・ログパス・コマンド短縮の抽出 ──
def extract_log_path(command):
    m = re.search(r">>?\s*(\S+)", command)
    return m.group(1) if m else None


def extract_script(command):
    # コマンド内の最後の .py / .sh を拾う（basename）
    scripts = re.findall(r"[\w./-]+\.(?:py|sh)", command)
    if scripts:
        return os.path.basename(scripts[-1])
    # スクリプトが無い（claude -p 等）: cd/&&/env 代入を飛ばして最初の実バイナリ
    for tok in command.split():
        if tok in ("cd", "&&", "||", ";") or "=" in tok or tok.startswith("/") and tok.endswith("interventionworks"):
            continue
        return tok.split("/")[-1]
    return command[:20]


def clean_name(text):
    # 付帯情報の丸括弧（（...仕込み）や（1日3回…）等）を全部落として短く
    text = re.sub(r"（[^）]*）", "", text)
    text = re.sub(r"\([^)]*\)", "", text)
    return text.strip(" 　")


def derive_name(inline_comment, preceding_comment, script):
    if inline_comment:
        return clean_name(inline_comment)
    if preceding_comment:
        return clean_name(preceding_comment)
    # スクリプト名から拡張子落とし
    return re.sub(r"\.(py|sh)$", "", script)


# ── ログの状態判定 ──
def read_tail(path, max_bytes=65536):
    try:
        size = os.path.getsize(path)
        with open(path, "rb") as f:
            if size > max_bytes:
                f.seek(size - max_bytes)
            data = f.read()
        return data.decode("utf-8", errors="replace")
    except OSError:
        return None


ERROR_RE = re.compile(r"Traceback \(most recent call last\)|FAILED|(?<![A-Za-z])Error(?![A-Za-z])", re.I)


def log_status(log_path, sched, now):
    if not log_path or not os.path.exists(log_path):
        return "never_ran", None, None
    mtime = datetime.fromtimestamp(os.path.getmtime(log_path))
    last_run_iso = mtime.isoformat(timespec="seconds")

    tail = read_tail(log_path)
    lines = tail.splitlines() if tail else []
    # ponytail: 直近実行の成否は末尾 30 行で見る。ログは run 境界が無く追記され続けるので
    # 200 行だと高頻度ジョブで何時間も前のエラーを拾って誤検知になる（直近だけ見る）。
    recent = lines[-30:]

    err_line = None
    err_idx = -1
    for i, ln in enumerate(recent):
        if ERROR_RE.search(ln):
            err_line = ln.strip()
            err_idx = i
    # ponytail: 最後のエラー行の後に4行以上追記されていたら、後続の実行で回復した
    # とみなす（30分毎ジョブの単発エラーが窓から抜けるまで数時間 error 表示が残る対策。
    # 1実行の出力が4行未満のジョブでは回復判定が1サイクル遅れるだけで実害なし）
    if err_line and len(recent) - 1 - err_idx < 4:
        return "error", last_run_iso, err_line[:300]

    # stale: 前回発火予定 + 間隔 + 猶予 より mtime が古い
    prev = prev_fire(sched, now)
    if prev:
        interval = fire_interval_min(sched, now) or STALE_GRACE_MIN
        deadline = prev + timedelta(minutes=interval + STALE_GRACE_MIN)
        if mtime < prev - timedelta(minutes=interval + STALE_GRACE_MIN):
            # ログはあるが、前回発火予定より丸々 1 サイクル以上古い
            return "stale", last_run_iso, None
        _ = deadline
    return "ok", last_run_iso, None


CRON_RE = re.compile(r"^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$")


def main():
    raw = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    now = datetime.now()
    jobs = []
    preceding_comment = None

    for line in raw.stdout.splitlines():
        stripped = line.strip()
        if not stripped:
            preceding_comment = None
            continue
        if stripped.startswith("#"):
            preceding_comment = stripped.lstrip("# ").strip()
            continue
        if "=" in stripped.split()[0] and not CRON_RE.match(stripped):
            # PATH= 等の env 行
            continue
        m = CRON_RE.match(stripped)
        if not m:
            preceding_comment = None
            continue
        minute, hour, dom, mon, dow, command = m.groups()

        # コマンド末尾の inline コメント（# ...）を名前候補に
        inline = None
        if "#" in command:
            cmd_part, inline_part = command.split("#", 1)
            inline = inline_part.strip()
            command = cmd_part.strip()

        log_path = extract_log_path(command)
        script = extract_script(command)
        name = derive_name(inline, preceding_comment, script)
        preceding_comment = None  # 消費したらリセット

        try:
            sched = parse_schedule(minute, hour, dom, mon, dow)
        except (ValueError, KeyError):
            continue

        status, last_run, err = log_status(log_path, sched, now)
        nxt = next_fire(sched, now)

        jobs.append({
            "name": name,
            "schedule_human": humanize(minute, hour, dom, mon, dow),
            "schedule_raw": f"{minute} {hour} {dom} {mon} {dow}",
            "command_short": script,
            "log_path": log_path,
            "last_run": last_run,
            "next_run": nxt.isoformat(timespec="seconds") if nxt else None,
            "status": status,
            "last_error_snippet": err,
        })

    out = {"updated_at": now.isoformat(timespec="seconds"), "jobs": jobs}
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    counts = {}
    for j in jobs:
        counts[j["status"]] = counts.get(j["status"], 0) + 1
    print(f"wrote {len(jobs)} jobs -> {OUT}")
    # ponytail: ERROR_RE が "error" という単語自体に反応するので、自分の集計ログが
    # 次回実行時に自己言及的にエラー判定されないよう "err" 表記にする
    print("summary:", {("err" if k == "error" else k): v for k, v in counts.items()})


if __name__ == "__main__":
    main()
