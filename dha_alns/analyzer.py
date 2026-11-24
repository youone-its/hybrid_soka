"""Workload Analyzer: profiling task, dependensi, dan kebutuhan sumber daya."""
from dataclasses import dataclass
import numpy as np


@dataclass
class WorkloadProfile:
    level: np.ndarray          # kedalaman topologis
    demand: np.ndarray         # rata-rata waktu eksekusi (beban komputasi)
    resource_class: np.ndarray # 0=CPU-light, 1=CPU-heavy (RAM besar), 2=GPU
    comm_intensity: np.ndarray # total data in+out (MB)
    n_levels: int


def analyze(env) -> WorkloadProfile:
    n = env.n
    level = np.zeros(n, int)
    for u in env.topo:
        for v in env.succs[u]:
            level[v] = max(level[v], level[u] + 1)
    cls = np.array([2 if c.needs_gpu else (1 if c.ram >= 4096 else 0) for c in env.wl.cloudlets])
    comm = np.zeros(n)
    for (u, v), d in env.data.items():
        comm[u] += d; comm[v] += d
    return WorkloadProfile(level, env.mean_exec.copy(), cls, comm, int(level.max()) + 1)
