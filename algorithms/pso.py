"""Discrete PSO: posisi kontinu [0,1) dipetakan ke indeks VM feasible."""
import numpy as np
from .base import Scheduler


class PSO(Scheduler):
    name = "PSO"

    def decode(self, env, x):
        return np.array([env.feasible[i][min(int(x[i] * len(env.feasible[i])), len(env.feasible[i]) - 1)]
                         for i in range(env.n)])

    def schedule(self, env, evaluator):
        p, rng = self.p, self.rng
        X = rng.random((p.pso_particles, env.n))
        V = rng.uniform(-0.1, 0.1, X.shape)
        pbest = X.copy()
        pfit = np.array([evaluator.fitness(self.decode(env, x)) for x in X])
        g = pbest[pfit.argmin()].copy(); gfit = pfit.min()
        for it in range(p.pso_iters):
            w = 0.9 - 0.5 * it / p.pso_iters
            r1, r2 = rng.random(X.shape), rng.random(X.shape)
            V = np.clip(w * V + 1.5 * r1 * (pbest - X) + 1.5 * r2 * (g - X), -0.3, 0.3)
            X = np.mod(X + V, 1.0)
            for k, x in enumerate(X):
                f = evaluator.fitness(self.decode(env, x))
                if f < pfit[k]:
                    pfit[k], pbest[k] = f, x.copy()
                    if f < gfit:
                        gfit, g = f, x.copy()
            self.log(evaluator, gfit)
        return self.decode(env, g)
