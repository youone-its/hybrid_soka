"""Discrete-event simulation engine (gaya CloudSim).

Broker mengirim cloudlet ke VM yang ditetapkan (assignment). Cloudlet tiba di
antrian VM saat semua data pendahulu sudah ditransfer. Setiap VM mengeksekusi
satu cloudlet sekaligus (space-shared), memilih prioritas tertinggi di antrian.
"""
import heapq
from dataclasses import dataclass
import numpy as np


@dataclass
class SimResult:
    start: np.ndarray
    finish: np.ndarray
    vm_busy: np.ndarray
    makespan: float


ARRIVE, FINISH = 1, 0   # FINISH diproses dulu pada waktu yang sama


class CloudSimulation:
    def __init__(self, env):
        self.env = env

    def run(self, assign, priority=None) -> SimResult:
        env = self.env
        n, m = env.n, env.m
        prio = env.rank_up if priority is None else priority
        remaining = [len(p) for p in env.preds]
        data_ready = np.zeros(n)
        start = np.zeros(n); finish = np.zeros(n)
        busy = np.zeros(m)
        vm_idle = [True] * m
        queues = [[] for _ in range(m)]
        ev = [(0.0, ARRIVE, i) for i in range(n) if remaining[i] == 0]
        heapq.heapify(ev)
        exe = env.exec

        def dispatch(vm, t):
            if queues[vm]:
                _, task = heapq.heappop(queues[vm])
                d = exe[task, vm]
                start[task] = t; finish[task] = t + d
                busy[vm] += d
                vm_idle[vm] = False
                heapq.heappush(ev, (t + d, FINISH, task))

        while ev:
            t, kind, task = heapq.heappop(ev)
            vm = assign[task]
            if kind == ARRIVE:
                heapq.heappush(queues[vm], (-prio[task], task))
                if vm_idle[vm]:
                    dispatch(vm, t)
            else:
                vm_idle[vm] = True
                for s in env.succs[task]:
                    arr = t + env.comm(task, s, vm, assign[s])
                    if arr > data_ready[s]:
                        data_ready[s] = arr
                    remaining[s] -= 1
                    if remaining[s] == 0:
                        heapq.heappush(ev, (data_ready[s], ARRIVE, s))
                dispatch(vm, t)
        return SimResult(start, finish, busy, float(finish.max()))
