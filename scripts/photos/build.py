"""Step 2 of the bottle photos: match each catalog bottle and wine to an Open Food Facts product,
download its front photo and write small thumbnails.

    python3 scripts/photos/build.py            # needs: pip install pillow

Writes:
  web/photos.json          {catalog name: "data:image/webp;base64,..."} — loaded by the app at runtime
  data/photo-sources.json  {catalog name: {code, url}} — where each photo came from (CC BY-SA attribution)
  .photo-cache/sheet-*.png contact sheets for checking the matches by eye

Matching is strict on purpose: a wrong photo is worse than the drawn bottle the app shows otherwise.
Every word of the catalog expression must appear in the product name, and canned drinks, alcohol-free
versions, chocolates, miniatures and gift packs are rejected. data/photo-overrides.json can pin a
product code to a name ({"Name": "code"}) or block a name ({"Name": null}).
"""
import base64, io, json, os, re, sys, unicodedata, urllib.request

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, ".photo-cache")
UA = "HomeBar/1.0 (personal cocktail app; bottle thumbnails)"
THUMB = (80, 112)  # max box in px: shown at 40×56 CSS px, sharp on 2× screens

# Words that mean "this is not the bottle itself".
BAD = set("""tonic cola soda lemonade alcohol-free alkoholfrei sansalcool nonalcoholic 0.0 0,0 zero can cans canette lata
rtd premix mixed chocolate chocolat chocolates praline pralines truffle truffles bonbons candy cake fudge ice-cream glace
sauce bbq glaze marinade mustard mini miniature miniatures coffret gift giftbox geschenk box pack tube mug glasses
hard-seltzer seltzer ginger-ale""".split())
BAD_PHRASES = ["sans alcool", "alcohol free", "non alcoholic", "0.0%", "0,0%", "& tonic", "and tonic", "& cola", "and cola",
               "ice cream", "gift set", "gift box", "ready to drink", "hard seltzer", "low alcohol"]
# Expression words that don't have to appear on the label.
SOFT = set("the original classic year years old yo ans jahre anos años aged single malt scotch whisky whiskey bourbon gin vodka rum tequila de".split())


WINE_CATS = {"wines", "red-wines", "white-wines", "rose-wines", "sparkling-wines", "champagnes", "proseccos", "cavas",
             "still-wines", "wines-from-france", "wines-from-italy", "wines-from-spain"}
OTHER_CATS = {"spirits", "liqueurs", "beers", "ciders", "vodkas", "gins", "rums", "whiskies", "tequilas", "brandies"}
WINE_TYPES = {"wine", "prosecco", "red_wine", "white_wine"}


def family_ok(item, p):
    """A vodka can't be a champagne (Chopin is both a vodka and a champagne house), and the other way round."""
    cats = {c.split(":")[-1] for c in p.get("categories_tags", [])}
    if item["type"] in WINE_TYPES:
        return not (cats & OTHER_CATS) or bool(cats & WINE_CATS)
    return not (cats & WINE_CATS) and "beers" not in cats


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    s = s.replace("&", " and ").replace("’", "'")
    s = re.sub(r"'s\b", "s", s)
    return re.sub(r"[^a-z0-9.]+", " ", s).strip()


def toks(s):
    return [t for t in norm(s).replace(".", " ").split() if t]


def catalog():
    src = open(os.path.join(ROOT, "src", "app.html"), encoding="utf-8").read()
    items = []
    for row in re.findall(r"^B\((.*)\);\s*$", src, re.M):
        brand, he, typ, exprs = json.loads("[" + row + "]")
        for e in exprs:
            items.append({"kind": "bottle", "brand": brand, "expr": e[0], "name": (brand + " " + e[0]).strip(),
                          "siblings": [x[0] for x in exprs if x[0] != e[0]], "type": e[4] if len(e) > 4 and e[4] else typ})
    for row in re.findall(r"^W\((.*)\);\s*$", src, re.M):
        en, he, labels = json.loads("[" + row + "]")
        for l in labels:
            items.append({"kind": "wine", "brand": en, "expr": l[0], "name": (en + " " + l[0]).strip(),
                          "siblings": [x[0] for x in labels if x[0] != l[0]], "type": "wine"})
    return items


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


def results(kind, brand):
    path = os.path.join(CACHE, "search", kind + "-" + slug(brand) + ".json")
    return json.load(open(path))["products"] if os.path.exists(path) else None


def litres(q):
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(ml|cl|l)\b", str(q or "").lower())
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    return v / 1000 if m.group(2) == "ml" else v / 100 if m.group(2) == "cl" else v


def pname(p):
    return p.get("product_name") or p.get("product_name_en") or p.get("product_name_fr") or ""


