#!/usr/bin/env python3
"""mugi_watch.py の純ロジック(判定・抽出)の self-check。ネットワーク不要。
ponytail: assertベース、フレームワークなし。

Usage: python3 test_mugi_watch.py
"""
import mugi_watch as mw

# 実際に取得できた技法解説ポスト(2026-08-18実測、スフマート解説)
_TECHNIQUE_POST = {
    "id": "2089313797391425742",
    "text": "スフマートは、イタリア語で「煙のようにぼかす」という意味を持つ絵画技法です🎨\n"
            "輪郭線をハッキリ描かず、微妙に色が違う絵の具を何層も薄く塗り重ねて境界を馴染ませます。",
    "author": {"screenName": "mugi_AI_Art"},
    "isRetweet": False,
}
_NORMAL_POST = {
    "id": "2089366647685439977",
    "text": "ネオンでおやすみなさい",
    "author": {"screenName": "mugi_AI_Art"},
    "isRetweet": False,
}
_RETWEET_POST = {
    "id": "2089487444853117414",
    "text": "#極上の芸術に昇華させるスフマート #AIイラスト",
    "author": {"screenName": "mugi_AI_Art"},
    "isRetweet": True,  # 他人の投稿のRT。本人発の技法解説ではない
}

assert mw.is_technique_post(_TECHNIQUE_POST) is True
assert mw.is_technique_post(_NORMAL_POST) is False
assert mw.is_technique_post(_RETWEET_POST) is False  # RTは対象外(本人発のみ)

assert mw.extract_technique_name("#極上の芸術に昇華させるスフマート\n本文") == "極上の芸術に昇華させるスフマート"
assert mw.extract_technique_name("ハッシュタグなしの技法解説本文冒頭がここに続く") == "ハッシュタグなしの技法解説本文冒頭がここに続く"
assert mw.extract_technique_name("スフマートは、煙のような輪郭で表情をやわらかくする。続きの本文はここ") == "スフマートは"

# build_entry: origin_check は空欄で始まる(人間判断待ち)、summaryは失敗時プレースホルダで
# 生の本文をそのまま流用しない(要約LLM呼び出しは実行環境依存なのでここでは呼ばず、
# 失敗パス=「本文をそのまま採用しない」の担保だけ確認する)
entry = mw.build_entry(_TECHNIQUE_POST)
assert entry["origin_check"] == ""
assert entry["used"] is False
assert entry["url"] == "https://x.com/mugi_AI_Art/status/2089313797391425742"
assert _TECHNIQUE_POST["text"] not in entry["summary"]  # 生本文の複製ではない(要約 or プレースホルダ)

print("[test_mugi_watch] OK")
