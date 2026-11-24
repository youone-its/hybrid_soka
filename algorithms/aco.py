"""Ant Colony Optimization untuk pemetaan task -> VM."""
import numpy as np
from .base import Scheduler


class ACO(Scheduler):
    name = "ACO"

    def schedule(self, env, evaluator):
        p, rng = self.p, self.rng
        eta = np.where(np.isfinite(env.exec), 1.0 / env.exec, 0.0)
        eta /= eta.max(axis=1, keepdims=True)
        tau = np.ones((env.n, env.m))
        alpha, beta, rho = 1.0, 2.0, 0.1
        best, best_f = None, np.inf
        for _ in range(p.aco_iters):
            prob = (tau ** alpha) * (eta ** beta)
            prob /= prob.sum(axis=1, keepdims=True)
            cdf = prob.cumsum(axis=1)
            ants = []
            for _ in range(p.aco_ants):
                a = (cdf < rng.random((env.n, 1))).sum(axis=1)
                a = np.minimum(a, env.m - 1)
                ants.append((evaluator.fitness(a), a))
            ants.sort(key=lambda z: z[0])
            if ants[0][0] < best_f:
                best_f, best = ants[0]
            tau *= (1 - rho)
            for f, a in ants[:3] + [(best_f, best)]:
                tau[np.arange(env.n), a] += 1.0 / f
            tau[eta == 0] = 0.0
            self.log(evaluator, best_f)
        return best
