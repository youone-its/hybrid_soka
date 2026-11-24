"""HEFT-TS-VND: HEFT-seeded Tabu Search + Variable Neighborhood Descent.

Hybrid pola B (relay heuristic -> metaheuristic) + local search:
  1) HEFT memberi solusi awal.
  2) Tabu Search: tiap iterasi membangkitkan daftar kandidat tetangga terarah
     (move task critical-path / VM bottleneck / ke VM lebih murah, dan swap),
     memilih tetangga terbaik yang tidak tabu (aspirasi: boleh jika global best),
     lalu melarang task kembali ke VM asalnya selama `tenure` iterasi.
  3) VND: setiap kali global best baru ditemukan, lakukan descent
     N1 (move critical path) -> N2 (move ke VM lebih murah) -> N3 (swap).

Ref.: Porto & Ribeiro (1995), tabu search untuk penjadwalan task heterogen
dengan precedence constraint.

Budget evaluasi = p.alns_iters (sama dengan ALNS) agar perbandingan adil.
"""
import numpy as np
from .base import Scheduler
from .heft import HEFT
from dha_alns.operators import critical_path_removal


class HEFTTS(Scheduler):
    name = "HEFT-TS"

    # ------------------------------------------------------------ helpers
    def _critical(self, env, a, sim, k):
        return [int(t) for t in critical_path_removal(env, a, sim, np.arange(env.n), min(k, env.n), self.rng)]

    def _targets(self, env, t, v_from, sim, mode):
        """VM tujuan kandidat untuk task t."""
        vs = [int(v) for v in env.feasible[t] if v != v_from]
        if not vs:
            return []
        if mode == "fast":    # VM yang paling sedikit menambah beban
            vs.sort(key=lambda v: sim.vm_busy[v] + env.exec[t, v])
        elif mode == "cheap":  # biaya + daya per task terendah
            vs.sort(key=lambda v: env.exec[t, v] * (env.cost[v] / env.cost.max() + env.p_max[v] / env.p_max.max()))
        else:
            self.rng.shuffle(vs)
        return vs[:2]

    def _neighbours(self, env, a, sim):
        """Daftar kandidat (moves) — tiap move = list (task, vm_baru)."""
        rng, cand = self.rng, []
        crit = self._critical(env, a, sim, 4)
        for t in crit:
            for v in self._targets(env, t, a[t], sim, "fast"):
                cand.append([(t, v)])
        hot = int(np.argmax(sim.vm_busy))
        on_hot = np.where(a == hot)[0]
        for t in rng.choice(on_hot, min(2, len(on_hot)), replace=False) if len(on_hot) else []:
            for v in self._targets(env, int(t), hot, sim, "fast")[:1]:
                cand.append([(int(t), v)])
        for t in rng.choice(env.n, 3, replace=False):
            for v in self._targets(env, int(t), a[t], sim, "cheap")[:1]:
                cand.append([(int(t), v)])
        for _ in range(3):  # swap
            t1, t2 = (int(x) for x in rng.choice(env.n, 2, replace=False))
            v1, v2 = a[t1], a[t2]
            if v1 != v2 and v2 in env.feasible[t1] and v1 in env.feasible[t2]:
                cand.append([(t1, v2), (t2, v1)])
        return cand

    def _apply(self, a, move):
        b = a.copy()
        for t, v in move:
            b[t] = v
        return b

    def _vnd(self, env, ev, a, f, sim, budget_end):
        """Variable Neighborhood Descent (first improvement)."""
        k = 0
        while k < 3 and ev.n_evals < budget_end:
            if k == 0:
                moves = [[(t, v)] for t in self._critical(env, a, sim, 6) for v in self._targets(env, t, a[t], sim, "fast")]
            elif k == 1:
                ts = self.rng.choice(env.n, min(8, env.n), replace=False)
                moves = [[(int(t), v)] for t in ts for v in self._targets(env, int(t), a[t], sim, "cheap")[:1]]
            else:
                moves = []
                for _ in range(8):
                    t1, t2 = (int(x) for x in self.rng.choice(env.n, 2, replace=False))
                    if a[t1] != a[t2] and a[t2] in env.feasible[t1] and a[t1] in env.feasible[t2]:
                        moves.append([(t1, a[t2]), (t2, a[t1])])
            improved = False
            for mv in moves:
                if ev.n_evals >= budget_end:
                    break
                b = self._apply(a, mv)
                fb, _, sb = ev.evaluate(b)
                if fb < f - 1e-12:
                    a, f, sim, improved = b, fb, sb, True
                    break
            k = 0 if improved else k + 1
        return a, f, sim

    # ------------------------------------------------------------ main
    def schedule(self, env, evaluator):
        p = self.p
        budget = p.extra.get("ts_budget", p.alns_iters)
        tenure = p.extra.get("ts_tenure", 7)
        end = evaluator.n_evals + budget

        cur = HEFT(p, self.rng).schedule(env, evaluator)
        cur_f, _, cur_sim = evaluator.evaluate(cur)
        best, best_f = cur.copy(), cur_f
        self.log(evaluator, best_f)
        tabu = {}  # (task, vm) -> iterasi terakhir saat masih tabu
        it = 0
        while evaluator.n_evals < end:
            it += 1
            chosen = None
            for mv in self._neighbours(env, cur, cur_sim):
                if evaluator.n_evals >= end:
                    break
                cand = self._apply(cur, mv)
                f, _, sim = evaluator.evaluate(cand)
                is_tabu = any(tabu.get((t, v), 0) >= it for t, v in mv)
                if is_tabu and f >= best_f:        # aspirasi
                    continue
                if chosen is None or f < chosen[1]:
                    chosen = (mv, f, cand, sim)
            if chosen is None:
                continue
            mv, f, cand, sim = chosen
            for t, _ in mv:                         # larang kembali ke VM asal
                tabu[(t, int(cur[t]))] = it + tenure
            cur, cur_f, cur_sim = cand, f, sim
            if cur_f < best_f - 1e-12:
                cur, cur_f, cur_sim = self._vnd(env, evaluator, cur, cur_f, cur_sim, end)
                best, best_f = cur.copy(), cur_f
            self.log(evaluator, best_f)
        return best
