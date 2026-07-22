# Skills Constellation — Ryan Hance

An explorable star atlas of the complete professional skill set: 8 domains + a tools belt, every skill a star, sized by the weight of proof behind it. Bright stars open a dossier with the real accomplishment that backs them (sourced from `resume_of_truth.md` and `Facts Bank.md`).

Static site — no server, no build step. Works on GitHub Pages out of the box.

## Files
```
index.html   # page shell + chrome (masthead, search, legend, controls, dossier)
styles.css   # all styling
app.js       # layout + rendering + interaction (reads window.MAP_DATA)
data.js      # ALL content — skills, weights, evidence. Edit this, never the code.
```

## Editing content
Everything on the map lives in `data.js`:
- `categories[].skills` — `["Name", weight, [evidenceIds]]`
  - weight `3` = signature strength (large gold-flared star), `2` = proven (medium), `1` = working skill (small)
- `evidence` — `id: { t: title, b: body, s: source }`. One evidence entry can back many skills; the dossier cross-links every skill sharing an evidence id ("Same work, other skills").

To add a proof point: add an evidence entry, then add its id to the skill(s) it backs. Layout, constellation lines, and cross-links regenerate automatically.

## Deploying to GitHub Pages
1. Push these four files (plus this README) to a repo root.
2. Settings → Pages → Deploy from a branch → `main` / `/ (root)`.
3. Open `https://<username>.github.io/<repo>/`.

Deep links work: clicking a star writes `#skill-slug` to the URL; sharing that link reopens the map flown to that star.

Note: unlike the fit-map sites, `data.js` is a plain script (not fetched JSON), so this also works opened directly from disk via `file://`.
