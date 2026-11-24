"""HEFT — Heterogeneous Earliest Finish Time."""
import numpy as np
from .base import Scheduler, eft_schedule


class HEFT(Scheduler):
    name = "HEFT"

    def schedule(self, env, evaluator):
        order = sorted(range(env.n), key=lambda t: -env.rank_up[t])
        assign = eft_schedule(env, order)
        self.log(evaluator, evaluator.fitness(assign))
        return assign
