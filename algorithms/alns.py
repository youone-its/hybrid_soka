"""ALNS standar (single, global) — baseline untuk DHA-ALNS."""
import numpy as np
from .base import Scheduler
from .heft import HEFT
from dha_alns.alns_core import run_alns


class ALNS(Scheduler):
    name = "ALNS"

    def schedule(self, env, evaluator):
        init = HEFT(self.p, self.rng).schedule(env, evaluator)
        best, _, hist = run_alns(env, evaluator, init, np.arange(env.n), self.p.alns_iters, self.p, self.rng)
        self.history = hist
        return best
