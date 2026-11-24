"""Min-Min (dependency-aware): pilih task siap dengan completion time minimum."""
import numpy as np
from .base import Scheduler


class MinMin(Scheduler):
    name = "Min-Min"

    def schedule(self, env, evaluator):
        assign = np.zeros(env.n, int)
        finish = np.zeros(env.n)
        avail = np.zeros(env.m)
        remaining = [len(p) for p in env.preds]
        ready = {t for t in range(env.n) if remaining[t] == 0}
        while ready:
            best = (np.inf, -1, -1)
            for t in ready:
                for v in env.feasible[t]:
                    r = max((finish[p] + env.comm(p, t, assign[p], v) for p in env.preds[t]), default=0.0)
                    f = max(r, avail[v]) + env.exec[t, v]
                    if f < best[0]:
                        best = (f, t, v)
            f, t, v = best
            assign[t], finish[t], avail[v] = v, f, f
            ready.remove(t)
            for s in env.succs[t]:
                remaining[s] -= 1
                if remaining[s] == 0:
                    ready.add(s)
        self.log(evaluator, evaluator.fitness(assign))
        return assign
