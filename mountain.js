/* mountain.js: the "treasure hunter in foggy mountains" metaphor for HEFT-TS-VND.
   A 1-D landscape: position = a schedule, altitude = score (lower = better). */
(function (G) {
  "use strict";
  const N = 61;
  const g = (x, m, s) => Math.exp(-((x - m) ** 2) / (2 * s * s));
  const ALT = Array.from({ length: N }, (_, i) => {
    const x = i / (N - 1);
    return 0.9 - 0.22 * g(x, 0.12, 0.045) - 0.36 * g(x, 0.36, 0.05) - 0.62 * g(x, 0.64, 0.06) - 0.3 * g(x, 0.88, 0.04)
      + 0.5 * Math.exp(-x / 0.03) + 0.5 * Math.exp(-(1 - x) / 0.03);
  });
  const TREASURE = ALT.indexOf(Math.min(...ALT));
  const RANDOM_START = 5, HELI_START = 20;

  class Explorer {
    constructor(o = {}) {
      this.pos = o.start ?? RANDOM_START; this.memory = o.memory ?? true; this.vnd = o.vnd ?? false;
      this.tenure = o.tenure ?? 5; this.R = o.R ?? 2; this.seed = o.seed ?? 7;
      this.it = 0; this.energy = 0; this.tabu = new Map(); this.best = this.pos; this.trail = [this.pos];
    }
    rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
    isTabu(j) { return (this.tabu.get(j) || 0) >= this.it; }
    footprints() { return [...this.tabu.entries()].filter(([, u]) => u > this.it).map(([j, u]) => ({ j, left: u - this.it })); }
    /** One tabu-search step. Without memory it still takes the best neighbour (tenure 0). */
    step() {
      this.it++; this.energy++;
      const from = this.pos, cands = [];
      for (let d = -this.R; d <= this.R; d++) { const j = from + d; if (d && j >= 0 && j < N) cands.push(j); }
      let pick = null, asp = false;
      for (const j of cands) {
        const t = this.memory && this.isTabu(j), a = t && ALT[j] < ALT[this.best];
        if (t && !a) continue;
        if (pick == null || ALT[j] < ALT[pick]) { pick = j; asp = a; }
      }
      const info = cands.map((j) => ({ j, tabu: this.memory && this.isTabu(j) }));
      if (pick == null) return { type: "wait", from, cands: info };
      if (this.memory) this.tabu.set(from, this.it + this.tenure);
      this.pos = pick; this.trail.push(pick);
      const record = ALT[pick] < ALT[this.best];
      if (record) this.best = pick;
      return { type: "move", from, to: pick, uphill: ALT[pick] > ALT[from], record, asp, cands: info };
    }
    /** VND around the current spot. Returns a plan of tool uses (each costs 1 energy). */
    vndPlan() {
      const plan = [];
      let k = 0;
      while (k < 3) {
        const p = this.pos;
        let probes;
        if (k === 0) probes = [p - 1, p + 1];
        else if (k === 1) probes = [p - 4, p - 3, p - 2, p + 2, p + 3, p + 4];
        else { probes = []; while (probes.length < 3) { const j = p + Math.round((this.rnd() * 2 - 1) * 12); if (Math.abs(j - p) > 4 && !probes.includes(j)) probes.push(j); } }
        probes = probes.filter((j) => j >= 0 && j < N);
        this.energy++;
        const found = probes.find((j) => ALT[j] < ALT[this.pos] - 1e-9);
        plan.push({ k, probes, found: found ?? null, from: p });
        if (found != null) { this.pos = found; this.trail.push(found); if (ALT[found] < ALT[this.best]) this.best = found; k = 0; }
        else k++;
      }
      return plan;
    }
    /** Greedy downhill walk (no memory, stop when nothing lower is visible). */
    greedyStep() {
      const from = this.pos; let pick = from;
      for (let d = -this.R; d <= this.R; d++) { const j = from + d; if (j >= 0 && j < N && ALT[j] < ALT[pick]) pick = j; }
      this.energy++;
      if (pick === from) return { type: "stuck", from };
      this.pos = pick; this.trail.push(pick); if (ALT[pick] < ALT[this.best]) this.best = pick;
      return { type: "move", from, to: pick };
    }
  }

  /** Draw the landscape. st: {pos, best, trail, footprints, probes, heli, explorerY, fog, treasure} */
  function draw(cv, st) {
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    cv.width = W * dpr; cv.height = H * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    const pad = 30, top = 70, bot = 34, lo = Math.min(...ALT) - 0.04;
    const X = (i) => pad + (i / (N - 1)) * (W - 2 * pad);
    const Y = (v) => top + (1 - (Math.min(v, 1.15) - lo) / (1.15 - lo)) * (H - top - bot);
    // sky
    const sky = c.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, "#0e1324"); sky.addColorStop(1, "#1b2140");
    c.fillStyle = sky; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(255,255,255,${0.15 + ((i * 37) % 10) / 30})`; c.fillRect((i * 97) % W, (i * 53) % (top + 20), 1.5, 1.5); }
    // mountains
    const path = new Path2D();
    path.moveTo(X(0), H); for (let i = 0; i < N; i++) path.lineTo(X(i), Y(ALT[i])); path.lineTo(X(N - 1), H); path.closePath();
    const mg = c.createLinearGradient(0, top, 0, H); mg.addColorStop(0, "#4b4f7a"); mg.addColorStop(0.6, "#2a2d4a"); mg.addColorStop(1, "#191b2e");
    c.fillStyle = mg; c.fill(path);
    c.beginPath(); for (let i = 0; i < N; i++) (i ? c.lineTo(X(i), Y(ALT[i])) : c.moveTo(X(i), Y(ALT[i]))); c.strokeStyle = "#c7d2fe"; c.lineWidth = 2.5; c.stroke();
    // altitude guide
    c.fillStyle = "#8b8a84"; c.font = "12px Inter, sans-serif";
    c.fillText("⬆ higher = worse", 8, 18); c.fillText("⬇ deeper = better", 8, H - 10);
    // treasure
    c.font = "24px serif"; c.textAlign = "center";
    if (st.treasure) c.fillText("💎", X(TREASURE), Y(ALT[TREASURE]) + 26);
    // trail
    if (st.trail && st.trail.length > 1) {
      c.setLineDash([3, 4]); c.strokeStyle = "rgba(251,191,36,.55)"; c.lineWidth = 1.5; c.beginPath();
      st.trail.forEach((j, k) => (k ? c.lineTo(X(j), Y(ALT[j]) - 6) : c.moveTo(X(j), Y(ALT[j]) - 6))); c.stroke(); c.setLineDash([]);
    }
    // footprints
    c.font = "17px serif";
    for (const f of st.footprints || []) {
      c.globalAlpha = 0.35 + 0.65 * Math.min(1, f.left / 5);
      c.fillText("👣", X(f.j), Y(ALT[f.j]) - 4);
      c.globalAlpha = 1; c.font = "bold 10px monospace"; c.fillStyle = "#fca5a5"; c.fillText(f.left, X(f.j), Y(ALT[f.j]) + 12); c.font = "17px serif";
    }
    // probes
    for (const p of st.probes || []) {
      if (p.j < 0 || p.j >= N) continue;
      c.beginPath(); c.arc(X(p.j), Y(ALT[p.j]), 7, 0, 7);
      c.strokeStyle = p.kind === "tabu" ? "#f87171" : p.kind === "better" ? "#34d399" : "#22d3ee"; c.lineWidth = 3; c.stroke();
    }
    // best
    if (st.best != null && st.best !== st.pos) { c.font = "18px serif"; c.fillText("⭐", X(st.best), Y(ALT[st.best]) + 22); }
    // explorer
    if (st.pos != null) {
      const ey = st.explorerY != null ? st.explorerY : Y(ALT[st.pos]) - 16;
      c.font = "30px serif"; c.fillText("🧗", X(st.pos), ey);
      c.font = "bold 11px monospace"; c.fillStyle = "#fbbf24"; c.fillText(ALT[st.pos].toFixed(2), X(st.pos), ey - 26);
    }
    // helicopter
    if (st.heli) {
      const hx = pad + st.heli.x * (W - 2 * pad);
      c.font = "38px serif"; c.save(); c.translate(hx, st.heli.y); c.scale(-1, 1); c.fillText("🚁", 0, 0); c.restore();
    }
    // fog
    if (st.fog && st.pos != null) {
      const R = st.R ?? 2, xl = X(Math.max(0, st.pos - R - 0.6)), xr = X(Math.min(N - 1, st.pos + R + 0.6)), e = 26;
      const fogc = "rgba(190,198,220,", a = 0.93;
      c.fillStyle = fogc + a + ")"; c.fillRect(0, 0, Math.max(0, xl - e), H); c.fillRect(xr + e, 0, W, H);
      let gr = c.createLinearGradient(xl - e, 0, xl, 0); gr.addColorStop(0, fogc + a + ")"); gr.addColorStop(1, fogc + "0)"); c.fillStyle = gr; c.fillRect(xl - e, 0, e, H);
      gr = c.createLinearGradient(xr, 0, xr + e, 0); gr.addColorStop(0, fogc + "0)"); gr.addColorStop(1, fogc + a + ")"); c.fillStyle = gr; c.fillRect(xr, 0, e, H);
      c.fillStyle = "#5b6078"; c.font = "15px Inter, sans-serif";
      if (xl > 120) c.fillText("🌫️ fog: you can't see here", (xl - e) / 2, H / 2);
      if (W - xr > 120) c.fillText("🌫️ fog: you can't see here", (xr + e + W) / 2, H / 2);
    }
    c.textAlign = "left";
    return { X, Y };
  }

  G.Mountain = { N, ALT, TREASURE, RANDOM_START, HELI_START, Explorer, draw };
})(window);
