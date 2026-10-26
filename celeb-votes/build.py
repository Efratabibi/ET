"""Build the Vercel copy of the celebrity-votes page.

page.html is the source, written in the claude.ai Artifact format (no <html>/<head>/<body>;
the Artifact host adds them). This wraps it into a full document at site/index.html and adds
Vercel Web Analytics. Run after every change to page.html: python3 celeb-votes/build.py
"""
import pathlib
import re

HERE = pathlib.Path(__file__).parent
DESCRIPTION = "מי מאנשי התרבות, הבידור והספורט אמר בפומבי למי יצביע בבחירות לכנסת 2026, עם קישור לכתבה ליד כל שם."

page = (HERE / "page.html").read_text(encoding="utf-8")
split = page.index("</style>") + len("</style>")
head, body = page[:split], page[split:]
title = re.search(r"<title>(.*?)</title>", head).group(1)

doc = f"""<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{DESCRIPTION}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:type" content="website">
<meta property="og:locale" content="he_IL">
{head.strip()}
<script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
{body.strip()}
</body>
</html>
"""
out = HERE / "site" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(doc, encoding="utf-8")
print(f"wrote {out}")
