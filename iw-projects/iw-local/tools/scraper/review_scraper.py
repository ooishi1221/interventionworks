#!/usr/bin/env python3
"""
Google Maps 口コミスクレイパー（Places API版）
使い方:
  python3 review_scraper.py --place-id ChIJe3TWVtKRGGARatUFl2HeWjY
  python3 review_scraper.py --query "まるよし食堂 北区 東京"

環境変数: GOOGLE_PLACES_API_KEY
"""

import sys
import os
import json
import argparse
import urllib.request
import urllib.parse


API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "")
BASE_URL = "https://maps.googleapis.com/maps/api/place"


def fetch_json(url: str) -> dict:
    with urllib.request.urlopen(url) as res:
        return json.loads(res.read())


def search_place_id(query: str) -> str:
    """テキスト検索でPlace IDを取得"""
    encoded = urllib.parse.quote(query)
    url = f"{BASE_URL}/findplacefromtext/json?input={encoded}&inputtype=textquery&fields=place_id,name&language=ja&key={API_KEY}"
    data = fetch_json(url)
    candidates = data.get("candidates", [])
    if not candidates:
        raise ValueError(f"店舗が見つかりません: {query}")
    return candidates[0]["place_id"]


def get_place_details(place_id: str) -> dict:
    """Place IDで詳細情報・口コミを取得"""
    fields = "name,rating,user_ratings_total,reviews,formatted_phone_number,formatted_address,website,opening_hours,types"
    url = f"{BASE_URL}/details/json?place_id={place_id}&fields={fields}&language=ja&key={API_KEY}"
    data = fetch_json(url)
    if data.get("status") != "OK":
        raise ValueError(f"APIエラー: {data.get('status')} {data.get('error_message','')}")
    return data["result"]


def print_result(result: dict):
    print(f"店名: {result.get('name')}")
    print(f"評価: {result.get('rating')} ({result.get('user_ratings_total')}件)")
    print(f"電話: {result.get('formatted_phone_number') or 'なし'}")
    print(f"住所: {result.get('formatted_address')}")
    print(f"Web: {result.get('website') or 'なし'}")
    print(f"種別: {', '.join(result.get('types', [])[:3])}")

    hours = result.get("opening_hours", {}).get("weekday_text", [])
    if hours:
        print("\n営業時間:")
        for h in hours:
            print(f"  {h}")

    reviews = result.get("reviews", [])
    print(f"\n【口コミ {len(reviews)}件】")
    for r in reviews:
        print(f"  ★{r['rating']} {r['author_name']} ({r.get('relative_time_description','')})")
        print(f"  {r['text'][:120]}{'...' if len(r['text']) > 120 else ''}")
        print()


def main():
    parser = argparse.ArgumentParser(description="Google Maps 口コミ取得（Places API）")
    parser.add_argument("--place-id", help="Google Maps Place ID")
    parser.add_argument("--query", help="店名 + 住所で検索（例: まるよし食堂 北区 東京）")
    args = parser.parse_args()

    if not args.place_id and not args.query:
        parser.print_help()
        sys.exit(1)

    try:
        if args.query:
            print(f"検索中: {args.query}")
            place_id = search_place_id(args.query)
            print(f"Place ID: {place_id}\n")
        else:
            place_id = args.place_id

        result = get_place_details(place_id)
        print_result(result)

        out_file = f"{result.get('name','result').replace(' ','_')}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\nJSON保存: {out_file}")

    except Exception as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
