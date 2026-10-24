# Deploying the TAO browser demo

This `docs/` folder is the committed, deployable static build of **TAO**, the
browser-only diagnostic decision-support co-pilot. It is a self-contained static
site: on the default route it opens **no** WebSocket and needs **no** API key,
so its bundled case workflow, scoring, chart, and investigation plan work with no
backend or network. Optional PubMed results and external source links still
require connectivity.

> The deployed site is now TAO, not the earlier Benchwatch replay demo.
> Benchwatch is unchanged in the repo and still reachable from the same build at
> `?benchwatch=1` (offline replay) and `?live=1` (live WebSocket dashboard,
> which needs the FastAPI backend).

## Host

- **Host:** GitHub Pages (no extra account needed — the repo already lives on
  GitHub at `JAMESBOTENG/hackaton`).
- **Serving branch:** `main`
- **Source folder:** `/docs`
- **Public URL:** https://jamesboteng.github.io/hackaton/

The Vite build is configured with `base: "/hackaton/"` (see
`frontend/vite.config.ts`), so all asset references resolve under the
`/hackaton/` project-site subpath that GitHub Pages serves from.

The `.nojekyll` file in this folder tells GitHub Pages to skip Jekyll
processing, so the hashed `assets/` paths are served verbatim.

## One manual activation step

In the GitHub repository:

1. Go to **Settings -> Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. Set **Branch** = `main` and **Folder** = `/docs`.
4. Click **Save**.

After saving it can take about **1 minute** for the site to go live at
https://jamesboteng.github.io/hackaton/.

## Opening the demo

Open https://jamesboteng.github.io/hackaton/ in Chrome. The site **defaults to
TAO**, so the URL opens the offline-first diagnostic co-pilot directly — no
flags, API key, backend, or network is required for the core workflow. Press the
blue **Play** control to start the scripted consultation; first load does not
autoplay. The transcript streams on the right while the evidence-share board
animates on the left. The patient profile and Suggested investigations open as
overlays without expanding the page; clicking a condition reveals the "why",
relevant investigation options, and sources.

Benchwatch is preserved and reachable from the same deployed build:

- `?benchwatch=1` — the fully offline Benchwatch **replay** dashboard.
- `?live=1` — the live Benchwatch WebSocket dashboard (needs the FastAPI
  backend; not part of the public demo).

## Regenerating this artifact

```sh
cd frontend
npm install
npm test               # deterministic engine/data integrity checks
npm run build          # emits frontend/dist/ (TAO default app, base /hackaton/)
# Replace only the build output, preserving the committed DEPLOY.md and .nojekyll.
rm -f ../docs/index.html
rm -rf ../docs/assets
cp ../frontend/dist/index.html ../docs/index.html
cp -r ../frontend/dist/assets ../docs/assets
touch ../docs/.nojekyll
```

`frontend/dist/` is gitignored, which is why the build output is copied into
this committed `docs/` directory — that is the artifact GitHub Pages serves.
Always keep `docs/.nojekyll` and `docs/DEPLOY.md` in place when regenerating.
