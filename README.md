# MLX LoRA Studio — Website

Static marketing site for [MLX LoRA Studio](https://github.com/Goekdeniz-Guelmez/MLX-LoRA-Studio).

## Structure

```
.
├── index.html        # Single-page site
├── styles.css        # All styles, no build step
├── assets/
│   ├── img/          # Screenshots + logo
│   └── MLX-LoRA-Studio-1.0.0.dmg   # Bundled download
└── README.md
```

The download buttons in `index.html` point at `./assets/MLX-LoRA-Studio-1.0.0.dmg`
and use the HTML `download` attribute, so the DMG downloads directly from the
hosting site — no GitHub redirect. When you bump the version:

1. Build the new DMG (`./script/build_and_run.sh --package` from the repo root).
2. Drop the new `MLX-LoRA-Studio-X.Y.Z.dmg` into `assets/`.
3. Update the four `href="./assets/MLX-LoRA-Studio-…dmg"` references in
   `index.html` (search for `MLX-LoRA-Studio-`).
4. Update the version label in the install steps.

## Local preview

Open `index.html` directly in a browser, or serve the folder:

```bash
# Python
python3 -m http.server 8080

# Or: any static server, e.g. npx serve, caddy file-server, etc.
```

Then visit <http://localhost:8080>.

## Deploying

The site is fully static and works on:

- **GitHub Pages** — push to a `gh-pages` branch, or use the Pages settings on `main` → `/wesite`.
- **Netlify / Vercel / Cloudflare Pages** — drag-and-drop the `wesite/` folder.
- **Any static host** — copy the contents of `wesite/` to the web root.

## Editing

- Screenshots live in `assets/img/`. The site references them by filename.
- The GitHub link is set in three places (nav, hero, footer). Search the HTML for
  `Goekdeniz-Guelmez/MLX-LoRA-Studio` to update them all.
- Colors are CSS custom properties at the top of `styles.css` — change
  `--accent` and `--grad` to retheme the site.