def score(item, p):
    name, brands = pname(p), p.get("brands", "")
    text = norm(name + " " + brands)
    words = set(toks(name + " " + brands))
    low = " " + norm(name) + " "
    if not p.get("image_front_small_url") or not name.strip() or not family_ok(item, p):
        return None
    if any(b in words for b in BAD) or any(ph in (name + " " + brands).lower() for ph in BAD_PHRASES):
        return None
    if any(t not in words for t in toks(item["brand"]) if t not in ("the",)):
        # the brand must be on the label or in the brand field
        if norm(item["brand"]) not in text:
            return None
    # The expression must be on the product name itself; the brand field alone often lists a whole range.
    need = [t for t in toks(item["expr"]) if t not in SOFT]
    in_name = set(toks(name))
    if any(t not in in_name for t in need):
        return None
    size = litres(p.get("quantity"))
    if size is not None and size < 0.3:
        return None
    # A sibling expression's distinctive words mean it's a different bottle (Tanqueray vs. Tanqueray Rangpur).
    mine = set(toks(item["expr"]))
    for sib in item["siblings"]:
        extra = [t for t in toks(sib) if t not in SOFT and t not in mine and not t.isdigit()]
        if extra and all(t in words for t in extra):
            return None
        nums = [t for t in toks(sib) if t.isdigit() and t not in mine]
        if nums and any(" " + n + " " in low for n in nums):
            return None
    s = 3 * len(need)
    s -= 0.3 * len([w for w in toks(name) if w not in mine and w not in toks(item["brand"]) and w not in SOFT])
    if size and 0.5 <= size <= 1.0:
        s += 1
    return s


def fetch(url):
    path = os.path.join(CACHE, "img", slug(url) + ".jpg")
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            open(path, "wb").write(r.read())
    return Image.open(path).convert("RGB")


def thumb(img):
    # Trim a plain light background so the bottle fills the frame, then fit into THUMB.
    bg = Image.new("RGB", img.size, img.getpixel((0, 0)))
    diff = ImageChops.difference(img, bg).convert("L").point(lambda v: 255 if v > 24 else 0)
    box = diff.getbbox()
    if box and (box[2] - box[0]) * (box[3] - box[1]) > 0.2 * img.size[0] * img.size[1]:
        img = img.crop(box)
    img.thumbnail(THUMB, Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=72, method=6)
    return out.getvalue(), img


def main():
    items = catalog()
    ov_path = os.path.join(ROOT, "data", "photo-overrides.json")
    overrides = json.load(open(ov_path)) if os.path.exists(ov_path) else {}
    photos, sources, sheet, missing = {}, {}, [], []
    for it in items:
        prods = results(it["kind"], it["brand"])
        if prods is None:
            missing.append(it["name"])
            continue
        pick = None
        if it["name"] in overrides:
            code = overrides[it["name"]]
            pick = next((p for p in prods if p.get("code") == code), None) if code else None
        else:
            ranked = sorted(((score(it, p), i, p) for i, p in enumerate(prods)), key=lambda x: (-(x[0] or -99), x[1]))
            if ranked and ranked[0][0] is not None:
                pick = ranked[0][2]
        if not pick:
            continue
        url = pick.get("image_front_url") or pick["image_front_small_url"]
        url = re.sub(r"\.(\d+|full)\.jpg$", ".400.jpg", url)
        try:
            img = fetch(url)
            if sum(img.convert("L").resize((16, 16)).tobytes()) / 256 < 45:
                continue  # too dark to recognise anything at thumbnail size
            data, small = thumb(img)
        except Exception as e:
            print("image failed", it["name"], e, file=sys.stderr)
            continue
        photos[it["name"]] = "data:image/webp;base64," + base64.b64encode(data).decode()
        sources[it["name"]] = {"code": pick.get("code"), "product": pname(pick), "url": "https://world.openfoodfacts.org/product/" + str(pick.get("code"))}
        sheet.append((it["name"], pname(pick), small))
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    json.dump(photos, open(os.path.join(ROOT, "web", "photos.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    json.dump(sources, open(os.path.join(ROOT, "data", "photo-sources.json"), "w"), indent=1, ensure_ascii=False)
    # Contact sheets: catalog name above, Open Food Facts name below, for checking by eye.
    per = 24
    for n in range(0, len(sheet), per):
        page = Image.new("RGB", (6 * 220, 4 * 190), "white")
        d = ImageDraw.Draw(page)
        for k, (cat, off, im) in enumerate(sheet[n:n + per]):
            x, y = (k % 6) * 220, (k // 6) * 190
            page.paste(im, (x + 70, y + 20))
            d.text((x + 4, y + 2), cat[:34], fill="black")
            d.text((x + 4, y + 136), off[:34], fill="gray")
        page.save(os.path.join(CACHE, f"sheet-{n // per + 1:02d}.png"))
    size = sum(len(v) for v in photos.values())
    print(f"photos {len(photos)}/{len(items)}  ({size / 1024:.0f} KB)  not searched yet: {len(missing)}")


if __name__ == "__main__":
    main()
