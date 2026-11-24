"""Hierarchical Decomposition: membagi workload menjadi k cluster seimbang.

Hierarki 2 tingkat:
  1) kunci primer (berganti tiap putaran): dependensi, kelas resource, atau lokalitas data
  2) kunci sekunder: level topologis / upward rank
lalu task yang sudah terurut dipotong menjadi k cluster dengan beban komputasi seimbang.
"""
import numpy as np

STRATEGIES = ("dependency", "resource", "locality")


def _balanced_split(order, demand, k):
    total = demand[order].sum()
    clusters, cur, acc = [], [], 0.0
    for t in order:
        cur.append(int(t)); acc += demand[t]
        if acc >= total / k * (len(clusters) + 1) and len(clusters) < k - 1:
            clusters.append(cur); cur = []
    clusters.append(cur)
    return [np.array(c) for c in clusters if c]


def decompose(env, profile, assign, k, strategy):
    n = env.n
    if strategy == "dependency":
        key = np.lexsort((-env.rank_up, profile.level))
    elif strategy == "resource":
        key = np.lexsort((profile.level, -profile.demand, profile.resource_class))
    elif strategy == "locality":
        dc = env.vm_dc[assign]
        key = np.lexsort((profile.level, -profile.comm_intensity, dc))
    else:
        raise ValueError(strategy)
    return _balanced_split(key, profile.demand, k)
