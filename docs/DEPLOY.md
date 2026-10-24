# Deploying the Benchwatch browser demo

This `docs/` folder is the committed, deployable static build of the Benchwatch
browser-only replay demo. It is a self-contained static site: it opens **no**
WebSocket and makes **no** API calls on the default route, so it runs entirely
in the browser with no backend.

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

Open https://jamesboteng.github.io/hackaton/ in Chrome. The demo **defaults to
replay mode**, so the URL opens the fully offline, scripted demo directly — no
flags or backend required. (The live WebSocket product flow is preserved and
reachable at `?live=1`, but it needs the FastAPI backend and is not part of the
public demo.)

## Regenerating this artifact

```sh
cd frontend
npm install
npm run build          # emits frontend/dist/
# Replace only the build output, leaving committed files (DEPLOY.md, .nojekyll) in place.
rm -rf ../docs/index.html ../docs/assets
mkdir -p ../docs
cp -r dist/. ../docs/
touch ../docs/.nojekyll
```

`frontend/dist/` is gitignored, which is why the build output is copied into
this committed `docs/` directory — that is the artifact GitHub Pages serves.
