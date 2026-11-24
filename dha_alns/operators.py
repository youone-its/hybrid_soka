"""Operator destroy & repair untuk ALNS.

Destroy: (env, assign, sim, movable, k, rng) -> list task yang dilepas.
Repair : (env, assign, sim, removed, rng) -> assign baru (in-place).
"""
import numpy as np


# ----------------------------- DESTROY -----------------------------
def random_removal(env, a, sim, movable, k, rng):
    return list(rng.choice(movable, k, replace=False))


def worst_removal(env, a, sim, movable, k, rng):
    """Task dengan rasio waktu eksekusi terhadap VM tercepat terburuk + keterlambatan."""
    ex = env.exec[movable, a[movable]]
    fastest = np.array([env.exec[t, env.feasible[t]].min() for t in movable])
    late = np.maximum(0, sim.finish[movable] - env.deadline[movable]) / env.deadline[movable]
    score = ex / fastest + late + rng.random(len(movable)) * 0.3
    return list(movable[np.argsort(-score)[:k]])


def critical_path_removal(env, a, sim, movable, k, rng):
    mov = set(int(x) for x in movable)
    t = int(np.argmax(sim.finish))
    by_vm_finish = {}
    for i in range(env.n):
        by_vm_finish.setdefault((a[i], round(sim.finish[i], 6)), i)
    path = []
    while t is not None and len(path) < env.n:
        path.append(t)
        nxt, best = None, -1.0
        for p in env.preds[t]:
            arr = sim.finish[p] + env.comm(p, t, a[p], a[t])
            if arr > best:
                best, nxt = arr, p
        if sim.start[t] > best + 1e-6 or nxt is None:  # menunggu VM
            nxt = by_vm_finish.get((a[t], round(sim.start[t], 6)))
        t = nxt
    cand = [x for x in path if x in mov]
    if len(cand) < k:
        return cand + random_removal(env, a, sim, np.array(sorted(mov - set(cand))), k - len(cand), rng) \
            if len(mov) - len(cand) >= k - len(cand) else cand
    return list(rng.choice(cand, k, replace=False))


def bottleneck_vm_removal(env, a, sim, movable, k, rng):
    order = np.argsort(-sim.vm_busy)
    out = []
    for v in order:
        tasks = movable[a[movable] == v]
        rng.shuffle(tasks)
        out.extend(tasks[: k - len(out)])
        if len(out) >= k:
            break
    return [int(x) for x in out]


def related_removal(env, a, sim, movable, k, rng):
    """Hapus sekumpulan task yang terhubung (dependensi) — BFS dari seed acak."""
    mov = set(int(x) for x in movable)
    seed = int(rng.choice(movable))
    out, q, seen = [], [seed], {seed}
    while q and len(out) < k:
        t = q.pop(0)
        out.append(t)
        for nb in env.preds[t] + env.succs[t]:
            if nb in mov and nb not in seen:
                seen.add(nb); q.append(nb)
    if len(out) < k:
        rest = np.array(sorted(mov - set(out)))
        out += random_removal(env, a, sim, rest, min(k - len(out), len(rest)), rng)
    return out


DESTROY = [random_removal, worst_removal, critical_path_removal, bottleneck_vm_removal, related_removal]


# ----------------------------- REPAIR ------------------------------
def _scores(env, a, sim, t, load):
    """Perkiraan EFT task t di tiap VM feasible berdasarkan snapshot simulasi."""
    vs = env.feasible[t]
    ready = np.zeros(len(vs))
    for p in env.preds[t]:
        ready = np.maximum(ready, [sim.finish[p] + env.comm(p, t, a[p], v) for v in vs])
    return vs, np.maximum(ready, load[vs]) + env.exec[t, vs]


def _load(env, a, removed):
    load = np.zeros(env.m)
    rem = set(removed)
    for t in range(env.n):
        if t not in rem:
            load[a[t]] += env.exec[t, a[t]]
    return load


def greedy_repair(env, a, sim, removed, rng):
    load = _load(env, a, removed)
    for t in sorted(removed, key=lambda t: -env.rank_up[t]):
        vs, f = _scores(env, a, sim, t, load)
        v = vs[np.argmin(f)]
        a[t] = v; load[v] += env.exec[t, v]
    return a


def regret_repair(env, a, sim, removed, rng):
    load = _load(env, a, removed)
    pending = list(removed)
    while pending:
        best = (-1.0, None, None)
        for t in pending:
            vs, f = _scores(env, a, sim, t, load)
            s = np.sort(f)
            regret = (s[1] - s[0]) if len(s) > 1 else np.inf
            if regret > best[0]:
                best = (regret, t, vs[np.argmin(f)])
        _, t, v = best
        a[t] = v; load[v] += env.exec[t, v]
        pending.remove(t)
    return a


def cost_energy_repair(env, a, sim, removed, rng):
    """Pilih VM dengan biaya+energi per task terkecil di antara VM yang belum overload."""
    load = _load(env, a, removed)
    cap = load.mean() * 1.3 + 1e-9
    c_n = env.cost / env.cost.max(); p_n = env.p_max / env.p_max.max()
    for t in removed:
        vs = env.feasible[t]
        ex = env.exec[t, vs]
        score = ex * (c_n[vs] + p_n[vs]) * (1 + (load[vs] > cap) * 5)
        v = vs[np.argmin(score)]
        a[t] = v; load[v] += env.exec[t, v]
    return a


def random_repair(env, a, sim, removed, rng):
    for t in removed:
        a[t] = rng.choice(env.feasible[t])
    return a


REPAIR = [greedy_repair, regret_repair, cost_energy_repair, random_repair]
