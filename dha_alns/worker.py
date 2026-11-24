"""ALNS Worker: dijalankan paralel (proses terpisah) per cluster."""
import numpy as np
from evaluation.objectives import Evaluator
from .alns_core import run_alns


def alns_worker(args):
    env, weights, ref, base, cluster, iters, params, seed, cid = args
    rng = np.random.default_rng(seed)
    ev = Evaluator(env, weights, ref)
    best, best_f, _ = run_alns(env, ev, base, cluster, iters, params, rng)
    return cid, best[cluster], best_f, ev.n_evals
