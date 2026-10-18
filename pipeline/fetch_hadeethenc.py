"""Fetch the Encyclopedia of Translated Prophetic Hadiths (hadeethenc.com) through its public API
-> data/raw/hadeethenc/<lang>.json  ({id: hadith record})

The encyclopedia is prepared by the translation centre of the Cooperative Office for Call and
Guidance in al-Rabwah (Riyadh). The ids come from the Arabic category lists; each language is then
fetched in batches with /hadeeths/multiple. Responses are cached, so a rerun only fetches what is new.

usage: fetch_hadeethenc.py [lang ...]     (default: ar)
"""
import json
import sys
import time
import urllib.parse
import urllib.request

from common import RAW, dump, load

API = "https://hadeethenc.com/api/v1"
OUT = RAW / "hadeethenc"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
BATCH = 40


def get(path, **params):
    url = f"{API}/{path}/?{urllib.parse.urlencode(params, safe=',')}"
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = json.load(r)
            time.sleep(0.5)
            return data
        except Exception as e:  # 429 or a dropped connection: back off and retry
            print(f"  retry {attempt + 1} {url}: {e}", file=sys.stderr)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(url)


def all_ids():
    path = OUT / "ids.json"
    if path.exists():
        return load(path)
    ids = {}
    for cat in get("categories/list", language="ar"):
        page = 1
        while True:
            res = get("hadeeths/list", language="ar", category_id=cat["id"], page=page, per_page=100)
            for h in res["data"]:
                ids[h["id"]] = h["translations"]
            if page >= int(res["meta"]["last_page"]):
                break
            page += 1
        print(f"category {cat['id']}: {len(ids)} ids so far", file=sys.stderr)
    dump(ids, path)
    return ids


def fetch_lang(lang, ids):
    path = OUT / f"{lang}.json"
    have = load(path) if path.exists() else {}
    todo = [i for i, langs in ids.items() if lang in langs and i not in have]
    for k in range(0, len(todo), BATCH):
        for h in get("hadeeths/multiple", language=lang, ids=",".join(todo[k:k + BATCH])):
            have[str(h["id"])] = h
        dump(have, path)
        print(f"{lang}: {len(have)}", file=sys.stderr)
    return have


if __name__ == "__main__":
    if not (OUT / "languages.json").exists():
        dump(get("languages"), OUT / "languages.json")
    ids = all_ids()
    print(f"{len(ids)} hadiths", file=sys.stderr)
    for lang in sys.argv[1:] or ["ar"]:
        fetch_lang(lang, ids)
