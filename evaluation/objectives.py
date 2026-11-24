"""Fungsi objektif multi-objektif: F(x) = w1*T + w2*C + w3*E + w4*S."""
from dataclasses import dataclass
import numpy as np
from cloudsim import CloudSimulation


@dataclass
class Metrics:
    makespan: float
    cost: float
    energy: float          # Joule
    utilization: float
    sla_rate: float        # fraksi task melewati deadline
    sla_tardiness: float   # rata-rata keterlambatan relatif

    def as_dict(self):
        return self.__dict__.copy()


class Evaluator:
    """Membungkus simulasi + penghitungan fitness; menghitung jumlah evaluasi."""

    def __init__(self, env, weights, reference: Metrics | None = None):
        self.env = env
        self.sim = CloudSimulation(env)
        self.w = weights
        self.ref = reference
        self.n_evals = 0

    def metrics(self, assign, sim=None) -> Metrics:
        env = self.env
        sim = sim or self.sim.run(assign)
        T = sim.makespan
        cost = float((sim.vm_busy * env.cost).sum())
        energy = float((sim.vm_busy * env.p_max + (T - sim.vm_busy) * env.p_idle).sum())
        late = np.maximum(0.0, sim.finish - env.deadline)
        return Metrics(T, cost, energy, float(sim.vm_busy.sum() / (env.m * T)),
                       float((late > 1e-9).mean()), float((late / env.deadline).mean()))

    def fitness_from_metrics(self, mt: Metrics) -> float:
        r, w = self.ref, self.w
        if r is None:
            return mt.makespan
        sla = mt.sla_rate + mt.sla_tardiness
        return (w["makespan"] * mt.makespan / r.makespan + w["cost"] * mt.cost / r.cost
                + w["energy"] * mt.energy / r.energy + w["sla"] * sla)

    def evaluate(self, assign):
        """Return (fitness, Metrics, SimResult)."""
        self.n_evals += 1
        sim = self.sim.run(assign)
        mt = self.metrics(assign, sim)
        return self.fitness_from_metrics(mt), mt, sim

    def fitness(self, assign) -> float:
        return self.evaluate(assign)[0]
