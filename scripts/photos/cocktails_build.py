"""Cocktail photos, step 2: build the chosen photos and their credits.

    python3 scripts/photos/cocktails_build.py      # after cocktails_fetch.py and the picks

Reads data/cocktail-photo-picks.json ({"negroni": "File name.jpg"}), downloads a 500 px thumbnail of
each pick, crops it to a 3:4 portrait and writes web/cocktails/<id>.webp, plus web/cocktails.json with
the author, licence and source page of every photo (all Commons files carry a free licence; the app
shows the credit on the recipe card).
"""
import html, io, json, os, re, sys, urllib.parse

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cocktails_fetch import CACHE, ROOT, get, thumb_url  # noqa: E402

OUT = os.path.join(ROOT, "web", "cocktails")
SIZE = (360, 480)


def text(fragment):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def credit(name):
    page = get("https://commons.wikimedia.org/wiki/" + urllib.parse.quote("File:" + name.replace(" ", "_")),
               os.path.join(CACHE, "files", re.sub(r"[^A-Za-z0-9]+", "_", name)[:80] + ".html"))
    page = (page or b"").decode("utf-8", "ignore")
    m = re.search(r'id="fileinfotpl_aut"[^>]*>.*?</td>\s*<td[^>]*>(.*?)</td>', page, re.S)
    author = text(m.group(1)) if m else ""
    author = re.sub(r"\s*\(talk.*$", "", author)[:80]
    lic = re.search(r'class="licensetpl_short"[^>]*>(.*?)<', page, re.S)
    lic = text(lic.group(1)) if lic else ("Public domain" if "public domain" in page.lower() else "")
    return author, lic


def main():
    picks = json.load(open(os.path.join(ROOT, "data", "cocktail-photo-picks.json"), encoding="utf-8"))
    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    for did, name in sorted(picks.items()):
        if not name:
            continue
        raw = get(thumb_url(name, 500), os.path.join(CACHE, "large", re.sub(r"[^A-Za-z0-9]+", "_", name)[:80] + ".img"), pause=1.2)
        if not raw:
            print("missing", did, name, file=sys.stderr)
            continue
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        w, h = im.size
        tw = min(w, int(h * SIZE[0] / SIZE[1]))
        th = min(h, int(w * SIZE[1] / SIZE[0]))
        x, y = (w - tw) // 2, (h - th) // 2
        im = im.crop((x, y, x + tw, y + th)).resize(SIZE, Image.LANCZOS)
        im.save(os.path.join(OUT, did + ".webp"), "WEBP", quality=70, method=6)
        author, lic = credit(name)
        manifest[did] = {"by": author, "lic": lic, "src": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(name.replace(" ", "_"))}
        print(did, "|", author, "|", lic, flush=True)
    for f in os.listdir(OUT):
        if f.endswith(".webp") and f[:-5] not in manifest:
            os.remove(os.path.join(OUT, f))
    json.dump(manifest, open(os.path.join(ROOT, "web", "cocktails.json"), "w"), indent=0, ensure_ascii=False, sort_keys=True)
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f"photos {len(manifest)}  ({size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
