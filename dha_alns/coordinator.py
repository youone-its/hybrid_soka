"""Global Coordinator: merge solusi lokal, validasi, rebalancing, refinement global."""
import numpy as np
from .alns_core import run_alns


def validate(env, assign):
    """Cek constraint global: setiap task di VM feasible (RAM/GPU)."""
    return bool(np.all(np.isfinite(env.exec[np.arange(env.n), assign])))


def merge(env, evaluator, base, base_f, local_results, clusters):
    """Gabungkan solusi lokal. Coba gabung-semua dulu; jika kalah, gabung inkremental
    (urut dari peningkatan lokal terbaik) dan simpan hanya yang memperbaiki global."""
    allm = base.copy()
    for cid, genes, _, _ in local_results:
        allm[clusters[cid]] = genes
    best, best_f = base.copy(), base_f
    if validate(env, allm):
        f = evaluator.fitness(allm)
        if f < best_f:
            best, best_f = allm, f
    for cid, genes, lf, _ in sorted(local_results, key=lambda r: r[2]):
        cand = best.copy(); cand[clusters[cid]] = genes
        if not validate(env, cand):
            continue
        f = evaluator.fitness(cand)
        if f < best_f:
            best, best_f = cand, f
    return best, best_f


def rebalance(env, evaluator, assign, fit, max_moves=20):
    """Pindahkan task dari VM bottleneck ke VM yang lebih ringan jika fitness membaik."""
    _, _, sim = evaluator.evaluate(assign)
    for _ in range(max_moves):
        busy = sim.vm_busy
        v_hot = int(np.argmax(busy))
        if busy[v_hot] <= 1.2 * busy.mean():
            break
        tasks = np.where(assign == v_hot)[0]
        improved = False
        for t in sorted(tasks, key=lambda t: -env.exec[t, v_hot])[:5]:
            for v in sorted(env.feasible[t], key=lambda v: busy[v] + env.exec[t, v])[:3]:
                if v == v_hot:
                    continue
                cand = assign.copy(); cand[t] = v
                f, _, s = evaluator.evaluate(cand)
                if f < fit:
                    assign, fit, sim, improved = cand, f, s, True
                    break
            if improved:
                break
        if not improved:
            break
    return assign, fit


def global_refine(env, evaluator, assign, iters, params, rng):
    best, best_f, hist = run_alns(env, evaluator, assign, np.arange(env.n), iters, params, rng)
    return best, best_f, hist
