"""Struktur workload (DAG of cloudlets), diisi oleh loader di `datasets/`."""
from dataclasses import dataclass


@dataclass
class Workload:
    cloudlets: list
    preds: list          # preds[i] = list task pendahulu
    succs: list
    data: dict           # (u, v) -> MB

    @property
    def n(self):
        return len(self.cloudlets)

    def topo_order(self):
        indeg = [len(p) for p in self.preds]
        q = [i for i in range(self.n) if indeg[i] == 0]
        out = []
        while q:
            u = q.pop()
            out.append(u)
            for v in self.succs[u]:
                indeg[v] -= 1
                if indeg[v] == 0:
                    q.append(v)
        return out
