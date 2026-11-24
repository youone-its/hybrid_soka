"""Inti ALNS: destroy -> repair -> evaluate -> accept (SA) -> adapt."""
import numpy as np
from .operators import DESTROY, REPAIR


class AdaptiveSelector:
    """Roulette-wheel dengan bobot yang diperbarui per segmen."""

    def __init__(self, n, reaction, rng):
        self.w = np.ones(n); self.score = np.zeros(n); self.uses = np.zeros(n)
        self.r, self.rng = reaction, rng

    def pick(self):
        return int(self.rng.choice(len(self.w), p=self.w / self.w.sum()))

    def reward(self, i, s):
        self.score[i] += s; self.uses[i] += 1

    def update(self):
        m = self.uses > 0
        self.w[m] = (1 - self.r) * self.w[m] + self.r * self.score[m] / self.uses[m]
        self.w = np.maximum(self.w, 0.05)
        self.score[:] = 0; self.uses[:] = 0


def run_alns(env, evaluator, init, movable, iters, p, rng, segment=50, restart=100):
    """Optimasi ALNS hanya pada task `movable`. Return (best, best_fit, history)."""
    movable = np.asarray(movable)
    cur = np.array(init); cur_f, _, cur_sim = evaluator.evaluate(cur)
    best, best_f = cur.copy(), cur_f
    D = AdaptiveSelector(len(DESTROY), p.reaction, rng)
    R = AdaptiveSelector(len(REPAIR), p.reaction, rng)
    T = p.sa_t0 * cur_f
    hist = [(evaluator.n_evals, best_f)]
    if len(movable) < 2:
        return best, best_f, hist
    s_best, s_imp, s_acc = p.scores
    stall = 0
    for it in range(1, iters + 1):
        k = max(1, int(len(movable) * rng.uniform(*p.destroy_ratio)))
        di, ri = D.pick(), R.pick()
        cand = cur.copy()
        removed = DESTROY[di](env, cand, cur_sim, movable, k, rng)
        if not removed:
            continue
        REPAIR[ri](env, cand, cur_sim, removed, rng)
        f, _, sim = evaluator.evaluate(cand)
        score = 0.0
        stall += 1
        if f < best_f - 1e-12:
            best, best_f, score, stall = cand.copy(), f, s_best, 0
        if f < cur_f - 1e-12:
            cur, cur_f, cur_sim = cand, f, sim
            score = max(score, s_imp)
        elif rng.random() < np.exp(-(f - cur_f) / max(T, 1e-12)):
            cur, cur_f, cur_sim = cand, f, sim
            score = max(score, s_acc)
        D.reward(di, score); R.reward(ri, score)
        T *= p.sa_cooling
        if stall >= restart:  # intensifikasi: kembali ke solusi terbaik
            cur, cur_f, stall = best.copy(), best_f, 0
            _, _, cur_sim = evaluator.evaluate(cur)
        if it % segment == 0:
            D.update(); R.update()
        hist.append((evaluator.n_evals, best_f))
    return best, best_f, hist
