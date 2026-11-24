"""Orkestrasi DHA-ALNS (4 tahap):

Stage 1  Initial solution (HEFT)
Stage 2  Hierarchical decomposition -> k cluster
Stage 3  Distributed ALNS (ProcessPool, satu worker per cluster)
Stage 4  Global coordination: merge, validasi, rebalancing, global ALNS refinement
Tahap 2-4 diulang beberapa putaran dengan strategi dekomposisi yang berganti.
"""
from concurrent.futures import ProcessPoolExecutor
import numpy as np

from algorithms.base import Scheduler
from algorithms.heft import HEFT
from .analyzer import analyze
from .decomposition import decompose, STRATEGIES
from .worker import alns_worker
from . import coordinator


class DHAALNS(Scheduler):
    name = "DHA-ALNS"

    def schedule(self, env, evaluator):
        p, rng = self.p, self.rng
        # Stage 1
        best = HEFT(p, rng).schedule(env, evaluator)
        best_f = evaluator.fitness(best)
        self.log(evaluator, best_f)
        profile = analyze(env)

        pool = ProcessPoolExecutor(p.n_workers) if p.n_workers > 1 else None
        try:
            for r in range(p.rounds):
                # Stage 2
                strategy = STRATEGIES[r % len(STRATEGIES)]
                clusters = decompose(env, profile, best, p.n_clusters, strategy)
                # Stage 3
                jobs = [(env, evaluator.w, evaluator.ref, best, c, p.local_iters, p,
                         int(rng.integers(1 << 31)), i) for i, c in enumerate(clusters)]
                results = list(pool.map(alns_worker, jobs)) if pool else [alns_worker(j) for j in jobs]
                # hitung evaluasi worker ke total (paralel -> dicatat sebagai max per putaran)
                evaluator.n_evals += max(r_[3] for r_ in results)
                # Stage 4
                best, best_f = coordinator.merge(env, evaluator, best, best_f, results, clusters)
                assert coordinator.validate(env, best)
                best, best_f = coordinator.rebalance(env, evaluator, best, best_f)
                self.log(evaluator, best_f)
                print(f"    [DHA-ALNS] round {r + 1}/{p.rounds} ({strategy}): F={best_f:.4f}")
        finally:
            if pool:
                pool.shutdown()

        best, best_f, hist = coordinator.global_refine(env, evaluator, best, p.global_iters, p, rng)
        self.history += hist[1:]
        return best
