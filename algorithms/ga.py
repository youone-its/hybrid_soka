"""Genetic Algorithm (encoding: task -> VM) dan hybrid HEFT-GA."""
import numpy as np
from .base import Scheduler, random_assign
from .heft import HEFT


class GA(Scheduler):
    name = "GA"
    seed_heft = False

    def schedule(self, env, evaluator):
        p, rng = self.p, self.rng
        pop = [random_assign(env, rng) for _ in range(p.ga_pop)]
        if self.seed_heft:
            pop[0] = HEFT(p, rng).schedule(env, evaluator)
        fit = np.array([evaluator.fitness(x) for x in pop])
        mut_rate = 1.0 / env.n * 3
        for _ in range(p.ga_gens):
            elite = int(np.argmin(fit))
            new = [pop[elite].copy()]
            while len(new) < p.ga_pop:
                a, b = (min(rng.choice(p.ga_pop, 3, replace=False), key=lambda i: fit[i]) for _ in range(2))
                mask = rng.random(env.n) < 0.5
                child = np.where(mask, pop[a], pop[b])
                for i in np.where(rng.random(env.n) < mut_rate)[0]:
                    child[i] = rng.choice(env.feasible[i])
                new.append(child)
            pop = new
            fit = np.array([evaluator.fitness(x) for x in pop])
            self.log(evaluator, float(fit.min()))
        return pop[int(np.argmin(fit))]


class HEFTGA(GA):
    name = "HEFT-GA"
    seed_heft = True
