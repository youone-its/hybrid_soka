"""Kelas dasar penjadwal & utilitas bersama."""
import numpy as np


class Scheduler:
    name = "base"

    def __init__(self, params, rng):
        self.p = params
        self.rng = rng
        self.history = []   # [(n_evals, best_fitness)]

    def schedule(self, env, evaluator) -> np.ndarray:
        raise NotImplementedError

    def log(self, evaluator, best):
        self.history.append((evaluator.n_evals, best))


def random_assign(env, rng):
    return np.array([rng.choice(env.feasible[i]) for i in range(env.n)])


def repair_feasible(env, assign, rng):
    for i in range(env.n):
        if not np.isfinite(env.exec[i, assign[i]]):
            assign[i] = rng.choice(env.feasible[i])
    return assign


def eft_schedule(env, order):
    """List-scheduling EFT (tanpa insertion) mengikuti urutan `order`."""
    assign = np.zeros(env.n, int)
    finish = np.zeros(env.n)
    avail = np.zeros(env.m)
    for t in order:
        best, best_v = np.inf, -1
        for v in env.feasible[t]:
            ready = max((finish[p] + env.comm(p, t, assign[p], v) for p in env.preds[t]), default=0.0)
            f = max(ready, avail[v]) + env.exec[t, v]
            if f < best:
                best, best_v = f, v
        assign[t], finish[t] = best_v, best
        avail[best_v] = best
    return assign
