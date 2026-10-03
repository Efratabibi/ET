"""Step 1 of the bottle photos: search Open Food Facts once per brand / winery and cache the raw results.

    python3 scripts/photos/fetch.py            # resumes; already-cached brands are skipped

Reads the catalog straight from src/app.html (B(...) and W(...) rows). Open Food Facts allows about
10 searches a minute, so a full run takes about an hour. Results land in .photo-cache/search/.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CACHE = os.path.join(ROOT, ".photo-cache", "search")
UA = "HomeBar/1.0 (personal cocktail app; bottle thumbnails)"
FIELDS = "code,product_name,product_name_en,product_name_fr,product_name_he,generic_name,brands,quantity,categories_tags,image_front_url,image_front_small_url"


def catalog():
    """Brand and winery names from the B(...) and W(...) rows of src/app.html."""
    src = open(os.path.join(ROOT, "src", "app.html"), encoding="utf-8").read()
    brands = re.findall(r'^B\("((?:[^"\\]|\\.)*)"', src, re.M)
    wineries = re.findall(r'^W\("((?:[^"\\]|\\.)*)"', src, re.M)
    return [("bottle", b) for b in brands] + [("wine", w) for w in wineries]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-") or "x"


ALCOHOL = ("alcoholic-beverages", "wines", "spirits", "liqueurs", "beers", "sparkling-wines", "whiskies", "gins", "vodkas", "rums")


def get(params):
    req = urllib.request.Request("https://world.openfoodfacts.org/cgi/search.pl?" + urllib.parse.urlencode(params),
                                 headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r).get("products", [])


def search(term):
    base = {"search_terms": term, "search_simple": 1, "action": "process", "json": 1,
            "page_size": 100, "sort_by": "unique_scans_n", "fields": FIELDS}
    # Alcoholic drinks only: "Mars" is also a chocolate bar, "Yarden" also a hummus. The filtered search is
    # the better one but the server often sheds it with a quick 503, so fall back to filtering here.
    # The server sheds load with a fast 503 most of the time, so retry often for a short while, alternating both.
    filtered = dict(base, tagtype_0="categories", tag_contains_0="contains", tag_0="alcoholic-beverages")
    attempts = [filtered, base] * 6
    for n, params in enumerate(attempts):
        try:
            products = get(params)
            if "tag_0" not in params:
                products = [p for p in products if any(c.split(":")[-1] in ALCOHOL for c in p.get("categories_tags", []))]
            return products
        except Exception as e:
            time.sleep(5)
    return None  # still failing: skip it, a later run picks it up


def main():
    os.makedirs(CACHE, exist_ok=True)
    items = catalog()
    for i, (kind, name) in enumerate(items):
        path = os.path.join(CACHE, kind + "-" + slug(name) + ".json")
        if os.path.exists(path):
            continue
        term = name
        products = search(term)
        if products is None:
            print(f"[{i + 1}/{len(items)}] {name}: skipped (server busy)", flush=True)
            continue
        json.dump({"kind": kind, "name": name, "term": term, "products": products}, open(path, "w"), ensure_ascii=False)
        print(f"[{i + 1}/{len(items)}] {name}: {len(products)}", flush=True)
        time.sleep(6.5)  # stay under ~10 searches a minute


if __name__ == "__main__":
    main()
