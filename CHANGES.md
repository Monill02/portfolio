# Portfolio — update for Claude Code

Repo: Monill02/portfolio (branch: main) — Vercel auto-deploys on push.

## Instructions for Claude Code
Replace the repo contents with this folder (keep .git), then commit and push:

```
git add -A
git commit -m "Hero: 1600px container, local Redaction fonts, new logo/spark/bots SVGs, nav border tweaks"
git push origin main
```

Do NOT open index.html via file:// — fonts need a server. Preview with `npx serve .` → http://localhost:3000

## Latest: Articles + Testimonials tickers
- New Tickers.dc.html, mounted in index.html below Case Studies. Sections #articles and #testimonials (nav links scroll here).
- Full-bleed, endlessly looping tickers: Articles drift right→left, Testimonials left→right. Speeds 70/58 px/s; hovering eases a ticker down to 25% speed.
- Article cards: noisy white title panel (assets/noise-card.svg) + black blurb strip. Testimonial cards match the mockup (corner handles, pixel LinkedIn icon, [Collab] Outcomes tree).
- Content lives in the ARTICLES / TESTIMONIALS arrays at the top of Tickers.dc.html (href, linkedin, photo fields ready to fill).
- Commit message: "Articles + testimonials tickers"

## Case Studies section
- New CaseStudies.dc.html, mounted in index.html under #work (nav "Work" link scrolls here).
- Scroll-pinned carousel: the card sticks while scrolling; the active pagination square fills left→right, then advances to the next case study with a staggered fade-in of the folders and tree lines.
- Clicking a pagination square jumps to that case. On mobile (≤760px) it is tap-to-switch, no pinning.
- Page root changed from overflow:hidden to overflow:clip so sticky works.
- Fonts: title Redaction 10, folders/stats Redaction 35, tags Redaction 70 Bold.
- Card auto-scales (type included) to never exceed 90% of the viewport height (MAX_VH in CaseStudies.dc.html); on mobile it caps at 90vh and scrolls inside.
- Cases 2–4 currently duplicate case 1 (edit the CASES array in CaseStudies.dc.html).

Commit message: "Case studies: scroll-pinned carousel section"

## What changed
- Layout: 64px side gutters on a 1728px artboard → 1600px max-width container; gutters/gaps scale fluidly (clamp + vw) and stack to one column on mobile.
- Fonts: self-hosted Redaction family (all cuts: Redaction, 10, 20, 35, 50, 70, 100 — Regular/Italic/Bold) in /fonts. CDN font link removed.
- Logo: assets/logo.svg with 2px border matching the AI spark button.
- AI spark: assets/spark.svg. Human & agent: assets/bots.svg.
- Nav: outer border 1px, inner box + dividers 0.5px.
- Stat cards: "50+" / "6+ YoE" at 64px with 36px side padding so they clear the corner strokes.
- Background noise: assets/noise-light.svg + assets/noise-dark.svg.

## Known gaps
- NY skyline still uses assets/skyline.png — the supplied skyline.svg has an empty embedded image; re-export from Figma with images included.
- Tech-stack row (assets/stack.png) is still a crop from the mockup.
- Unused files safe to delete: assets/bots.png, assets/logo.png, assets/spark.png, assets/skyline.svg.

## File map
- index.html — the page (single file, inline styles; runtime in support.js)
- support.js — required runtime, keep alongside index.html
- assets/ — images + noise textures
- fonts/ — Redaction woff2 files
