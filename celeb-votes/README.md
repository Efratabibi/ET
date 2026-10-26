# Celebrity votes (הפתק של המפורסמים)

A one-page site listing which Israeli celebrities said publicly who they vote for in the
October 27, 2026 Knesset election, each with a link to the article that reported it.
Separate from the All Cohol app; it only lives in this repository.

- `page.html` is the source. It is also published to the claude.ai Artifact
  https://claude.ai/artifact/Wg4U6Wa1DaPJ4YsBzvvz2t, so it uses the Artifact format (no `<html>`/`<head>`).
- `python3 celeb-votes/build.py` writes `site/index.html`, the full document Vercel serves, with Web Analytics.
- Vercel project: Root Directory `celeb-votes`, no build step, output `site` (see `vercel.json`).
