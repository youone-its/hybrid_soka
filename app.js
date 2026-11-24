/* app.js: slide-deck UI. Part 1 = mountain metaphor (mountain.js), Parts 2-4 = real algorithm (engine.js) */
(function () {
  "use strict";
  const E = window.Engine, M = window.Mountain;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const VM_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181"];
  const TERM_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500"];
  const fmt = { s: (x) => x.toFixed(1) + " s", cost: (x) => "$" + x.toFixed(4), kJ: (x) => (x / 1000).toFixed(1) + " kJ", pct: (x) => (x * 100).toFixed(0) + "%" };

  const tip = $("#tooltip");
  function bindTip(el, html) {
    el.addEventListener("mousemove", (e) => {
      tip.innerHTML = typeof html === "function" ? html() : html;
      tip.classList.add("show");
      tip.style.left = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 10) + "px";
      tip.style.top = Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 10) + "px";
    });
    el.addEventListener("mouseleave", () => tip.classList.remove("show"));
  }

  let seed = 20;
  let inst = E.makeInstance(seed);
  const icon = (t) => (inst.tasks[t].gpu ? "🎮" : inst.tasks[t].ram >= 4 ? "🧠" : "⚙️");
  const ALL = () => [...Array(inst.n).keys()];
  const hooks = {};
  let cur = -1;
  const slides = $$(".slide");

  // =========================================================
  // PART 1: the mountain story
  // =========================================================
  const mstate = (ex, extra = {}) => Object.assign({ pos: ex.pos, best: ex.best, trail: ex.trail, footprints: ex.memory ? ex.footprints() : [] }, extra);
  const alt = (j) => M.ALT[j].toFixed(2);

  // title: explorer endlessly exploring with all tricks
  hooks.title = (() => {
    let timer = null, ex = null;
    function tick() {
      if (!ex || ex.energy > 30) ex = new M.Explorer({ start: M.HELI_START, memory: true });
      const ev = ex.step();
      M.draw($("#cvTitle"), mstate(ex, { treasure: true, probes: (ev.cands || []).map((c) => ({ j: c.j, kind: c.tabu ? "tabu" : "cand" })) }));
    }
    return { enter() { if (!timer) { tick(); timer = setInterval(tick, 550); } }, leave() { clearInterval(timer); timer = null; } };
  })();

  // c1: fog + naive downhill walk
  hooks.c1 = (() => {
    let ex, fog = true, busy = false;
    const draw = (probes) => M.draw($("#cvC1"), mstate(ex, { fog, treasure: !fog, probes, footprints: [] }));
    function reset() { ex = new M.Explorer({ start: M.RANDOM_START }); fog = true; $("#c1Fog").textContent = "👁 Lift the fog"; $("#capC1").className = "caption"; $("#capC1").innerHTML = "The treasure 💎 is buried at the <b>lowest point</b> of the mountains. You can only see the area around you. Try <b>Just walk downhill</b>."; draw(); }
    $("#c1Walk").addEventListener("click", async () => {
      if (busy) return; busy = true;
      for (;;) {
        const probes = []; for (let d = -2; d <= 2; d++) if (d) probes.push({ j: ex.pos + d, kind: "cand" });
        draw(probes); await sleep(500);
        const ev = ex.greedyStep();
        if (ev.type === "stuck") {
          $("#capC1").className = "caption reject";
          $("#capC1").innerHTML = `😩 <b>Stuck at altitude ${alt(ex.pos)}!</b> Every spot you can see is higher, so "always go downhill" stops here. But this is just a small dip. ${fog ? "Lift the fog to see the truth." : "The treasure is much deeper."}`;
          draw(); break;
        }
        $("#capC1").innerHTML = `🚶 Stepping downhill to altitude ${alt(ex.pos)}…`;
        draw(); await sleep(400);
      }
      busy = false;
    });
    $("#c1Fog").addEventListener("click", () => { fog = !fog; $("#c1Fog").textContent = fog ? "👁 Lift the fog" : "🌫️ Bring back the fog"; if (!fog) { $("#capC1").innerHTML = `👁 Without the fog you can see it: the treasure 💎 (altitude ${alt(M.TREASURE)}) is in a much deeper valley. <b>The real algorithm never gets to lift the fog.</b> It needs smarter tricks.`; } draw(); });
    $("#c1Reset").addEventListener("click", () => { if (!busy) reset(); });
    return { enter() { if (!ex) reset(); else draw(); } };
  })();

  // c2: random drop vs helicopter
  hooks.c2 = (() => {
    let busy = false, ex = null, results = [];
    const cv = $("#cvC2");
    const draw = (extra) => M.draw(cv, Object.assign(ex ? mstate(ex, { treasure: true, footprints: [] }) : { treasure: true }, extra || {}));
    async function drop(heli) {
      if (busy) return; busy = true;
      const start = heli ? M.HELI_START : M.RANDOM_START, tx = start / (M.N - 1);
      ex = null;
      if (heli) {
        $("#capC2").innerHTML = "🚁 The guide flies over the terrain…";
        for (let f = 0; f <= 40; f++) { M.draw(cv, { treasure: true, heli: { x: -0.1 + (tx + 0.1) * f / 40, y: 50 } }); await sleep(25); }
      } else $("#capC2").innerHTML = "🎲 Dropped at a random spot…";
      ex = new M.Explorer({ start });
      const { Y } = M.draw(cv, { treasure: true });
      const ground = Y(M.ALT[start]) - 16;
      for (let f = 0; f <= 20; f++) { draw({ explorerY: 60 + (ground - 60) * (f / 20) ** 2, heli: heli ? { x: tx, y: 50 } : null }); await sleep(25); }
      await sleep(300);
      let ev;
      do { ev = ex.greedyStep(); draw(); await sleep(350); } while (ev.type !== "stuck");
      results = results.filter((r) => r.heli !== heli).concat([{ heli, alt: M.ALT[ex.pos] }]);
      $("#capC2").className = "caption " + (heli ? "improve" : "");
      $("#capC2").innerHTML = heli
        ? `🚁 The helicopter left you in a <b>lower valley</b>: altitude <b>${alt(ex.pos)}</b>, much better than a random start, almost for free. Still not the treasure, though.`
        : `🎲 A random start lands you near a high, shallow dip: altitude <b>${alt(ex.pos)}</b>.`;
      $("#c2Score").innerHTML = results.map((r) => `<div>${r.heli ? "🚁 helicopter" : "🎲 random"}<b>${r.alt.toFixed(2)}</b></div>`).join("");
      busy = false;
    }
    $("#c2Rand").addEventListener("click", () => drop(false));
    $("#c2Heli").addEventListener("click", () => drop(true));
    return { enter() { draw(); } };
  })();

  // c3: footprints (tabu search)
  hooks.c3 = (() => {
    let ex, timer = null, last = null;
    const draw = () => M.draw($("#cvC3"), mstate(ex, { treasure: true, probes: last ? last.cands.map((c) => ({ j: c.j, kind: c.tabu ? "tabu" : c.j === last.to ? "better" : "cand" })) : [] }));
    function reset() {
      ex = new M.Explorer({ start: 22, memory: $("#c3Mem").checked, tenure: 5 }); last = null;
      $("#capC3").className = "caption"; $("#capC3").innerHTML = `You're at the bottom of the helicopter's valley (altitude ${alt(22)}). Every spot you can see is higher. Press <b>Step</b>.`;
      draw();
    }
    function step() {
      if (ex.energy >= 40) return stop();
      const ev = ex.step(); last = ev.type === "move" ? ev : null;
      const cap = $("#capC3");
      if (ev.type === "wait") { cap.className = "caption"; cap.innerHTML = "⏳ Every visible spot has a footprint, so you wait one step for them to melt."; }
      else if (ev.record) { cap.className = "caption best"; cap.innerHTML = `⭐ <b>New record!</b> Altitude ${alt(ev.to)}.` + (ev.to === M.TREASURE ? " 💎 <b>You found the treasure!</b>" : "") + (ev.asp ? " ✨ (stepped on a footprint: allowed because it's a record)" : ""); }
      else if (ev.uphill && ex.memory) { cap.className = "caption sa"; cap.innerHTML = `⬆️ <b>Uphill</b> to ${alt(ev.to)}. The spots behind you have footprints 👣, so the best <i>allowed</i> spot is uphill. This is how you <b>climb out</b> of a valley.`; }
      else if (ev.uphill) { cap.className = "caption reject"; cap.innerHTML = `🔁 Uphill to ${alt(ev.to)}… and with no footprints, the next step slides straight back down. <b>Stuck bouncing in the same valley.</b>`; }
      else { cap.className = "caption improve"; cap.innerHTML = `⬇️ Downhill to ${alt(ev.to)}.`; }
      cap.innerHTML += ` <span class="note">· step ${ex.energy}</span>`;
      draw();
    }
    function stop() { clearInterval(timer); timer = null; $("#c3Auto").textContent = "▶ Auto"; }
    $("#c3Step").addEventListener("click", step);
    $("#c3Reset").addEventListener("click", () => { stop(); reset(); });
    $("#c3Mem").addEventListener("change", () => { stop(); reset(); });
    $("#c3Auto").addEventListener("click", () => { if (timer) return stop(); $("#c3Auto").textContent = "⏸ Pause"; timer = setInterval(step, 650); });
    return { enter() { if (!ex) reset(); else draw(); }, leave: stop };
  })();

  // analogy: animated pseudocode, the hunter runs HEFT-TS-VND line by line
  hooks.analogy = (() => {
    const VN = ["🔦 N1 (next to you)", "🔭 N2 (a bit further)", "🪂 N3 (far jumps)"];
    let frames = [], fi = -1, timer = null;
    function build() {
      const ex = new M.Explorer({ start: M.HELI_START, tenure: 7 });
      const F = [];
      const snap = (o) => F.push(Object.assign({ pos: ex.pos, best: ex.best, trail: ex.trail.slice(), footprints: ex.footprints(), probes: [], vnd: [-1, -1, -1], energy: ex.energy }, o));
      const H = M.HELI_START / (M.N - 1);
      F.push({ line: 0, pos: null, heli: { x: H, y: 40 }, trail: [], footprints: [], probes: [], vnd: [-1, -1, -1], energy: 0, best: null, cls: "", cap: "🚁 <b>x ← HEFT()</b>: the guide (HEFT) flies you to a decent low spot in one fast pass." });
      snap({ line: 0, heli: { x: H, y: 40 }, cls: "best", cap: `Landed at altitude <b>${alt(ex.pos)}</b>. This is the first record ⭐ (best ← x).` });
      let rounds = 0;
      while (ex.energy < 40 && rounds < 30) {
        rounds++;
        snap({ line: 1, cap: `🔋 Energy used: ${ex.energy}. Budget left, so do another round.` });
        const from = ex.pos, fp = ex.footprints(), it = ex.it + 1;
        const cands = [];
        for (let d = -ex.R; d <= ex.R; d++) { const j = from + d; if (d && j >= 0 && j < M.N) cands.push(j); }
        const isT = (j) => (ex.tabu.get(j) || 0) >= it && !(M.ALT[j] < M.ALT[ex.best]);
        snap({ line: 2, footprints: fp, probes: cands.map((j) => ({ j, kind: "cand" })), cap: `🌫️ Look around: ${cands.length} visible spots (in the real algorithm: ~15 candidate moves).` });
        const nt = cands.filter(isT).length;
        snap({ line: 3, footprints: fp, probes: cands.map((j) => ({ j, kind: isT(j) ? "tabu" : "cand" })), cls: nt ? "reject" : "", cap: nt ? `👣 ${nt} spot(s) have fresh footprints → <b>forbidden</b> (red).` : "👣 No footprints nearby: every spot is allowed." });
        const ev = ex.step();
        if (ev.type === "wait") { snap({ line: 4, cap: "⏳ Every spot is forbidden: wait for footprints to melt." }); continue; }
        F.push({ line: 4, pos: ev.to, best: ex.best, trail: ex.trail.slice(), footprints: fp, probes: [{ j: ev.to, kind: "better" }], vnd: [-1, -1, -1], energy: ex.energy, cls: ev.uphill ? "sa" : "improve",
          cap: ev.uphill ? `⬆️ The best allowed spot is <b>uphill</b> (${alt(ev.to)}). Take it anyway: that's how you climb out of a valley.` : `⬇️ Walk downhill to ${alt(ev.to)}.` + (ev.asp ? " ✨ (a footprint, but allowed: new record = aspiration)" : "") });
        snap({ line: 5, cap: `🫧 Footprint left at ${alt(from)}: you can't go back there for 7 steps.` });
        if (!ev.record) { snap({ line: 6, cls: "", cap: `Not lower than the record ⭐ ${alt(ex.best)}, so no area search this round.` }); continue; }
        snap({ line: 6, cls: "best", cap: `⭐ <b>New record ${alt(ex.pos)}!</b> Run VND: search the area with 3 tools.` });
        const v = [-1, -1, -1], plan = ex.vndPlan();
        for (const p of plan) {
          v[p.k] = 0;
          snap({ line: 6, pos: p.from, vnd: v.slice(), probes: p.probes.map((j) => ({ j, kind: "cand" })), cap: `${VN[p.k]}: checking ${p.probes.length} spot(s)…` });
          if (p.found != null) {
            v.fill(-1); v[p.k] = 1;
            snap({ line: 6, pos: p.found, vnd: v.slice(), probes: [{ j: p.found, kind: "better" }], cls: "improve", cap: `${VN[p.k]} found lower ground (${alt(p.found)}) → move there, restart from 🔦.` + (p.found === M.TREASURE ? " 💎" : "") });
            v[p.k] = -1;
          } else {
            v[p.k] = 2;
            snap({ line: 6, pos: p.from, vnd: v.slice(), cls: "reject", cap: `${VN[p.k]} found nothing lower → next tool.` });
          }
        }
        snap({ line: 6, vnd: [2, 2, 2], cls: "best", cap: `All 3 tools failed: area fully searched. best ← ${alt(ex.pos)}.` });
        if (ex.best === M.TREASURE) break;
      }
      snap({ line: 7, cls: "best", treasure: true, cap: `💎 <b>return best</b>: altitude ${alt(ex.best)}, the deepest valley, after ${ex.energy} energy. A plain downhill walker from the same start stops at ${alt(M.HELI_START + 2)}.` });
      return F;
    }
    function show() {
      const f = frames[fi]; if (!f) return;
      const inVnd = f.vnd.some((x) => x >= 0 && x < 2);
      M.draw($("#cvAlg"), { treasure: f.line === 7, fog: f.pos != null && f.line < 7 && !inVnd, R: 2, pos: f.pos, best: f.best, trail: f.trail, footprints: f.footprints, probes: f.probes, heli: f.heli });
      $$("#pcode .ln").forEach((d) => { const l = +d.dataset.l; d.classList.toggle("on", l === f.line); d.classList.toggle("done", l < f.line); });
      const on = $(`#pcode .ln[data-l="${f.line}"]`); on.classList.remove("flash"); void on.offsetWidth; on.classList.add("flash");
      $$("#algVnd span").forEach((s, k) => { s.className = ["", "on", "ok", "fail"][f.vnd[k] + 1]; });
      $("#capAlg").className = "caption " + (f.cls || "");
      $("#capAlg").innerHTML = f.cap + ` <span class="note">· ${fi + 1}/${frames.length}</span>`;
      $("#algMeter").textContent = `🔋 ${f.energy} · ⭐ ${f.best == null ? "–" : alt(f.best)}`;
    }
    function stop() { clearInterval(timer); timer = null; $("#algRun").textContent = "▶ Run"; }
    const next = () => { if (fi >= frames.length - 1) return stop(); fi++; show(); };
    function reset() { stop(); frames = build(); fi = 0; show(); }
    $("#algStep").addEventListener("click", () => { stop(); next(); });
    $("#algReset").addEventListener("click", reset);
    $("#algRun").addEventListener("click", () => { if (timer) return stop(); if (fi >= frames.length - 1) reset(); $("#algRun").textContent = "⏸ Pause"; timer = setInterval(next, 900); });
    return { enter() { if (!frames.length) reset(); else show(); }, leave: stop };
  })();

  // c4: VND tools
  hooks.c4 = (() => {
    let ex, busy = false;
    const NAMES = ["🔦 flashlight", "🔭 binoculars", "🪂 paraglider"];
    const setTool = (k, cls) => $$("#tools > div").forEach((d) => { d.classList.remove("on", "fail"); if (+d.dataset.k === k) d.classList.add(cls); });
    function reset() {
      ex = new M.Explorer({ start: 35 }); ex.trail = [20, 22, 21, 23, 24, 25, 26, 27, 28, 30, 32, 33, 35]; ex.best = 35;
      setTool(-1); M.draw($("#cvC4"), mstate(ex, { treasure: true, footprints: [] }));
      $("#capC4").className = "caption best"; $("#capC4").innerHTML = `⭐ You just reached a <b>new record low</b> (altitude ${alt(35)}, lower than the 0.54 valley you came from). Before moving on, search the area with your 3 tools.`;
    }
    $("#c4Run").addEventListener("click", async () => {
      if (busy) return; busy = true; reset(); await sleep(400);
      const plan = ex.vndPlan(); const show = new M.Explorer({ start: 35 }); show.trail = [20, 22, 21, 23, 24, 25, 26, 27, 28, 30, 32, 33, 35]; show.best = 35;
      for (const p of plan) {
        setTool(p.k, "on");
        M.draw($("#cvC4"), mstate(show, { treasure: true, footprints: [], probes: p.probes.map((j) => ({ j, kind: "cand" })) }));
        $("#capC4").className = "caption"; $("#capC4").innerHTML = `${NAMES[p.k]}: checking ${p.probes.length} spot(s)…`;
        await sleep(650);
        if (p.found != null) {
          show.pos = p.found; show.trail.push(p.found); show.best = p.found;
          M.draw($("#cvC4"), mstate(show, { treasure: true, footprints: [], probes: [{ j: p.found, kind: "better" }] }));
          $("#capC4").className = "caption improve"; $("#capC4").innerHTML = `${NAMES[p.k]} found a lower spot (${alt(p.found)}). Go there and <b>start again with tool 1</b>.` + (p.found === M.TREASURE ? " 💎" : "");
        } else {
          setTool(p.k, "fail");
          $("#capC4").className = "caption reject"; $("#capC4").innerHTML = `${NAMES[p.k]} found nothing lower, so try the <b>next tool</b>.`;
        }
        await sleep(650);
      }
      $("#capC4").className = "caption best";
      $("#capC4").innerHTML = `🏁 All 3 tools failed, so this area is fully searched. Altitude <b>${alt(show.pos)}</b>` + (show.pos === M.TREASURE ? " 💎 and it's the treasure!" : ".") + " Now continue the footprint walk.";
      busy = false;
    });
    return { enter() { if (!ex) reset(); } };
  })();

  // c5: full expedition game
  hooks.c5 = (() => {
    let busy = false; const ENERGY = 25;
    $("#c5Board").innerHTML = "<tr><th>🚁</th><th>👣</th><th>🔦</th><th>lowest</th><th>💎 found at step</th></tr>";
    async function run(heli, mem, vnd, delay) {
      const ex = new M.Explorer({ start: heli ? M.HELI_START : M.RANDOM_START, memory: mem, vnd, tenure: 5 });
      let found = null;
      const draw = () => M.draw($("#cvC5"), mstate(ex, { treasure: true }));
      while (ex.energy < ENERGY) {
        const ev = ex.step();
        if (ev.type === "move" && ev.record && vnd && ex.energy < ENERGY) ex.vndPlan();
        if (found == null && ex.best === M.TREASURE) found = ex.energy;
        draw(); $("#capC5").innerHTML = `🔋 energy used ${ex.energy} / ${ENERGY} · lowest so far ${alt(ex.best)}`;
        await sleep(delay);
      }
      const ck = (b) => (b ? "✅" : "✗");
      $("#c5Board").insertAdjacentHTML("beforeend", `<tr class="${found ? "win" : ""}"><td>${ck(heli)}</td><td>${ck(mem)}</td><td>${ck(vnd)}</td><td class="mono">${alt(ex.best)}</td><td>${found ? "💎 step " + found : "—"}</td></tr>`);
      $("#capC5").className = "caption " + (found ? "best" : "reject");
      $("#capC5").innerHTML = found ? `💎 Treasure found after ${found} steps of energy.` : `😞 Energy ran out at altitude ${alt(ex.best)}. No treasure.`;
    }
    $("#c5Run").addEventListener("click", async () => { if (busy) return; busy = true; await run($("#c5Heli").checked, $("#c5Mem").checked, $("#c5Vnd").checked, 180); busy = false; });
    $("#c5All").addEventListener("click", async () => {
      if (busy) return; busy = true;
      for (const c of [[1, 1, 1], [0, 1, 1], [1, 0, 1], [1, 1, 0]]) await run(!!c[0], !!c[1], !!c[2], 50);
      $("#capC5").className = "caption"; $("#capC5").innerHTML = "📋 Compare the rows: removing the 🚁 start or the 👣 footprints means the treasure is <b>never found</b> within the energy budget.";
      busy = false;
    });
    return { enter() { M.draw($("#cvC5"), { treasure: true, pos: M.HELI_START, best: M.HELI_START }); } };
  })();

  // =========================================================
  // Renderers for the real problem
  // =========================================================
  function renderDAG(svg, assign, opt = {}) {
    svg.innerHTML = "";
    const W = 760, H = 380, L = inst.levels.length, padX = 52, padY = 20, cw = 66, ch = 32;
    const pos = [];
    inst.levels.forEach((row, li) => row.forEach((t, i) => (pos[t] = [padX + (li * (W - 2 * padX)) / (L - 1), padY + ((i + 1) * (H - 2 * padY - 14)) / (row.length + 1)])));
    const gE = svgEl("g", {}, svg), gN = svgEl("g", {}, svg);
    const st = opt.state || {};
    for (let u = 0; u < inst.n; u++) for (const v of inst.succs[u]) {
      const x1 = pos[u][0] + cw / 2, y1 = pos[u][1], x2 = pos[v][0] - cw / 2, y2 = pos[v][1], mx = (x1 + x2) / 2;
      const inter = assign && inst.vms[assign[u]].dc !== inst.vms[assign[v]].dc;
      let cls = "edge" + (inter ? " inter" : "");
      if (opt.focus != null && (opt.anc?.has(u) && (opt.anc.has(v) || v === opt.focus))) cls += " e-anc";
      if (opt.focus != null && ((u === opt.focus || opt.desc?.has(u)) && opt.desc?.has(v))) cls += " e-desc";
      if (opt.focus != null && !cls.includes("e-")) cls += " e-dim";
      if (st[u] === "done") cls += " e-live";
      svgEl("path", { d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, class: cls, "marker-end": "url(#arr)" }, gE);
    }
    const defs = svgEl("defs", {}, svg);
    const mk = svgEl("marker", { id: "arr", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: "auto" }, defs);
    svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: "rgba(255,255,255,.45)" }, mk);
    for (let t = 0; t < inst.n; t++) {
      const [x, y] = pos[t];
      const cls = ["tnode"];
      if (opt.fresh && opt.fresh.has(t)) cls.push("new");
      if (opt.focus != null) cls.push(t === opt.focus ? "focus" : opt.anc.has(t) ? "anc" : opt.desc.has(t) ? "desc" : "dim");
      if (st[t]) cls.push("st-" + st[t]);
      const g = svgEl("g", { class: cls.join(" "), transform: `translate(${x - cw / 2},${y - ch / 2})` }, gN);
      svgEl("rect", { class: "body", width: cw, height: ch, rx: 9, fill: assign ? VM_COLORS[assign[t]] : "#3a3f55" }, g);
      svgEl("text", { x: 7, y: ch / 2 - 1 }, g).textContent = (st[t] === "done" ? "✓" : icon(t)) + " T" + t;
      svgEl("rect", { x: 6, y: ch - 5, width: ((cw - 12) * inst.tasks[t].len) / 40, height: 2.5, rx: 1, fill: "rgba(255,255,255,.6)" }, g);
      if (opt.onClick) g.addEventListener("click", () => opt.onClick(t));
      bindTip(g, () => {
        const tk = inst.tasks[t];
        let h = `<b>${icon(t)} Task T${t}</b><br>size ${tk.len}k MI · RAM ${tk.ram} GB${tk.gpu ? " · <b>needs GPU</b>" : ""}`;
        if (assign) h += `<br>runs on <b style="color:${VM_COLORS[assign[t]]}">${inst.vms[assign[t]].name}</b> for ${inst.exec[t][assign[t]].toFixed(1)} s`;
        if (opt.sim) h += `<br><span class="tt-k">${opt.sim.start[t].toFixed(1)}s → ${opt.sim.finish[t].toFixed(1)}s (deadline ${inst.deadline[t].toFixed(1)}s)</span>`;
        return h;
      });
    }
    inst.levels.forEach((row, li) => (svgEl("text", { class: "lvl", x: pos[row[0]][0], y: H - 4 }, svg).textContent = "step " + (li + 1)));
  }

  class Gantt {
    constructor(svg) { this.svg = svg; this.build(); }
    build() {
      const svg = this.svg; svg.innerHTML = "";
      this.tMax = 0; this.W = 760; this.H = 300; this.left = 112; this.top = 18; this.bottom = 22;
      this.rowH = (this.H - this.top - this.bottom) / inst.m;
      this.axis = svgEl("g", { class: "axis" }, svg);
      inst.vms.forEach((v, j) => {
        svgEl("rect", { class: "lane", x: this.left - 4, y: this.top + j * this.rowH + 2, width: this.W - this.left, height: this.rowH - 4, rx: 6 }, svg);
        svgEl("rect", { x: 2, y: this.top + j * this.rowH + 8, width: 6, height: this.rowH - 16, rx: 3, fill: VM_COLORS[j] }, svg);
        svgEl("text", { class: "rowl", x: 14, y: this.top + j * this.rowH + this.rowH / 2 + 4 }, svg).textContent = "🖥️ " + v.name;
      });
      this.mk = svgEl("line", { stroke: "#fbbf24", "stroke-dasharray": "4 3", "stroke-width": 2, y1: this.top, y2: this.H - this.bottom, x1: 0, x2: 0 }, svg);
      this.mkT = svgEl("text", { fill: "#fbbf24", "font-size": 11, "font-family": "monospace", y: this.top - 5 }, svg);
      this.g = [];
      for (let t = 0; t < inst.n; t++) {
        const g = svgEl("g", { class: "gt" }, svg);
        const r = svgEl("rect", { rx: 5, height: this.rowH - 12, width: 10 }, g);
        const tx = svgEl("text", { x: 5, y: (this.rowH - 12) / 2 }, g);
        bindTip(g, () => this.tipFor(t));
        this.g.push({ g, r, tx });
      }
    }
    tipFor(t) {
      if (!this.sim) return "";
      const v = this.a[t], s = this.sim;
      return `<b>${icon(t)} T${t}</b> on ${inst.vms[v].name}<br>${s.start[t].toFixed(1)}s → ${s.finish[t].toFixed(1)}s` + (s.finish[t] > inst.deadline[t] + 1e-9 ? `<br><span style="color:#f87171">⚠ misses its deadline (${inst.deadline[t].toFixed(1)}s)</span>` : "");
    }
    X(t) { return this.left + (t / this.tMax) * (this.W - this.left - 14); }
    setScale(tMax) {
      this.tMax = tMax; this.axis.innerHTML = "";
      for (let i = 0; i <= 5; i++) {
        const t = (tMax * i) / 5;
        svgEl("line", { x1: this.X(t), x2: this.X(t), y1: this.top, y2: this.H - this.bottom }, this.axis);
        svgEl("text", { x: this.X(t), y: this.H - 6, "text-anchor": "middle" }, this.axis).textContent = t.toFixed(0) + "s";
      }
    }
    update(a, sim, opt = {}) {
      this.a = a; this.sim = sim;
      if (!this.tMax || sim.makespan > this.tMax * 0.98) this.setScale(Math.max(sim.makespan * 1.15, inst.ref.makespan * 1.3));
      const placed = opt.placed || new Set();
      for (let t = 0; t < inst.n; t++) {
        const { g, r, tx } = this.g[t], v = a[t];
        const x = this.X(sim.start[t]), w = Math.max(3, this.X(sim.finish[t]) - x - 2), y = this.top + v * this.rowH + 6;
        g.style.transform = `translate(${x}px, ${y}px)`;
        g.style.opacity = opt.hidden && opt.hidden.has(t) ? 0 : 1;
        r.setAttribute("width", w); r.setAttribute("fill", VM_COLORS[v]);
        tx.textContent = w > 46 ? `${icon(t)}T${t}` : w > 24 ? `T${t}` : "";
        g.classList.toggle("placed", placed.has(t));
        g.classList.toggle("late", sim.finish[t] > inst.deadline[t] + 1e-9);
      }
      const shown = opt.hidden ? ALL().filter((t) => !opt.hidden.has(t)) : ALL();
      const ms = shown.length ? Math.max(...shown.map((t) => sim.finish[t])) : 0;
      const mx = this.X(ms);
      this.mk.style.opacity = shown.length ? 1 : 0;
      this.mk.setAttribute("x1", mx); this.mk.setAttribute("x2", mx);
      this.mkT.setAttribute("x", Math.min(mx + 4, this.W - 120)); this.mkT.textContent = "all done: " + ms.toFixed(1) + "s";
    }
  }

  function tiles(el, assign, small) {
    const e = E.fitness(inst, assign), m = e.mt, r = inst.ref;
    const d = (a, b) => { const p = (a / b - 1) * 100; return Math.abs(p) < 0.05 ? "" : `<span class="delta ${p > 0 ? "up" : "down"}">${p > 0 ? "+" : ""}${p.toFixed(0)}%</span>`; };
    el.innerHTML = (small ? "" : `<div class="tile"><span>⏱ Finish time</span><b>${fmt.s(m.makespan)}</b>${d(m.makespan, r.makespan)}</div><div class="tile"><span>💰 Cost</span><b>${fmt.cost(m.cost)}</b>${d(m.cost, r.cost)}</div>`) +
      `<div class="tile"><span>⚡ Energy</span><b>${fmt.kJ(m.energy)}</b>${d(m.energy, r.energy)}</div>` +
      `<div class="tile"><span>📜 Late tasks</span><b>${fmt.pct(m.slaRate)}</b></div>` +
      `<div class="tile big"><span>Score F ↓</span><b>${e.f.toFixed(4)}</b></div>`;
    return e;
  }

  function drawConv(cv, series, ref) {
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    const all = series.flatMap((s) => s.data).concat(ref != null ? [ref] : []);
    let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.1 || 0.01; lo -= pad; hi += pad;
    const n = Math.max(2, ...series.map((s) => s.data.length)), l = 42, r = 8, t = 6, b = 14;
    const X = (i) => l + (i / (n - 1)) * (W - l - r), Y = (v) => t + (1 - (v - lo) / (hi - lo)) * (H - t - b);
    c.font = "10px monospace"; c.fillStyle = "#8b8a84"; c.strokeStyle = "rgba(255,255,255,.06)";
    for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) * i) / 3; c.beginPath(); c.moveTo(l, Y(v)); c.lineTo(W - r, Y(v)); c.stroke(); c.fillText(v.toFixed(3), 2, Y(v) + 3); }
    c.fillText("rounds →", W - 60, H - 2);
    if (ref != null) { c.setLineDash([5, 4]); c.strokeStyle = "#fbbf24"; c.beginPath(); c.moveTo(l, Y(ref)); c.lineTo(W - r, Y(ref)); c.stroke(); c.setLineDash([]); c.fillStyle = "#fbbf24"; c.fillText("HEFT 0.8", l + 4, Y(ref) - 4); }
    for (const s of series) { c.strokeStyle = s.color; c.lineWidth = s.w; c.beginPath(); s.data.forEach((v, i) => (i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)))); c.stroke(); }
  }

  // =========================================================
  // PART 2: the real problem
  // =========================================================
  function buildCloud() {
    const meter = (label, frac, c, d) => `<div class="meter" style="--c:${c};--d:${d}s"><span>${label}</span><div class="bar2"><div style="width:${frac * 100}%"></div></div></div>`;
    $("#dcs").innerHTML = [0, 1].map((dc) => {
      const vms = inst.vms.map((v, i) => [v, i]).filter(([v]) => v.dc === dc);
      return `<div class="dc in" style="--d:${0.1 + dc * 0.3}s"><div class="dcl">🏢 Datacenter ${dc}</div><div class="vms">` +
        vms.map(([v, i], k) => `<div class="vmcard" style="--c:${VM_COLORS[i]}"><div class="rack">${v.gpu ? "🎮" : "🖥️"}</div><b>${v.name}</b>
          ${meter("🚀 speed", v.mips / 6, VM_COLORS[i], 0.3 + k * 0.1)}${meter("💰 price", v.cost / 0.0004, VM_COLORS[i], 0.4 + k * 0.1)}
          ${meter("⚡ power", v.pMax / 450, VM_COLORS[i], 0.5 + k * 0.1)}${meter("🧠 RAM", v.ram / 16, VM_COLORS[i], 0.6 + k * 0.1)}
          <div class="note">${v.mips}k MIPS · ${v.ram} GB${v.gpu ? " · GPU" : ""}</div></div>`).join("") + "</div></div>";
    }).join("") + `<div class="link in" style="--d:.7s">DC0 <span></span> 20 MB/s between datacenters (slow!) <span></span> DC1</div>`;
  }

  // workflow: click = dependencies, play = execution order
  hooks.workflow = (() => {
    let busy = false;
    const relatives = (t, dir) => { const out = new Set(), q = [t]; while (q.length) { const x = q.pop(); for (const y of dir === "up" ? inst.preds[x] : inst.succs[x]) if (!out.has(y)) { out.add(y); q.push(y); } } return out; };
    function show(focus) {
      if (focus == null) { renderDAG($("#dagWorkflow"), null, { onClick: show }); return; }
      const anc = relatives(focus, "up"), desc = relatives(focus, "down");
      renderDAG($("#dagWorkflow"), null, { focus, anc, desc, onClick: (t) => show(t === focus ? null : t) });
      $("#capWf").innerHTML = `<b>T${focus}</b> must wait for <b style="color:#fb923c">${anc.size ? [...anc].map((x) => "T" + x).join(", ") : "nothing"}</b> (orange) and unlocks <b style="color:#22d3ee">${desc.size ? [...desc].map((x) => "T" + x).join(", ") : "nothing"}</b> (cyan). Click it again to clear.`;
    }
    $("#wfPlay").addEventListener("click", async () => {
      if (busy) return; busy = true;
      const st = {};
      for (let L = 0; L < inst.levels.length; L++) {
        inst.levels[L].forEach((t) => (st[t] = "running"));
        renderDAG($("#dagWorkflow"), null, { state: st });
        $("#capWf").innerHTML = `▶ Step ${L + 1}: ${inst.levels[L].map((t) => "T" + t).join(", ")} are <b>running</b>. All their inputs are ready.`;
        await sleep(1100);
        inst.levels[L].forEach((t) => (st[t] = "done"));
        renderDAG($("#dagWorkflow"), null, { state: st });
        await sleep(400);
      }
      $("#capWf").innerHTML = "✅ Workflow finished. Each task started only after all the tasks pointing into it were done.";
      busy = false;
    });
    return { enter() { show(null); } };
  })();

  // try
  let pAssign = inst.heft.slice();
  const gTry = new Gantt($("#ganttTry"));
  function presets() {
    return {
      heft: inst.heft.slice(), random: E.randomAssign(inst, E.RNG(99)),
      cheap: inst.feasible.map((f, t) => f.reduce((b, v) => (inst.exec[t][v] * inst.vms[v].cost < inst.exec[t][b] * inst.vms[b].cost ? v : b))),
      fast: inst.feasible.map((f, t) => f.reduce((b, v) => (inst.exec[t][v] < inst.exec[t][b] ? v : b))),
    };
  }
  function renderTry(changed) {
    const sim = E.simulate(inst, pAssign);
    renderDAG($("#dagTry"), pAssign, { sim, fresh: changed != null ? new Set([changed]) : null, onClick: (t) => { const f = inst.feasible[t]; pAssign[t] = f[(f.indexOf(pAssign[t]) + 1) % f.length]; renderTry(t); } });
    gTry.update(pAssign, sim, { placed: changed != null ? new Set([changed]) : null });
    const e = tiles($("#tilesTry"), pAssign);
    $("#vmChips").innerHTML = inst.vms.map((v, i) => `<i class="vchip" style="background:${VM_COLORS[i]}">VM${i}</i>`).join("");
    const cap = $("#capTry");
    cap.className = "caption " + (e.f < 0.8 - 1e-9 ? "best" : e.f > 0.8 + 1e-9 ? "" : "improve");
    cap.innerHTML = (changed != null ? `You moved <b>T${changed}</b> to <b style="color:${VM_COLORS[pAssign[changed]]}">${inst.vms[pAssign[changed]].name}</b>. ` : "") +
      (e.f < 0.8 - 1e-9 ? `🏆 <b>Your score ${e.f.toFixed(4)} beats HEFT (0.8000)!</b>` : `🎯 <b>Challenge:</b> get the score below HEFT's <b>0.8000</b>. Yours: <b>${e.f.toFixed(4)}</b>.`);
  }
  $$("[data-preset]").forEach((b) => b.addEventListener("click", () => { pAssign = presets()[b.dataset.preset]; renderTry(); }));
  hooks.try = { enter: () => renderTry() };

  // score receipt
  const W = Object.assign({}, E.DEFAULT_W);
  let pick = "heft";
  const WL = [["makespan", "⏱ time"], ["cost", "💰 cost"], ["energy", "⚡ energy"], ["sla", "📜 deadlines"]];
  function buildSliders() {
    $("#weightSliders").innerHTML = WL.map(([k, l], i) => `<label><span style="color:${TERM_COLORS[i]}">${l}</span><input type="range" min="0" max="1" step="0.05" value="${W[k]}" data-w="${k}"><b class="mono" id="wv-${k}">${W[k].toFixed(2)}</b></label>`).join("");
    $$("[data-w]").forEach((s) => s.addEventListener("input", () => { W[s.dataset.w] = +s.value; $("#wv-" + s.dataset.w).textContent = (+s.value).toFixed(2); renderReceipt(); }));
  }
  $("#resetWeights").addEventListener("click", () => { Object.assign(W, E.DEFAULT_W); buildSliders(); renderReceipt(); });
  const SCHED = [["heft", "⚡ HEFT"], ["yours", "👤 Your schedule (slide 10)"], ["random", "🎲 Random"], ["cheap", "💰 Cheapest VM"], ["fast", "🚀 All on fastest"]];
  function renderReceipt() {
    $("#schedPick").innerHTML = SCHED.map(([k, l]) => `<button class="${k === pick ? "on" : ""}" data-k="${k}">${l}</button>`).join("");
    $$("#schedPick button").forEach((b) => b.addEventListener("click", () => { pick = b.dataset.k; renderReceipt(); }));
    const P = presets(), a = pick === "yours" ? pAssign : P[pick], mt = E.metrics(inst, a), r = inst.ref;
    const rows = [
      ["⏱ Finish time", fmt.s(mt.makespan), fmt.s(r.makespan), mt.makespan / r.makespan, W.makespan, 0],
      ["💰 Cost", fmt.cost(mt.cost), fmt.cost(r.cost), mt.cost / r.cost, W.cost, 1],
      ["⚡ Energy", fmt.kJ(mt.energy), fmt.kJ(r.energy), mt.energy / r.energy, W.energy, 2],
      ["📜 Deadlines", `${fmt.pct(mt.slaRate)} late`, "0% late", mt.slaRate + mt.slaTard, W.sla, 3],
    ];
    const total = rows.reduce((s, x) => s + x[3] * x[4], 0);
    $("#receipt").innerHTML = `<div class="rc-title">🧾 Score receipt: <b>${SCHED.find((x) => x[0] === pick)[1]}</b></div>
      <table class="rc"><tr><th>Goal</th><th>This schedule</th><th>HEFT</th><th>Ratio</th><th></th><th>Weight</th><th></th><th>Points</th></tr>` +
      rows.map(([n, v, h, ratio, w, i]) => `<tr><td style="color:${TERM_COLORS[i]}">${n}</td><td>${v}</td><td class="muted">${h}</td><td class="mono ${ratio > 1.0005 ? "up" : ratio < 0.9995 && i < 3 ? "down" : ""}">${ratio.toFixed(2)}${i === 3 ? "*" : ""}</td><td>×</td><td class="mono">${w.toFixed(2)}</td><td>=</td><td class="mono"><b>${(ratio * w).toFixed(3)}</b></td></tr>`).join("") +
      `<tr class="tot"><td colspan="7">Total score F (lower is better)</td><td class="mono"><b>${total.toFixed(3)}</b></td></tr></table>
      <div class="rc-bar">${rows.map((x, i) => `<div style="flex:${Math.max(0.0001, x[3] * x[4])};background:${TERM_COLORS[i]}" title="${x[0]}"></div>`).join("")}</div>
      <p class="note">* Deadlines: share of late tasks + average lateness (0 = all on time).</p>
      <p class="verdict">${total < 0.8 - 1e-9 ? "✅ Better than HEFT" : total > 0.8 + 1e-9 ? `❌ ${((total / 0.8 - 1) * 100).toFixed(0)}% worse than HEFT` : "= Same as HEFT"}</p>`;
  }
  hooks.score = { enter: renderReceipt };

  hooks.hard = {
    enter() {
      const t0 = performance.now(), target = Math.pow(5, 16), me = cur;
      const f = (now) => {
        const k = Math.min(1, (now - t0) / 1800), e = 1 - Math.pow(1 - k, 3);
        $("#h1").textContent = Math.round(target * Math.pow(e, 4)).toLocaleString("en-US");
        $("#h2").innerHTML = `10<sup>${Math.round(390 * e)}</sup>`;
        if (k < 1 && cur === me) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    },
  };

  // =========================================================
  // PART 3: the real algorithm
  // =========================================================
  hooks.heft = (() => {
    const g = new Gantt($("#ganttHeft"));
    let steps, k = 0, timer = null;
    function order() { $("#hOrder").innerHTML = steps.map((s, i) => `<span class="${i < k - 1 ? "done" : i === k - 1 ? "now" : ""}">${i < k - 1 ? "✓ " : ""}T${s.t}<small>${s.rank.toFixed(0)}</small></span>`).join(""); }
    function reset() {
      steps = E.heftTrace(inst); k = 0; g.build();
      g.update(inst.heft, E.simulate(inst, inst.heft), { hidden: new Set(ALL()) });
      $("#hCount").textContent = `0 / ${inst.n} placed`;
      $("#hInfo").innerHTML = `<p>The schedule is empty. Press <b>Place next task</b>.</p><p class="note">Each step takes the <b>next task</b> in the urgency list on the left and tries it on every VM.</p>`;
      order();
    }
    function step() {
      if (k >= steps.length) return stop();
      const s = steps[k++], sim = E.simulate(inst, inst.heft);
      g.update(inst.heft, sim, { hidden: new Set(steps.slice(k).map((x) => x.t)), placed: new Set([s.t]) });
      $("#hCount").textContent = `${k} / ${inst.n} placed`;
      order();
      const mx = Math.max(...s.opts.map((o) => o.eft));
      $("#hInfo").innerHTML = `<p>Step ${k}: <b>${icon(s.t)} T${s.t}</b> is the most urgent task not yet placed.</p><p class="small">"If I put it on this VM, when would it finish?" (waiting for its inputs + the VM to be free + its own run time)</p>` +
        s.opts.map((o) => `<div class="eftrow${o.v === s.chosen ? " win" : ""}"><span>VM${o.v}</span><div class="track"><div style="width:${(o.eft / mx) * 100}%;background:${VM_COLORS[o.v]}"></div></div><span class="mono">${o.eft.toFixed(1)}s${o.v === s.chosen ? " ✓" : ""}</span></div>`).join("") +
        (inst.feasible[s.t].length < inst.m ? `<p class="note">Only ${inst.feasible[s.t].length} VMs can run it (${inst.tasks[s.t].gpu ? "needs a GPU" : "needs 4 GB RAM"}).</p>` : "") +
        `<p>➡ Earliest finish: <b style="color:${VM_COLORS[s.chosen]}">VM${s.chosen}</b>, so place it there.</p>` +
        (k === steps.length ? `<p class="okmsg">✅ All placed! HEFT's score = <b>0.8000</b>. 🚁 That's where the helicopter drops us.</p>` : "");
      if (k >= steps.length) stop();
    }
    function stop() { clearInterval(timer); timer = null; $("#hPlay").textContent = "▶ Play"; }
    $("#hStep").addEventListener("click", step);
    $("#hReset").addEventListener("click", () => { stop(); reset(); });
    $("#hPlay").addEventListener("click", () => { if (timer) return stop(); if (k >= steps.length) reset(); $("#hPlay").textContent = "⏸ Pause"; timer = setInterval(step, 1400); });
    return { enter() { if (!steps || g.g.length !== inst.n) reset(); }, leave: stop, reset() { steps = null; } };
  })();

  hooks.nbrs = (() => {
    const g = new Gantt($("#ganttNb")); let draw = 0;
    const KIND = { critical: "🎯 Critical-path move", bottleneck: "🔥 Bottleneck move", cheap: "💰 Cheaper-VM move", swap: "🔄 Swap" };
    $$("[data-id=nbrs] .opcard").forEach((c) => c.addEventListener("click", () => {
      $$("[data-id=nbrs] .opcard").forEach((x) => x.classList.toggle("on", x === c));
      const ts = new E.HEFTTS(inst, E.RNG(17 + draw++));
      const all = ts.neighbours(ts.cur, ts.curSim).filter((n) => n.kind === c.dataset.k);
      const base = E.simulate(inst, inst.heft);
      if (!all.length) { g.update(inst.heft, base); $("#nbCap").innerHTML = `No ${KIND[c.dataset.k]} available this time. Click again.`; return; }
      const n = all[0], b = ts.apply(ts.cur, n.mv), e = E.fitness(inst, b), d = e.f - 0.8, txt = n.mv.map(([t, v]) => `T${t}: VM${inst.heft[t]} → VM${v}`).join(", ");
      g.update(inst.heft, base, { placed: new Set(n.mv.map(([t]) => t)) });
      $("#nbCap").className = "caption"; $("#nbCap").innerHTML = `${KIND[n.kind]}: ${txt}…`;
      setTimeout(() => {
        g.update(b, e.sim, { placed: new Set(n.mv.map(([t]) => t)) });
        $("#nbCap").className = "caption " + (d < 0 ? "improve" : "reject");
        $("#nbCap").innerHTML = `${KIND[n.kind]}: ${txt} → score <b>${e.f.toFixed(4)}</b> (${d < 0 ? "✅ lower = better, " : "❌ higher = worse, "}${d >= 0 ? "+" : ""}${d.toFixed(4)} vs HEFT). Click again for another example.`;
      }, 900);
    }));
    return { enter() { g.build(); g.update(inst.heft, E.simulate(inst, inst.heft)); $("#nbCap").className = "caption"; } };
  })();

  hooks.vnd = (() => {
    const g = new Gantt($("#ganttVnd")); let busy = false, n = 0, start;
    const setTool = (k, cls) => $$("#vTools > div").forEach((d) => { d.classList.remove("on", "fail"); if (+d.dataset.k === k) d.classList.add(cls); });
    function reset() { start = E.randomAssign(inst, E.RNG(500 + n)); g.build(); g.update(start, E.simulate(inst, start)); tiles($("#vndTiles"), start); setTool(-1); $("#vndLog").innerHTML = ""; }
    $("#vndRun").addEventListener("click", async () => {
      if (busy) return; busy = true; reset();
      const ts = new E.HEFTTS(inst, E.RNG(31 + n++), { budget: 100000 });
      const f0 = E.fitness(inst, start);
      const r = ts.vnd(start.slice(), f0.f, f0.sim);
      let prev = start, cap = $("#vndCap");
      cap.className = "caption"; cap.innerHTML = `Start: score <b>${f0.f.toFixed(4)}</b>.`;
      await sleep(600);
      for (const s of r.log) {
        setTool(s.k, "on");
        cap.className = "caption"; cap.innerHTML = `${["🔦 N1", "🔭 N2", "🪂 N3"][s.k]}: trying up to ${s.tried} moves…`;
        await sleep(600);
        if (s.improved) {
          const changed = new Set(ALL().filter((t) => s.a[t] !== prev[t])); prev = s.a;
          g.update(s.a, s.sim, { placed: changed }); tiles($("#vndTiles"), s.a);
          cap.className = "caption improve"; cap.innerHTML = `${["🔦 N1", "🔭 N2", "🪂 N3"][s.k]} found a better schedule: <b>${s.f.toFixed(4)}</b> (green outline = moved task). Back to 🔦 N1.`;
        } else { setTool(s.k, "fail"); cap.className = "caption reject"; cap.innerHTML = `${["🔦 N1", "🔭 N2", "🪂 N3"][s.k]}: none of ${s.tried} moves helped, so go to the next neighbourhood.`; }
        $("#vndLog").insertAdjacentHTML("beforeend", `<li class="${s.improved ? "ok" : "no"}">${["🔦", "🔭", "🪂"][s.k]} ${s.improved ? "✅ " + s.f.toFixed(4) : "❌"}</li>`);
        await sleep(700);
      }
      cap.className = "caption best"; cap.innerHTML = `🏁 No neighbourhood improves any more: <b>${f0.f.toFixed(4)} → ${r.f.toFixed(4)}</b>. This is a local optimum, and the tabu search continues from here.`;
      busy = false;
    });
    return { enter() { if (!start || g.g.length !== inst.n) reset(); } };
  })();

  // playground
  const T = { ts: null, playing: false, busy: false, seed: 1, g: new Gantt($("#ganttPlay")) };
  const TSPEEDS = [1800, 800, 150, 0], KI = { critical: "🎯", bottleneck: "🔥", cheap: "💰", swap: "🔄" };
  function tInit() {
    T.ts = new E.HEFTTS(inst, E.RNG(T.seed), { budget: 400 });
    T.g.build(); T.g.update(T.ts.cur, T.ts.curSim);
    $("#tBanner").className = "caption"; $("#tBanner").innerHTML = "🚁 Starts from the <b>HEFT</b> schedule (score 0.8000). Press <b>Step</b>.";
    $("#tIter").textContent = "round 0"; $("#tCands").innerHTML = ""; $("#tTabu").innerHTML = '<span class="note">no footprints yet</span>';
    tPanels();
  }
  function tPanels(ev) {
    const t = T.ts;
    $("#tBudget").textContent = `🔋 ${t.evals} / ${t.budget} evaluations`;
    tiles($("#tTiles"), t.best, true);
    drawConv($("#tConv"), [{ data: t.hist, color: "#34d399", w: 2.5 }, { data: t.curHist, color: "#9085e9", w: 1.2 }], 0.8);
    if (!ev) return;
    $("#tCands").innerHTML = ev.cands.slice().sort((a, b) => a.f - b.f).map((c) =>
      `<div class="cand${c.chosen ? " chosen" : ""}${c.tabu && !c.aspiration ? " tabu" : ""}"><span>${KI[c.kind]} ${c.mv.map(([t, v]) => `T${t}→VM${v}`).join(" ⇄ ")}</span><span class="mono">${c.f.toFixed(4)}</span><span>${c.chosen ? "✔ chosen" : c.aspiration ? "✨ exception" : c.tabu ? "👣 tabu" : ""}</span></div>`).join("");
    $("#tTabu").innerHTML = ev.tabuList.length ? ev.tabuList.map((x) => `<span class="tchip2">👣 T${x.t}↛VM${x.v} <small>${x.left}</small></span>`).join("") : '<span class="note">no footprints</span>';
  }
  async function tStep() {
    const t = T.ts;
    if (T.busy || t.done) { if (t.done) tStop(); return; }
    T.busy = true;
    const sp = TSPEEDS[+$("#tSpeed").value], ev = t.step(), cap = $("#tBanner");
    if (ev.chosen && sp >= 800) {
      T.g.update(ev.chosen.cand, ev.chosen.sim, { placed: new Set(ev.chosen.mv.map(([x]) => x)) });
      cap.className = "caption";
      cap.innerHTML = `🌫️ Scored <b>${ev.cands.length}</b> nearby schedules. Best one without footprints: ${KI[ev.chosen.kind]} <b>${ev.chosen.mv.map(([x, v]) => `T${x}→VM${v}`).join(" ⇄ ")}</b> (score ${ev.chosen.f.toFixed(4)})`;
      tPanels(ev);
      await sleep(sp * 0.5);
    }
    T.g.update(t.cur, t.curSim);
    const d = ev.chosen ? ev.chosen.f - E.fitness(inst, ev.prev).f : 0;
    cap.className = "caption " + (ev.newBest ? "best" : d > 0 ? "sa" : "improve");
    cap.innerHTML = ev.newBest
      ? `⭐ <b>New record!</b> 🔦 VND searched the area: ${ev.vndLog.map((s) => ["🔦", "🔭", "🪂"][s.k] + (s.improved ? "✅" : "❌")).join(" → ")} → <b>${ev.bestF.toFixed(4)}</b>`
      : d > 0 ? `⬆️ Took the best allowed move even though it's <b>worse</b> (+${d.toFixed(4)}). The footprints stop it from going straight back.`
      : `⬇️ Moved to a better schedule (${d.toFixed(4)}), but not a new record.`;
    $("#tIter").textContent = `round ${ev.it}`;
    tPanels(ev);
    if (t.done) { cap.innerHTML += ` · 🔋 <b>Budget used up.</b> Best = ${t.bestF.toFixed(4)}`; tStop(); }
    if (sp >= 800) await sleep(sp * 0.5);
    T.busy = false;
  }
  async function tLoop() { while (T.playing) { const sp = TSPEEDS[+$("#tSpeed").value]; if (sp === 0) { for (let i = 0; i < 3 && !T.ts.done; i++) T.ts.step(); } await tStep(); await sleep(sp < 800 ? Math.max(sp, 30) : 0); } }
  const tStop = () => { T.playing = false; $("#tPlay").textContent = "▶ Play"; };
  $("#tStep").addEventListener("click", () => { if (!T.playing) tStep(); });
  $("#tPlay").addEventListener("click", () => { if (T.ts.done) return; T.playing = !T.playing; $("#tPlay").textContent = T.playing ? "⏸ Pause" : "▶ Play"; if (T.playing) tLoop(); });
  $("#tReset").addEventListener("click", async () => { tStop(); while (T.busy) await sleep(30); T.seed++; tInit(); });
  $("#tShuffle").addEventListener("click", async () => {
    tStop(); while (T.busy) await sleep(30);
    seed += 13; inst = E.makeInstance(seed); pAssign = inst.heft.slice();
    gTry.build(); hooks.heft.reset(); tInit();
  });
  hooks.play = { enter() { if (!T.ts) tInit(); else tPanels(); }, leave: tStop };

  // ablation
  hooks.ablation = (() => {
    let busy = false;
    const V = [
      { name: "HEFT alone", ing: [1, 0, 0] },
      { name: "No 🚁 (random start)", ing: [0, 1, 1] },
      { name: "No 👣 (tenure 0)", ing: [1, 0, 1] },
      { name: "No 🔦 (no VND)", ing: [1, 1, 0] },
      { name: "Full HEFT-TS-VND", ing: [1, 1, 1], full: true },
    ];
    const stat = (v) => { if (!v.length) return null; const m = v.reduce((a, b) => a + b, 0) / v.length; return { m, sd: v.length > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)) : 0, n: v.length }; };
    function draw(S) {
      const max = Math.max(0.8, ...S.filter(Boolean).map((s) => s.m + s.sd)) * 1.3;
      $("#ablRows").innerHTML = `<div class="abl head"><span>version</span><span>🚁</span><span>👣</span><span>🔦</span><span>average score (shorter = better)</span></div>` +
        V.map((v, i) => { const s = S[i]; return `<div class="abl${v.full ? " full" : ""}"><span>${v.name}</span>${v.ing.map((x) => `<span class="${x ? "y" : "x"}">${x ? "✅" : "✗"}</span>`).join("")}<span class="barcell">${s ? `<i style="width:${(s.m / max) * 100}%"></i><em style="left:${((s.m - s.sd) / max) * 100}%;width:${((2 * s.sd) / max) * 100}%"></em><b>${s.m.toFixed(4)}${s.sd ? " ± " + s.sd.toFixed(4) : ""}</b>` : ""}</span></div>`; }).join("");
    }
    $("#ablRun").addEventListener("click", async () => {
      if (busy) return; busy = true; $("#ablRun").textContent = "running…";
      const vals = V.map(() => []), B = 300, SEEDS = 8;
      for (let s = 0; s < SEEDS; s++) {
        vals[0].push(0.8);
        vals[1].push(new E.HEFTTS(inst, E.RNG(100 + s), { budget: B, init: E.randomAssign(inst, E.RNG(200 + s)) }).run().bestF);
        vals[2].push(new E.HEFTTS(inst, E.RNG(100 + s), { budget: B, tenure: 0 }).run().bestF);
        const nv = new E.HEFTTS(inst, E.RNG(100 + s), { budget: B }); nv.vnd = (a, f, sim) => ({ a, f, sim, log: [] }); vals[3].push(nv.run().bestF);
        vals[4].push(new E.HEFTTS(inst, E.RNG(100 + s), { budget: B }).run().bestF);
        draw(vals.map(stat)); $("#ablVerdict").innerHTML = `running seed ${s + 1} / ${SEEDS}…`; await sleep(30);
      }
      const S = vals.map(stat), full = S[4].m;
      const verdict = (i, label) => { const d = (S[i].m / full - 1) * 100; return `<li>${label}: ${Math.abs(d) < 0.3 ? "≈ no difference here" : d > 0 ? `<b>${d.toFixed(1)}% worse</b>, so it helps` : `${(-d).toFixed(1)}% better (it doesn't help on this toy)`}</li>`; };
      $("#ablVerdict").className = "caption";
      $("#ablVerdict").innerHTML = `<b>What we learn</b> (toy workload, ${SEEDS} seeds):<ul class="vlist">${verdict(1, "Without the 🚁 HEFT start")}${verdict(2, "Without 👣 tabu memory")}${verdict(3, "Without 🔦 VND")}<li>Full hybrid vs HEFT alone: <b>${((1 - full / 0.8) * 100).toFixed(1)}% better</b></li></ul>`;
      $("#ablRun").textContent = "▶ Run again"; busy = false;
    });
    return { enter() { draw(V.map(() => null)); } };
  })();

  // ---- results (10-run mean ± std) ----
  const R = window.RESULTS;
  const METRICS = {
    fitness: ["Score F(x)", "lower is better", (v) => v.toFixed(4)],
    makespan: ["Finish time (s)", "lower is better", (v) => v.toFixed(0)],
    cost: ["Cost ($)", "lower is better", (v) => v.toFixed(3)],
    energy: ["Energy (MJ)", "lower is better", (v) => (v / 1e6).toFixed(2)],
    utilization: ["VM utilization", "higher is better", (v) => (v * 100).toFixed(1) + "%"],
    sla_rate: ["Late tasks (SLA)", "lower is better", (v) => (v * 100).toFixed(1) + "%"],
    runtime: ["Optimizer runtime (s)", "lower is better", (v) => v.toFixed(2)],
    evaluations: ["Fitness evaluations", "lower is better", (v) => v.toFixed(0)],
  };
  let scen = R.alibaba_medium ? "alibaba_medium" : Object.keys(R)[0], metric = "fitness";
  $("#scenTabs").innerHTML = Object.keys(R).map((k) => `<button data-sc="${k}">${k.replace("_", " · ")}</button>`).join("");
  $$("#scenTabs button").forEach((b) => b.addEventListener("click", () => { scen = b.dataset.sc; renderResults(); }));
  $("#metricSel").innerHTML = Object.entries(METRICS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join("");
  $("#metricSel").addEventListener("change", (e) => { metric = e.target.value; renderResults(); });
  function renderResults() {
    $$("#scenTabs button").forEach((b) => b.classList.toggle("on", b.dataset.sc === scen));
    const rows = R[scen], [label, dir, f] = METRICS[metric], hib = dir.startsWith("higher"), M = metric + "_mean", S = metric + "_std";
    const sorted = rows.slice().sort((a, b) => (hib ? b[M] - a[M] : a[M] - b[M]));
    $("#chartTitle").innerHTML = `${label}<small>${dir} · mean of ${rows[0].runs} runs, line = ± std · <span style="color:#3987e5">■</span> HEFT-TS-VND</small>`;
    const svg = $("#resChart"); svg.innerHTML = "";
    const Wd = 760, H = 340, left = 100, right = 150, rowH = H / rows.length, max = Math.max(...rows.map((r) => r[M] + r[S])) || 1;
    const X = (v) => (v / max) * (Wd - left - right);
    svgEl("line", { x1: left, x2: left, y1: 0, y2: H, stroke: "rgba(255,255,255,.15)" }, svg);
    sorted.forEach((r, i) => {
      const y = i * rowH + 5, h = rowH - 10, hl = r.algorithm === "HEFT-TS", w = Math.max(2, X(r[M]));
      svgEl("text", { class: "blabel" + (hl ? " hl" : ""), x: left - 8, y: y + h / 2 + 5, "text-anchor": "end" }, svg).textContent = hl ? "HEFT-TS-VND" : r.algorithm;
      const bar = svgEl("rect", { class: "bar", x: left, y, width: w, height: h, rx: 4, fill: hl ? "#3987e5" : "#55545a", style: `animation-delay:${i * 0.05}s` }, svg);
      if (r[S] > 0) svgEl("line", { x1: left + X(r[M] - r[S]), x2: left + X(r[M] + r[S]), y1: y + h / 2, y2: y + h / 2, stroke: "#f0efec", "stroke-width": 1.5 }, svg);
      svgEl("text", { class: "bval" + (hl ? " hl" : ""), x: left + X(r[M] + r[S]) + 8, y: y + h / 2 + 5 }, svg).textContent = f(r[M]) + (r[S] > 0 ? " ± " + f(r[S]) : "") + (i === 0 ? " ★" : "");
      bindTip(bar, `<b>${r.algorithm}</b> (${r.runs} runs)<br>` + Object.entries(METRICS).map(([k, m]) => `<span class="tt-k">${m[0]}:</span> ${m[2](r[k + "_mean"])} ± ${m[2](r[k + "_std"])}`).join("<br>"));
    });
    const ts = rows.find((r) => r.algorithm === "HEFT-TS"), alns = rows.find((r) => r.algorithm === "ALNS");
    const byF = rows.slice().sort((a, b) => a.fitness_mean - b.fitness_mean), rank = byF.indexOf(ts) + 1;
    $("#insights").innerHTML =
      `<div class="insight"><b>#${rank} of ${rows.length}</b>HEFT-TS-VND's rank by mean score${rank > 1 ? `. Best: ${byF[0].algorithm} (${byF[0].fitness_mean.toFixed(4)})` : " 🏆"}</div>` +
      `<div class="insight"><b>${((1 - ts.fitness_mean / 0.8) * 100).toFixed(2)}%</b>better score than HEFT alone (0.8 → ${ts.fitness_mean.toFixed(4)})</div>` +
      `<div class="insight"><b>${(alns.runtime_mean / ts.runtime_mean).toFixed(1)}× faster</b>than ALNS (${ts.runtime_mean.toFixed(2)}s vs ${alns.runtime_mean.toFixed(2)}s) at the same budget (~${ts.evaluations_mean.toFixed(0)} evaluations)</div>` +
      `<p class="note">Hover a bar for every metric (mean ± std).</p>`;
  }
  hooks.results = { enter: renderResults };

  // ---- repo map ----
  const FILES = [
    ["", "main.py", "Entry", "CLI entry point (<code>-s -d -a -w --quick</code>). It builds the scenarios and runs every algorithm. This is the only file you execute."],
    ["config", "settings.py", "Setup", "Scenarios (small 100 tasks/10 VMs, medium 300/20, large 800/40), weights 0.4/0.2/0.2/0.2, and all parameters: 4 workers, 4 clusters, 3 rounds, 400 local + 300 global iterations."],
    ["cloudsim", "entities.py", "Simulator", "Datacenter, Vm, and Cloudlet: the CloudSim building blocks, re-implemented in Python."],
    ["cloudsim", "workload.py", "Simulator", "The workflow DAG: tasks, predecessor/successor lists, and data per edge."],
    ["cloudsim", "environment.py", "Simulator", "4 VM types, the execution-time matrix (∞ if a task can't run on a VM), bandwidth, deadlines, and upward rank."],
    ["cloudsim", "simulation.py", "Simulator", "Discrete-event engine: turns 'task → VM' into start/finish times and VM busy time. Runs on every evaluation."],
    ["datasets", "google.py", "Data", "Google Cluster Trace 2011 → independent tasks (a bag of tasks)."],
    ["datasets", "alibaba.py", "Data", "Alibaba Trace 2018 → real DAG jobs, with dependencies parsed from names like <code>R6_3</code>."],
    ["datasets", "common.py", "Data", "Converts trace rows into cloudlets: length, RAM, and estimated output data."],
    ["datasets", "download.py", "Data", "Downloads the raw traces."],
    ["algorithms", "heft.py", "HEFT-TS-VND", "HEFT. A baseline, and <b>stage 1</b> of HEFT-TS-VND (the seed schedule)."],
    ["algorithms", "minmin.py", "Baseline", "Min-Min heuristic."],
    ["algorithms", "ga.py", "Baseline", "Genetic Algorithm and HEFT-GA."],
    ["algorithms", "pso.py", "Baseline", "Particle Swarm Optimisation."],
    ["algorithms", "aco.py", "Baseline", "Ant Colony Optimisation."],
    ["algorithms", "alns.py", "Baseline", "Plain ALNS on the whole workload."],
    ["algorithms", "heft_ts.py", "HEFT-TS-VND", "<b>The proposed hybrid.</b> HEFT seed → tabu search over critical-path / bottleneck / cheaper-VM / swap candidates (tenure 7, aspiration) → VND (N1 → N2 → N3) on every new best. Budget = <code>alns_iters</code> evaluations."],
    ["dha_alns", "dha_alns.py", "Baseline", "DHA-ALNS (earlier hybrid, now a baseline): HEFT → 3 × (decompose → parallel workers → coordinate) → global refine."],
    ["dha_alns", "analyzer.py", "Baseline", "Workload Analyzer: profiles each task's step, size, resource type, and data volume."],
    ["dha_alns", "decomposition.py", "Baseline", "Sorts tasks by dependency / resource / locality (a 2-level key) and cuts them into k equal-load clusters."],
    ["dha_alns", "worker.py", "Baseline", "One ALNS worker per process. It may only move its own cluster's tasks."],
    ["dha_alns", "alns_core.py", "Baseline", "The loop: roulette selection → destroy → repair → evaluate → SA accept → reward → adapt."],
    ["dha_alns", "operators.py", "Shared", "5 destroy operators (random, worst, critical path, bottleneck VM, related) and 4 repair operators (greedy EFT, regret, cost-energy, random)."],
    ["dha_alns", "coordinator.py", "Baseline", "merge (all at once, then one by one), validate, rebalance, global_refine."],
    ["evaluation", "objectives.py", "Score", "Runs the simulation and computes finish time, cost, energy, utilization, SLA, and F(x) normalised to HEFT."],
    ["evaluation", "experiment.py", "Experiment", "Runs every algorithm on a scenario. <code>run_multi</code> (<code>-r 10</code>) repeats with different seeds and writes <code>summary_*.csv</code> (mean ± std)."],
    ["evaluation", "report.py", "Experiment", "Writes the tables, the CSVs, and the PNG plots in <code>results/</code>."],
  ];
  const WHERE = ["Entry", "Setup", "Data", "Simulator", "HEFT-TS-VND", "Shared", "Score", "Baseline", "Experiment"];
  function buildTree() {
    let html = "", dir = null;
    FILES.forEach(([d, f, st], i) => { if (d !== dir) { dir = d; if (d) html += `<div class="dir">📁 ${d}/</div>`; } html += `<div class="file" data-i="${i}" style="${d ? "" : "padding-left:8px"}">📄 ${f}<span class="tag">${st}</span></div>`; });
    $("#tree").innerHTML = html;
    $$("#tree .file").forEach((el) => el.addEventListener("click", () => showFile(+el.dataset.i)));
    showFile(FILES.findIndex((f) => f[1] === "heft_ts.py"));
  }
  function showFile(i) {
    $$("#tree .file").forEach((el) => el.classList.toggle("on", +el.dataset.i === i));
    const [d, f, st, desc] = FILES[i];
    $("#fileInfo").innerHTML = `<span class="stagechip">${st}</span><h3>${d ? d + "/" : ""}${f}</h3><p>${desc}</p><div class="where">${WHERE.map((w) => `<span class="${w === st ? "on" : ""}">${w}</span>`).join("")}</div>`;
  }

  // ---- baselines ----
  const BASE = [
    ["⚡", "HEFT", "list heuristic", "Rank tasks by the work remaining after them, then greedily pick the VM with the earliest finish. Very fast, and stage 1 of HEFT-TS-VND."],
    ["⏱", "Min-Min", "list heuristic", "Repeatedly schedule the ready task that can finish soonest. Simple, but it piles work onto fast VMs."],
    ["🧬", "GA", "evolutionary", "A population of schedules that breed (crossover) and mutate. Explores broadly but needs many evaluations."],
    ["🐦", "PSO", "swarm", "Particles fly through a continuous space that is rounded to VM numbers. A poor fit for this discrete problem."],
    ["🐜", "ACO", "swarm", "Ants build schedules task by task, following pheromone trails that good schedules reinforce."],
    ["🔨", "ALNS", "local search", "Destroy and repair on the whole workload in one process. DHA-ALNS without the hybrid parts."],
    ["🧪", "HEFT-GA", "hybrid", "A GA seeded with the HEFT schedule, so it never ends up worse than HEFT."],
    ["🧩", "DHA-ALNS", "hybrid (earlier)", "HEFT → decompose → parallel ALNS → coordinate → refine. Built for very large workloads; too much overhead at 100–300 tasks."],
    ["🌟", "HEFT-TS-VND", "proposed", "HEFT seed → tabu search with targeted moves and memory → VND polishing. Fastest of the search methods at an equal budget."],
  ];
  $("#flips").innerHTML = BASE.map(([ic, n, k, d], i) => `<div class="flip in${n === "HEFT-TS-VND" ? " star" : ""}" style="--d:${i * 0.07}s"><div class="flip-in"><div class="face front"><i>${ic}</i><b>${n}</b><span>${k}</span></div><div class="face back">${d}</div></div></div>`).join("");
  $$(".flip").forEach((f) => f.addEventListener("click", () => f.classList.toggle("on")));

  // =========================================================
  // Deck navigation
  // =========================================================
  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    if (i === cur) return;
    if (cur >= 0) { const h = hooks[slides[cur].dataset.id]; h && h.leave && h.leave(); }
    slides.forEach((s, j) => { s.classList.toggle("active", j === i); s.classList.toggle("past", j < i); });
    cur = i;
    $("#count").textContent = `${i + 1} / ${slides.length}`;
    $("#progBar").style.width = ((i + 1) / slides.length) * 100 + "%";
    $("#secLabel").textContent = slides[i].dataset.sec;
    history.replaceState(null, "", "#" + (i + 1));
    $$("#menuList button").forEach((b, j) => b.classList.toggle("on", j === i));
    tip.classList.remove("show");
    const h = hooks[slides[i].dataset.id];
    if (h && h.enter) setTimeout(() => cur === i && h.enter(), 80);
  }
  $("#menuList").innerHTML = slides.map((s, i) => `<button><small>${i + 1} · ${s.dataset.sec}</small>${(s.querySelector("h2") || s.querySelector("h1")).textContent}</button>`).join("");
  $$("#menuList button").forEach((b, i) => b.addEventListener("click", () => { go(i); $("#menu").classList.remove("open"); }));
  $("#menuBtn").addEventListener("click", () => $("#menu").classList.toggle("open"));
  $("#menu").addEventListener("click", (e) => { if (e.target.id === "menu") $("#menu").classList.remove("open"); });
  $("#prevBtn").addEventListener("click", () => go(cur - 1));
  $("#nextBtn").addEventListener("click", () => go(cur + 1));
  addEventListener("keydown", (e) => {
    const tag = e.target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && tag !== "BUTTON")) { e.preventDefault(); go(cur + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(cur - 1); }
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(slides.length - 1);
    else if (e.key.toLowerCase() === "m") $("#menu").classList.toggle("open");
    else if (e.key === "Escape") $("#menu").classList.remove("open");
  });
  let tx0 = null;
  addEventListener("touchstart", (e) => (tx0 = e.touches[0].clientX), { passive: true });
  addEventListener("touchend", (e) => { if (tx0 == null) return; const dx = e.changedTouches[0].clientX - tx0; if (Math.abs(dx) > 70) go(cur + (dx < 0 ? 1 : -1)); tx0 = null; });
  let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { const h = hooks[slides[cur].dataset.id]; if (h && h.enter && ["title", "c1", "c2", "c3", "c4", "c5", "analogy", "play"].includes(slides[cur].dataset.id)) h.enter(); }, 200); });

  buildCloud(); buildSliders(); buildTree();
  go((parseInt(location.hash.slice(1)) || 1) - 1);
})();
