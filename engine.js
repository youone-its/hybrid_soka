/* engine.js — tiny JS port of cloudsim_hybrid (simulator, HEFT, ALNS, DHA-ALNS).
   Mirrors: cloudsim/simulation.py, evaluation/objectives.py, algorithms/heft.py,
   dha_alns/{operators,alns_core,decomposition,coordinator}.py */
(function (G) {
  "use strict";

  // ---------- seeded RNG ----------
  function RNG(seed) {
    let s = seed >>> 0;
    const r = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.int = (n) => Math.floor(r() * n);
    r.uniform = (a, b) => a + r() * (b - a);
    r.choice = (arr) => arr[r.int(arr.length)];
    r.sample = (arr, k) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = r.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
      return a.slice(0, k);
    };
    r.roulette = (w) => {
      const tot = w.reduce((x, y) => x + y, 0);
      let x = r() * tot;
      for (let i = 0; i < w.length; i++) { x -= w[i]; if (x <= 0) return i; }
      return w.length - 1;
    };
    return r;
  }

  // VM types: mips (x1000), ram GB, gpu, $/s, P_idle, P_max (environment.py)
  const VM_TYPES = {
    small:  { mips: 1, ram: 2,  gpu: false, cost: 0.00002, pIdle: 50,  pMax: 120 },
    medium: { mips: 2, ram: 4,  gpu: false, cost: 0.00005, pIdle: 70,  pMax: 180 },
    large:  { mips: 4, ram: 8,  gpu: false, cost: 0.00012, pIdle: 100, pMax: 260 },
    gpu:    { mips: 6, ram: 16, gpu: true,  cost: 0.00040, pIdle: 150, pMax: 450 },
  };
  const INTRA_BW = 100, INTER_BW = 20; // MB/s

  // ---------- instance ----------
  function makeInstance(seed) {
    const rng = RNG(seed);
    const levelSizes = [2, 3, 4, 3, 3, 1];
    const tasks = [], levels = [];
    let id = 0;
    levelSizes.forEach((sz, L) => {
      const row = [];
      for (let i = 0; i < sz; i++) {
        tasks.push({ id, level: L, len: Math.round(rng.uniform(8, 40)), ram: rng() < 0.3 ? 4 : 1.5, gpu: false });
        row.push(id++);
      }
      levels.push(row);
    });
    tasks[levels[2][rng.int(levels[2].length)]].gpu = true; // one GPU task
    const n = tasks.length;
    const preds = Array.from({ length: n }, () => []), succs = Array.from({ length: n }, () => []);
    const data = {};
    const addEdge = (u, v) => {
      if (preds[v].includes(u)) return;
      preds[v].push(u); succs[u].push(v); data[u + "," + v] = Math.round(rng.uniform(20, 120));
    };
    for (let L = 1; L < levels.length; L++) {
      for (const v of levels[L]) {
        const k = 1 + (rng() < 0.45 ? 1 : 0);
        rng.sample(levels[L - 1], Math.min(k, levels[L - 1].length)).forEach((u) => addEdge(u, v));
      }
      for (const u of levels[L - 1]) if (!succs[u].length) addEdge(u, rng.choice(levels[L]));
    }
    const vms = [
      { name: "VM0 small", type: "small", dc: 0 },
      { name: "VM1 medium", type: "medium", dc: 0 },
      { name: "VM2 large", type: "large", dc: 0 },
      { name: "VM3 gpu", type: "gpu", dc: 1 },
      { name: "VM4 medium", type: "medium", dc: 1 },
    ].map((v, i) => Object.assign({ id: i }, VM_TYPES[v.type], v));
    const m = vms.length;
    const exec = tasks.map((t) => vms.map((v) => (t.ram > v.ram || (t.gpu && !v.gpu) ? Infinity : t.len / v.mips)));
    const feasible = exec.map((row) => row.map((e, j) => (isFinite(e) ? j : -1)).filter((j) => j >= 0));
    const meanExec = exec.map((row, i) => feasible[i].reduce((s, j) => s + row[j], 0) / feasible[i].length);
    const minExec = exec.map((row, i) => Math.min(...feasible[i].map((j) => row[j])));
    // upward rank (HEFT)
    const rankUp = new Array(n).fill(0);
    for (let t = n - 1; t >= 0; t--) {
      let mx = 0;
      for (const s of succs[t]) mx = Math.max(mx, data[t + "," + s] / 60 + rankUp[s]);
      rankUp[t] = meanExec[t] + mx;
    }
    const order = [...Array(n).keys()].sort((a, b) => rankUp[b] - rankUp[a]);
    const inst = { n, m, tasks, levels, preds, succs, data, vms, exec, feasible, meanExec, minExec, rankUp, order };
    inst.comm = (u, v, vu, vv) => {
      if (vu === vv) return 0;
      const d = data[u + "," + v] || 0;
      return d / (vms[vu].dc === vms[vv].dc ? INTRA_BW : INTER_BW);
    };
    inst.deadline = new Array(n).fill(Infinity);
    const h = heft(inst);
    const hs = simulate(inst, h);
    inst.deadline = hs.finish.map((f) => f * 1.15 + 2);
    inst.heft = h;
    inst.ref = metrics(inst, h);
    return inst;
  }

  // ---------- simulation (list scheduling, space-shared VMs) ----------
  function simulate(inst, a) {
    const { n, m, exec, preds, order } = inst;
    const start = new Array(n), finish = new Array(n), vmFree = new Array(m).fill(0), busy = new Array(m).fill(0);
    for (const t of order) {
      const v = a[t];
      let ready = 0;
      for (const p of preds[t]) ready = Math.max(ready, finish[p] + inst.comm(p, t, a[p], v));
      start[t] = Math.max(ready, vmFree[v]);
      finish[t] = start[t] + exec[t][v];
      vmFree[v] = finish[t];
      busy[v] += exec[t][v];
    }
    return { start, finish, busy, makespan: Math.max(...finish) };
  }

  function metrics(inst, a, sim) {
    sim = sim || simulate(inst, a);
    const T = sim.makespan;
    let cost = 0, energy = 0, late = 0, tard = 0;
    inst.vms.forEach((v, j) => { cost += sim.busy[j] * v.cost; energy += sim.busy[j] * v.pMax + (T - sim.busy[j]) * v.pIdle; });
    sim.finish.forEach((f, t) => { const d = Math.max(0, f - inst.deadline[t]); if (d > 1e-9) late++; tard += d / inst.deadline[t]; });
    return { makespan: T, cost, energy, util: sim.busy.reduce((x, y) => x + y, 0) / (inst.m * T), slaRate: late / inst.n, slaTard: tard / inst.n, sim };
  }

  const DEFAULT_W = { makespan: 0.4, cost: 0.2, energy: 0.2, sla: 0.2 };
  function fitnessParts(inst, mt, w) {
    w = w || DEFAULT_W;
    const r = inst.ref;
    return {
      T: w.makespan * mt.makespan / r.makespan,
      C: w.cost * mt.cost / r.cost,
      E: w.energy * mt.energy / r.energy,
      S: w.sla * (mt.slaRate + mt.slaTard),
    };
  }
  function fitness(inst, a, w) {
    const mt = metrics(inst, a);
    const p = fitnessParts(inst, mt, w);
    return { f: p.T + p.C + p.E + p.S, mt, sim: mt.sim };
  }

  // ---------- HEFT ----------
  function heft(inst) {
    const { n, m, exec, preds, order, feasible } = inst;
    const a = new Array(n), finish = new Array(n), vmFree = new Array(m).fill(0);
    for (const t of order) {
      let best = Infinity, bv = -1;
      for (const v of feasible[t]) {
        let ready = 0;
        for (const p of preds[t]) ready = Math.max(ready, finish[p] + inst.comm(p, t, a[p], v));
        const eft = Math.max(ready, vmFree[v]) + exec[t][v];
        if (eft < best) { best = eft; bv = v; }
      }
      a[t] = bv; finish[t] = best; vmFree[bv] = best;
    }
    return a;
  }

  function randomAssign(inst, rng) { return inst.feasible.map((f) => rng.choice(f)); }

  // ---------- destroy operators ----------
  const DESTROY = [
    { name: "Random", desc: "Remove k random tasks — pure diversification.",
      fn: (I, a, sim, mov, k, rng) => rng.sample(mov, k) },
    { name: "Worst", desc: "Remove tasks that run much slower than on their fastest VM, or that miss their deadline.",
      fn: (I, a, sim, mov, k, rng) => {
        const sc = mov.map((t) => I.exec[t][a[t]] / I.minExec[t] + Math.max(0, sim.finish[t] - I.deadline[t]) / I.deadline[t] + rng() * 0.3);
        return mov.map((t, i) => [t, sc[i]]).sort((x, y) => y[1] - x[1]).slice(0, k).map((x) => x[0]);
      } },
    { name: "Critical path", desc: "Trace back from the last-finishing task along the chain that determines makespan.",
      fn: (I, a, sim, mov, k, rng) => {
        const movS = new Set(mov);
        let t = sim.finish.indexOf(Math.max(...sim.finish));
        const path = [];
        while (t != null && path.length < I.n) {
          path.push(t);
          let nxt = null, best = -1;
          for (const p of I.preds[t]) { const arr = sim.finish[p] + I.comm(p, t, a[p], a[t]); if (arr > best) { best = arr; nxt = p; } }
          if (nxt == null || sim.start[t] > best + 1e-6) {
            nxt = null;
            for (let i = 0; i < I.n; i++) if (i !== t && a[i] === a[t] && Math.abs(sim.finish[i] - sim.start[t]) < 1e-6) { nxt = i; break; }
          }
          if (path.includes(nxt)) break;
          t = nxt;
        }
        const cand = path.filter((x) => movS.has(x));
        if (cand.length >= k) return rng.sample(cand, k);
        const rest = mov.filter((x) => !cand.includes(x));
        return cand.concat(rng.sample(rest, Math.min(k - cand.length, rest.length)));
      } },
    { name: "Bottleneck VM", desc: "Remove tasks from the busiest VM(s).",
      fn: (I, a, sim, mov, k, rng) => {
        const vs = [...Array(I.m).keys()].sort((x, y) => sim.busy[y] - sim.busy[x]);
        let out = [];
        for (const v of vs) { out = out.concat(rng.sample(mov.filter((t) => a[t] === v), k)).slice(0, k); if (out.length >= k) break; }
        return out;
      } },
    { name: "Related", desc: "Remove a connected group (BFS over dependencies) so they can be re-placed together.",
      fn: (I, a, sim, mov, k, rng) => {
        const movS = new Set(mov), seed = rng.choice(mov), out = [], q = [seed], seen = new Set([seed]);
        while (q.length && out.length < k) {
          const t = q.shift(); out.push(t);
          for (const nb of I.preds[t].concat(I.succs[t])) if (movS.has(nb) && !seen.has(nb)) { seen.add(nb); q.push(nb); }
        }
        if (out.length < k) { const rest = mov.filter((x) => !out.includes(x)); return out.concat(rng.sample(rest, Math.min(k - out.length, rest.length))); }
        return out;
      } },
  ];

  // ---------- repair operators ----------
  function loadOf(I, a, removed) {
    const rem = new Set(removed), load = new Array(I.m).fill(0);
    for (let t = 0; t < I.n; t++) if (!rem.has(t)) load[a[t]] += I.exec[t][a[t]];
    return load;
  }
  function eftScores(I, a, sim, t, load) {
    return I.feasible[t].map((v) => {
      let ready = 0;
      for (const p of I.preds[t]) ready = Math.max(ready, sim.finish[p] + I.comm(p, t, a[p], v));
      return [v, Math.max(ready, load[v]) + I.exec[t][v]];
    });
  }
  const REPAIR = [
    { name: "Greedy EFT", desc: "Put each task on the VM where it finishes earliest (HEFT-style).",
      fn: (I, a, sim, removed) => {
        const load = loadOf(I, a, removed);
        for (const t of removed.slice().sort((x, y) => I.rankUp[y] - I.rankUp[x])) {
          const s = eftScores(I, a, sim, t, load).sort((x, y) => x[1] - y[1]);
          a[t] = s[0][0]; load[a[t]] += I.exec[t][a[t]];
        }
      } },
    { name: "Regret", desc: "First place the task that would lose the most if it missed its best VM.",
      fn: (I, a, sim, removed) => {
        const load = loadOf(I, a, removed), pend = removed.slice();
        while (pend.length) {
          let best = [-1, null, null];
          for (const t of pend) {
            const s = eftScores(I, a, sim, t, load).sort((x, y) => x[1] - y[1]);
            const reg = s.length > 1 ? s[1][1] - s[0][1] : Infinity;
            if (reg > best[0]) best = [reg, t, s[0][0]];
          }
          a[best[1]] = best[2]; load[best[2]] += I.exec[best[1]][best[2]];
          pend.splice(pend.indexOf(best[1]), 1);
        }
      } },
    { name: "Cost-Energy", desc: "Pick the cheapest & most power-efficient VM that is not overloaded.",
      fn: (I, a, sim, removed) => {
        const load = loadOf(I, a, removed), cap = load.reduce((x, y) => x + y, 0) / I.m * 1.3 + 1e-9;
        const cMax = Math.max(...I.vms.map((v) => v.cost)), pMax = Math.max(...I.vms.map((v) => v.pMax));
        for (const t of removed) {
          let bv = -1, bs = Infinity;
          for (const v of I.feasible[t]) {
            const s = I.exec[t][v] * (I.vms[v].cost / cMax + I.vms[v].pMax / pMax) * (load[v] > cap ? 6 : 1);
            if (s < bs) { bs = s; bv = v; }
          }
          a[t] = bv; load[bv] += I.exec[t][bv];
        }
      } },
    { name: "Random", desc: "Random feasible VM — keeps the search from getting stuck.",
      fn: (I, a, sim, removed, rng) => { for (const t of removed) a[t] = rng.choice(I.feasible[t]); } },
  ];

  // ---------- ALNS (alns_core.py) ----------
  const DEFAULT_P = { destroyRatio: [0.1, 0.3], saT0: 0.01, cooling: 0.995, reaction: 0.2, scores: [10, 5, 1], segment: 20, restart: 60 };

  class ALNS {
    constructor(inst, init, movable, rng, params, w) {
      this.I = inst; this.rng = rng; this.p = Object.assign({}, DEFAULT_P, params || {}); this.w = w;
      this.mov = movable.slice();
      this.cur = init.slice();
      const e = fitness(inst, this.cur, w);
      this.curF = e.f; this.curSim = e.sim;
      this.best = this.cur.slice(); this.bestF = this.curF;
      this.dW = DESTROY.map(() => 1); this.rW = REPAIR.map(() => 1);
      this.dS = DESTROY.map(() => 0); this.rS = REPAIR.map(() => 0);
      this.dU = DESTROY.map(() => 0); this.rU = REPAIR.map(() => 0);
      this.T = this.p.saT0 * this.curF; this.T0 = this.T;
      this.it = 0; this.stall = 0; this.evals = 1;
      this.hist = [this.bestF]; this.curHist = [this.curF];
    }
    step() {
      const { I, rng, p } = this;
      this.it++;
      const k = Math.max(1, Math.round(this.mov.length * rng.uniform(...p.destroyRatio)));
      const di = rng.roulette(this.dW), ri = rng.roulette(this.rW);
      const cand = this.cur.slice();
      const removed = this.mov.length >= 2 ? DESTROY[di].fn(I, cand, this.curSim, this.mov, Math.min(k, this.mov.length), rng) : [];
      const before = cand.slice();
      REPAIR[ri].fn(I, cand, this.curSim, removed, rng);
      const e = fitness(I, cand, this.w); this.evals++;
      const f = e.f, prevCur = this.curF;
      let score = 0, outcome = "reject", prob = null;
      this.stall++;
      if (f < this.bestF - 1e-12) { this.best = cand.slice(); this.bestF = f; score = p.scores[0]; outcome = "best"; this.stall = 0; }
      if (f < this.curF - 1e-12) {
        this.cur = cand; this.curF = f; this.curSim = e.sim;
        score = Math.max(score, p.scores[1]); if (outcome !== "best") outcome = "improve";
      } else {
        prob = Math.exp(-(f - this.curF) / Math.max(this.T, 1e-12));
        if (rng() < prob) { this.cur = cand; this.curF = f; this.curSim = e.sim; score = Math.max(score, p.scores[2]); outcome = "sa"; }
      }
      this.dS[di] += score; this.dU[di]++; this.rS[ri] += score; this.rU[ri]++;
      this.T *= p.cooling;
      let restarted = false;
      if (this.stall >= p.restart) { this.cur = this.best.slice(); this.curF = this.bestF; this.curSim = simulate(I, this.cur); this.stall = 0; restarted = true; }
      let adapted = false;
      if (this.it % p.segment === 0) { this.adapt(); adapted = true; }
      this.hist.push(this.bestF); this.curHist.push(this.curF);
      return { it: this.it, di, ri, k, removed, before, cand, f, prevCur, outcome, prob, score, T: this.T, curF: this.curF, bestF: this.bestF, restarted, adapted };
    }
    adapt() {
      const r = this.p.reaction;
      const upd = (W, S, U) => { for (let i = 0; i < W.length; i++) { if (U[i] > 0) W[i] = (1 - r) * W[i] + r * S[i] / U[i]; W[i] = Math.max(W[i], 0.05); S[i] = 0; U[i] = 0; } };
      upd(this.dW, this.dS, this.dU); upd(this.rW, this.rS, this.rU);
    }
    run(iters) { for (let i = 0; i < iters; i++) this.step(); return this; }
  }

  // ---------- DHA-ALNS pieces ----------
  function profile(I) {
    const resClass = I.tasks.map((t) => (t.gpu ? 2 : t.ram >= 4 ? 1 : 0));
    const comm = new Array(I.n).fill(0);
    for (const key in I.data) { const [u, v] = key.split(",").map(Number); comm[u] += I.data[key]; comm[v] += I.data[key]; }
    return { level: I.tasks.map((t) => t.level), demand: I.meanExec.slice(), resClass, comm };
  }
  const STRATEGIES = ["dependency", "resource", "locality"];
  function decompose(I, prof, assign, k, strategy) {
    const keyFn = {
      dependency: (t) => [prof.level[t], -I.rankUp[t]],
      resource: (t) => [prof.resClass[t], -prof.demand[t], prof.level[t]],
      locality: (t) => [I.vms[assign[t]].dc, -prof.comm[t], prof.level[t]],
    }[strategy];
    const order = [...Array(I.n).keys()].sort((x, y) => {
      const a = keyFn(x), b = keyFn(y);
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return x - y;
    });
    const total = order.reduce((s, t) => s + prof.demand[t], 0);
    const clusters = []; let cur = [], acc = 0;
    for (const t of order) {
      cur.push(t); acc += prof.demand[t];
      if (acc >= (total / k) * (clusters.length + 1) && clusters.length < k - 1) { clusters.push(cur); cur = []; }
    }
    clusters.push(cur);
    return { clusters: clusters.filter((c) => c.length), order };
  }
  const validate = (I, a) => a.every((v, t) => isFinite(I.exec[t][v]));

  function merge(I, base, baseF, results, clusters, w) {
    const log = [];
    const all = base.slice();
    results.forEach((r) => clusters[r.cid].forEach((t, i) => (all[t] = r.genes[i])));
    let best = base.slice(), bestF = baseF;
    const fAll = fitness(I, all, w).f;
    log.push({ kind: "all", f: fAll, ok: fAll < bestF });
    if (validate(I, all) && fAll < bestF) { best = all; bestF = fAll; }
    for (const r of results.slice().sort((x, y) => x.f - y.f)) {
      const c = best.slice(); clusters[r.cid].forEach((t, i) => (c[t] = r.genes[i]));
      const f = fitness(I, c, w).f;
      const ok = validate(I, c) && f < bestF;
      log.push({ kind: "one", cid: r.cid, f, ok });
      if (ok) { best = c; bestF = f; }
    }
    return { best, bestF, log };
  }

  function rebalance(I, a, fit, w, maxMoves = 10) {
    const moves = [];
    let sim = simulate(I, a);
    for (let s = 0; s < maxMoves; s++) {
      const busy = sim.busy, mean = busy.reduce((x, y) => x + y, 0) / I.m;
      const hot = busy.indexOf(Math.max(...busy));
      if (busy[hot] <= 1.2 * mean) break;
      let improved = false;
      const tasks = [...Array(I.n).keys()].filter((t) => a[t] === hot).sort((x, y) => I.exec[y][hot] - I.exec[x][hot]).slice(0, 5);
      outer: for (const t of tasks) {
        for (const v of I.feasible[t].slice().sort((x, y) => busy[x] + I.exec[t][x] - busy[y] - I.exec[t][y]).slice(0, 3)) {
          if (v === hot) continue;
          const c = a.slice(); c[t] = v;
          const e = fitness(I, c, w);
          if (e.f < fit) { moves.push({ t, from: hot, to: v, f: e.f }); a = c; fit = e.f; sim = e.sim; improved = true; break outer; }
        }
      }
      if (!improved) break;
    }
    return { assign: a, fit, moves };
  }

  // ---------- HEFT step-by-step (for animation) ----------
  function heftTrace(I) {
    const a = new Array(I.n), finish = new Array(I.n), vmFree = new Array(I.m).fill(0), steps = [];
    for (const t of I.order) {
      const opts = I.feasible[t].map((v) => {
        let ready = 0;
        for (const p of I.preds[t]) ready = Math.max(ready, finish[p] + I.comm(p, t, a[p], v));
        return { v, eft: Math.max(ready, vmFree[v]) + I.exec[t][v] };
      });
      const best = opts.reduce((b, o) => (o.eft < b.eft ? o : b));
      a[t] = best.v; finish[t] = best.eft; vmFree[best.v] = best.eft;
      steps.push({ t, rank: I.rankUp[t], opts, chosen: best.v });
    }
    return steps;
  }

  // ---------- HEFT-TS-VND (algorithms/heft_ts.py) ----------
  function criticalPath(I, a, sim) {
    let t = sim.finish.indexOf(Math.max(...sim.finish));
    const path = [];
    while (t != null && path.length < I.n) {
      path.push(t);
      let nxt = null, best = -1;
      for (const p of I.preds[t]) { const arr = sim.finish[p] + I.comm(p, t, a[p], a[t]); if (arr > best) { best = arr; nxt = p; } }
      if (nxt == null || sim.start[t] > best + 1e-6) {
        nxt = null;
        for (let i = 0; i < I.n; i++) if (i !== t && a[i] === a[t] && Math.abs(sim.finish[i] - sim.start[t]) < 1e-6) { nxt = i; break; }
      }
      if (path.includes(nxt)) break;
      t = nxt;
    }
    return path;
  }

  class HEFTTS {
    constructor(I, rng, opt = {}) {
      this.I = I; this.rng = rng;
      this.budget = opt.budget ?? 400; this.tenure = opt.tenure ?? 7;
      this.cur = opt.init ? opt.init.slice() : heft(I);
      const e = fitness(I, this.cur);
      this.curF = e.f; this.curSim = e.sim; this.evals = 1;
      this.best = this.cur.slice(); this.bestF = this.curF;
      this.tabu = new Map(); this.it = 0;
      this.hist = [this.bestF]; this.curHist = [this.curF];
    }
    get done() { return this.evals >= this.budget; }
    targets(t, from, sim, mode) {
      const I = this.I;
      let vs = I.feasible[t].filter((v) => v !== from);
      if (mode === "fast") vs.sort((x, y) => sim.busy[x] + I.exec[t][x] - sim.busy[y] - I.exec[t][y]);
      else if (mode === "cheap") {
        const cM = Math.max(...I.vms.map((v) => v.cost)), pM = Math.max(...I.vms.map((v) => v.pMax));
        vs.sort((x, y) => I.exec[t][x] * (I.vms[x].cost / cM + I.vms[x].pMax / pM) - I.exec[t][y] * (I.vms[y].cost / cM + I.vms[y].pMax / pM));
      } else vs = this.rng.sample(vs, vs.length);
      return vs.slice(0, 2);
    }
    neighbours(a, sim) {
      const I = this.I, rng = this.rng, c = [];
      const crit = rng.sample(criticalPath(I, a, sim), 4);
      for (const t of crit) for (const v of this.targets(t, a[t], sim, "fast")) c.push({ kind: "critical", mv: [[t, v]] });
      const hot = sim.busy.indexOf(Math.max(...sim.busy));
      const onHot = rng.sample([...Array(I.n).keys()].filter((t) => a[t] === hot), 2);
      for (const t of onHot) for (const v of this.targets(t, hot, sim, "fast").slice(0, 1)) c.push({ kind: "bottleneck", mv: [[t, v]] });
      for (const t of rng.sample([...Array(I.n).keys()], 3)) for (const v of this.targets(t, a[t], sim, "cheap").slice(0, 1)) c.push({ kind: "cheap", mv: [[t, v]] });
      for (let k = 0; k < 3; k++) {
        const [t1, t2] = rng.sample([...Array(I.n).keys()], 2);
        if (a[t1] !== a[t2] && I.feasible[t1].includes(a[t2]) && I.feasible[t2].includes(a[t1])) c.push({ kind: "swap", mv: [[t1, a[t2]], [t2, a[t1]]] });
      }
      return c;
    }
    apply(a, mv) { const b = a.slice(); for (const [t, v] of mv) b[t] = v; return b; }
    vnd(a, f, sim) {
      const I = this.I, log = [];
      let k = 0;
      const names = ["N1 critical-path move", "N2 cheaper-VM move", "N3 swap"];
      while (k < 3 && !this.done) {
        let moves = [];
        if (k === 0) for (const t of criticalPath(I, a, sim).slice(0, 6)) for (const v of this.targets(t, a[t], sim, "fast")) moves.push([[t, v]]);
        else if (k === 1) for (const t of this.rng.sample([...Array(I.n).keys()], 8)) for (const v of this.targets(t, a[t], sim, "cheap").slice(0, 1)) moves.push([[t, v]]);
        else for (let j = 0; j < 8; j++) { const [t1, t2] = this.rng.sample([...Array(I.n).keys()], 2); if (a[t1] !== a[t2] && I.feasible[t1].includes(a[t2]) && I.feasible[t2].includes(a[t1])) moves.push([[t1, a[t2]], [t2, a[t1]]]); }
        let improved = false, tried = 0;
        for (const mv of moves) {
          if (this.done) break;
          const b = this.apply(a, mv), e = fitness(I, b); this.evals++; tried++;
          if (e.f < f - 1e-12) { a = b; f = e.f; sim = e.sim; improved = true; break; }
        }
        log.push({ k, name: names[k], tried, improved, f, a: a.slice(), sim });
        k = improved ? 0 : k + 1;
      }
      return { a, f, sim, log };
    }
    step() {
      const I = this.I;
      this.it++;
      const prev = this.cur.slice(), prevSim = this.curSim, cands = [];
      let chosen = null;
      for (const c of this.neighbours(this.cur, this.curSim)) {
        if (this.done) break;
        const b = this.apply(this.cur, c.mv), e = fitness(I, b); this.evals++;
        c.f = e.f; c.cand = b; c.sim = e.sim;
        c.tabu = c.mv.some(([t, v]) => (this.tabu.get(t + ":" + v) || 0) >= this.it);
        c.aspiration = c.tabu && e.f < this.bestF;
        cands.push(c);
        if (c.tabu && !c.aspiration) continue;
        if (!chosen || c.f < chosen.f) chosen = c;
      }
      let newBest = false, vndLog = null;
      if (chosen) {
        chosen.chosen = true;
        for (const [t] of chosen.mv) this.tabu.set(t + ":" + this.cur[t], this.it + this.tenure);
        this.cur = chosen.cand; this.curF = chosen.f; this.curSim = chosen.sim;
        if (this.curF < this.bestF - 1e-12) {
          const r = this.vnd(this.cur, this.curF, this.curSim);
          this.cur = r.a; this.curF = r.f; this.curSim = r.sim; vndLog = r.log;
          this.best = this.cur.slice(); this.bestF = this.curF; newBest = true;
        }
      }
      this.hist.push(this.bestF); this.curHist.push(this.curF);
      const tabuList = [...this.tabu.entries()].filter(([, until]) => until >= this.it + 1).map(([k, until]) => { const [t, v] = k.split(":").map(Number); return { t, v, left: until - this.it }; });
      return { it: this.it, prev, prevSim, cands, chosen, newBest, vndLog, tabuList, curF: this.curF, bestF: this.bestF, evals: this.evals };
    }
    run() { while (!this.done) this.step(); return this; }
  }

  G.Engine = { heftTrace, criticalPath, HEFTTS, RNG, makeInstance, simulate, metrics, fitness, fitnessParts, heft, randomAssign, DESTROY, REPAIR, ALNS, profile, decompose, STRATEGIES, merge, rebalance, validate, DEFAULT_W };
})(window);
