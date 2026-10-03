"""Cocktail photos, step 1: find candidate photos on Wikimedia Commons and draw contact sheets.

    python3 scripts/photos/cocktails_fetch.py      # needs: pip install pillow; resumable

For every cocktail it searches Commons (the HTML search page; the API is rate-limited for shared
addresses), keeps up to 6 photo files, downloads their 120 px thumbnails (the size Commons galleries
use, so they are cached and not rate-limited), and writes
.photo-cache/cocktails/sheet-*.png with numbered candidates. Picks go in data/cocktail-photo-picks.json
({"negroni": "File name.jpg", "kir": null}) and step 2 (cocktails_build.py) builds web/cocktails.json.
"""
import hashlib, html, json, os, re, sys, time, urllib.parse, urllib.request

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, ".photo-cache", "cocktails")
UA = "AllCohol/1.0 (https://all-cohol.vercel.app; personal cocktail app)"
PER = 6


def get(url, path, pause=2.5):
    if os.path.exists(path):
        return open(path, "rb").read()
    for attempt in range(6):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            os.makedirs(os.path.dirname(path), exist_ok=True)
            open(path, "wb").write(data)
            time.sleep(pause)
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(10 * (attempt + 1))
        except Exception:
            time.sleep(10 * (attempt + 1))
    return None


def thumb_url(name, width=250):
    n = name.replace(" ", "_")
    h = hashlib.md5(n.encode()).hexdigest()
    q = urllib.parse.quote(n)
    suffix = ".jpg" if n.lower().endswith((".tif", ".tiff")) else ""
    return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{h[0]}/{h[:2]}/{q}/{width}px-{q}{suffix}"


def drinks():
    src = open(os.path.join(ROOT, "src", "i18n", "en.js"), encoding="utf-8").read()
    block = src[src.index("\n  drink:{"):]
    out = []
    for m in re.finditer(r'^    "([a-z0-9_]+)":\{"n": "((?:[^"\\]|\\.)*)"', block, re.M):
        out.append((m.group(1), json.loads('"' + m.group(2) + '"')))
    return out


def candidates(did, name):
    q = re.sub(r"\s*\(.*?\)", "", name)
    q = q if "cocktail" in q.lower() else q + " cocktail"
    url = "https://commons.wikimedia.org/w/index.php?" + urllib.parse.urlencode(
        {"search": q, "title": "Special:Search", "ns6": 1, "fulltext": 1, "limit": 30})
    page = get(url, os.path.join(CACHE, "search", did + ".html"))
    if not page:
        return []
    files = []
    for t in re.findall(r'title="File:([^"]+)"', page.decode("utf-8", "ignore")):
        t = html.unescape(t)
        if "page does not exist" in t or not re.search(r"\.(jpe?g|png|webp|tiff?)$", t, re.I):
            continue
        if t not in files:
            files.append(t)
    return files[:PER]


def main():
    items = drinks()
    found = {}
    for k, (did, name) in enumerate(items):
        files = candidates(did, name)
        got = []
        for f in files:
            path = os.path.join(CACHE, "thumbs", hashlib.md5(f.encode()).hexdigest() + ".img")
            if get(thumb_url(f, 120), path, pause=0.4):
                got.append(f)
        found[did] = got
        print(f"{k + 1}/{len(items)} {did}: {len(got)}", flush=True)
    json.dump(found, open(os.path.join(CACHE, "candidates.json"), "w"), indent=1, ensure_ascii=False)
    # Contact sheets: one row per cocktail, numbered candidates.
    rows = 8
    for s in range(0, len(items), rows):
        page = Image.new("RGB", (190 + PER * 170, rows * 190), "white")
        d = ImageDraw.Draw(page)
        for r, (did, name) in enumerate(items[s:s + rows]):
            y = r * 190
            d.text((6, y + 80), did[:26], fill="black")
            for c, f in enumerate(found.get(did, [])):
                try:
                    im = Image.open(os.path.join(CACHE, "thumbs", hashlib.md5(f.encode()).hexdigest() + ".img")).convert("RGB")
                except Exception:
                    continue
                im = im.resize((160, int(im.size[1] * 160 / im.size[0]))) if im.size[0] < 160 else im
                im.thumbnail((160, 170))
                x = 190 + c * 170
                page.paste(im, (x, y + 4))
                d.rectangle((x, y + 4, x + 16, y + 18), fill="black")
                d.text((x + 4, y + 5), str(c), fill="white")
        page.save(os.path.join(CACHE, f"sheet-{s // rows + 1:02d}.png"))


if __name__ == "__main__":
    main()
