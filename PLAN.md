# PLAN — HEFT-TS-VND interactive presentation

## Goal
A full-screen **slide deck** (not a scrolling page) that explains `../cloudsim_hybrid`,
and especially how the proposed hybrid **HEFT-TS-VND** (HEFT-seeded Tabu Search +
Variable Neighborhood Descent) works. DHA-ALNS is now one of the baselines. Every idea gets a concrete
metaphor or a live, interactive visual instead of abstract dot animations.

## Revision history
- v1: scrolling single page (replaced)
- v2: slide deck about DHA-ALNS
- v3: topic changed to HEFT-TS-VND; results = 10-run mean ± std from `summary_*.csv`
- v4 (current): concept-first. A "treasure hunter in foggy mountains" story (mountain.js) is taught
  before the real problem; each real slide got a "how to read it" guide

## Tech
Vanilla HTML/CSS/JS, no build step: open `index.html`.
`engine.js` is a JS port of the repo (simulator, HEFT, 5 destroy and 4 repair operators,
adaptive roulette, SA, decomposition, merge, rebalance), so every demo runs the real logic.
Navigation: ← → / Space / swipe, `M` = slide menu, URL hash = slide number.

## Slides
**Part 1: the story (concept first)**
| # | Slide | Idea |
|---|---|---|
| 1 | Title | explorer walking the mountains |
| 2 | Foggy mountains | position = schedule, altitude = score; "always downhill" gets stuck |
| 3 | 🚁 Helicopter | random drop vs guided drop = HEFT |
| 4 | 👣 Footprints | best visible step even uphill; can't step on footprints = tabu list, tenure, aspiration |
| 5 | 🔦🔭🪂 Area search | 3 tools tried in order, restart on success = VND |
| 6 | Expedition game | toggle each trick; scoreboard = conceptual ablation |

**Part 2: the real problem**
7 animated pseudocode (hunter runs HEFT-TS-VND line by line) · 8 VMs · 9 workflow (click = dependencies, play = execution) ·
10 be the scheduler (how-to strip, challenge vs HEFT) · 11 score receipt (ratio × weight) · 12 why it's hard

**Part 3: the algorithm**
13 story → algorithm mapping table · 14 HEFT step-by-step (urgency list + EFT per VM) ·
15 the 4 move types · 16 VND ladder on a real schedule · 17 live playground · 18 ablation (5 variants, 8 seeds)

**Part 4: results**
19 10-run results · 20 honest analysis · 21 repo map · 22 baselines · 23 summary

## Status
- [x] Engine port
- [x] All 23 slides, JS port of HEFT-TS-VND in `engine.js`, story engine in `mountain.js`
- [x] Headless screenshot check of every slide
