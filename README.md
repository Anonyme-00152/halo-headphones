# HALO — Wireless headphones concept site

Concept by **Ebubekir ARTI**. Landing page for HALO One, a fictional pair of wireless over-ear headphones: scroll-driven hero animation (Lottie), smooth scrolling (Lenis), GSAP animations, product videos and colourway slider.

The site is a static adaptation of a Taptop export. Every product visual (80 images, 2 videos and the 75 frames of the hero animation) was rendered from a procedural 3D model built with three.js — see `tools/studio/`.

## Run locally

```
node server.js
```

Then open http://localhost:8090 (or double-click `start.bat` on Windows).

## Edit the site

- **Texts** — `content/content.json`. The local server re-applies it to `index.htm` on save (or run `node build.js`).
- **Logos** — `content/logo-wordmark.svg` and `content/logo-symbol.svg`.
- **Visuals** — replace a file at the same path; `checklist-visuels.html` lists every slot with its expected size.
- **3D renders** — open http://localhost:8090/tools/studio/ with the local server running to re-render the visuals.

## Deploy

Static hosting at the root of a domain (the page uses absolute paths). `vercel.json` serves `index.htm` at `/`.
