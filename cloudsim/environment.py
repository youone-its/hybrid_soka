"""Lingkungan cloud: datacenter + VM heterogen + matriks precomputed."""
import numpy as np
from .entities import Vm, Datacenter
from .workload import Workload

# tipe VM: (mips, pes, ram, gpu, $/s, P_idle, P_max)
VM_TYPES = {
    "small":   (1000, 1, 2048,  False, 0.00002, 50, 120),
    "medium":  (2000, 2, 4096,  False, 0.00005, 70, 180),
    "large":   (4000, 4, 8192,  False, 0.00012, 100, 260),
    "gpu":     (6000, 4, 16384, True,  0.00040, 150, 450),
}
INTER_DC_BW = 20.0   # MB/s


class CloudEnvironment:
    def __init__(self, workload: Workload, datacenters, vms, deadline_factor=1.4):
        self.wl = workload
        self.dcs = datacenters
        self.vms = vms
        self.n, self.m = workload.n, len(vms)
        L = np.array([c.length for c in workload.cloudlets])
        self.wl_lengths = L
        mips = np.array([v.mips for v in vms])
        self.exec = L[:, None] / mips[None, :]
        feas = np.ones((self.n, self.m), bool)
        for i, c in enumerate(workload.cloudlets):
            for j, v in enumerate(vms):
                if c.ram > v.ram or (c.needs_gpu and not v.has_gpu):
                    feas[i, j] = False
        self.exec[~feas] = np.inf
        self.feasible = [np.where(feas[i])[0] for i in range(self.n)]
        self.vm_dc = np.array([v.dc_id for v in vms])
        self.bw = np.full((len(datacenters),) * 2, INTER_DC_BW)
        for d in datacenters:
            self.bw[d.id, d.id] = d.intra_bw
        self.cost = np.array([v.cost_per_sec for v in vms])
        self.p_idle = np.array([v.power_idle for v in vms])
        self.p_max = np.array([v.power_max for v in vms])
        self.preds, self.succs, self.data = workload.preds, workload.succs, workload.data
        self.topo = workload.topo_order()
        self.mean_exec = np.array([self.exec[i, self.feasible[i]].mean() for i in range(self.n)])
        self.mean_bw = float(self.bw.mean())
        self.rank_up = self._upward_rank()
        self.deadline = self._deadlines(deadline_factor)

    def comm(self, u, v, vu, vv):
        if vu == vv:
            return 0.0
        return self.data[(u, v)] / self.bw[self.vm_dc[vu], self.vm_dc[vv]]

    def _upward_rank(self):
        r = np.zeros(self.n)
        for u in reversed(self.topo):
            best = 0.0
            for v in self.succs[u]:
                best = max(best, self.data[(u, v)] / self.mean_bw + r[v])
            r[u] = self.mean_exec[u] + best
        return r

    def _deadlines(self, factor):
        # lower bound finish per task: jalur kritis dengan VM tercepat, tanpa komunikasi
        fastest = np.array([self.exec[i, self.feasible[i]].min() for i in range(self.n)])
        eft = np.zeros(self.n)
        for u in self.topo:
            eft[u] = max((eft[p] for p in self.preds[u]), default=0.0) + fastest[u]
        # batas bawah beban: total kerja / kapasitas total VM
        load_lb = (self.wl_lengths.sum() / np.array([v.mips for v in self.vms]).sum())
        return factor * np.maximum(eft, load_lb)


def build_environment(scenario, rng) -> CloudEnvironment:
    from datasets import load_workload
    wl = load_workload(scenario.dataset, scenario.n_tasks, rng)
    dcs = [Datacenter(d, f"DC-{d}", intra_bw=float(rng.choice([100, 200]))) for d in range(scenario.n_datacenters)]
    types = list(VM_TYPES)
    vms = []
    for j in range(scenario.n_vms):
        t = "gpu" if j % 5 == 0 else types[j % 3]
        mips, pes, ram, gpu, c, pi, pm = VM_TYPES[t]
        dc = j % scenario.n_datacenters
        price = c * (1 + 0.15 * dc)  # harga berbeda per region
        vms.append(Vm(j, dc, t, mips * rng.uniform(0.9, 1.1), pes, ram, gpu, price, pi, pm))
        dcs[dc].vms.append(vms[-1])
    return CloudEnvironment(wl, dcs, vms, scenario.deadline_factor)
