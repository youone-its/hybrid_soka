"""Utilitas konversi record trace -> Workload CloudSim."""
import os
import pickle
from cloudsim.entities import Cloudlet
from cloudsim.workload import Workload

ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")
RAW = os.path.join(ROOT, "raw")
PROCESSED = os.path.join(ROOT, "processed")

REF_MIPS = 1000.0        # durasi trace diasumsikan diukur pada mesin 1000 MIPS
MACHINE_RAM_MB = 16384   # memori ternormalisasi (0..1) dikalikan kapasitas ini
MB_PER_SEC_OUTPUT = 0.5  # trace tidak memuat ukuran data -> estimasi dari durasi


def cached(name, build):
    os.makedirs(PROCESSED, exist_ok=True)
    path = os.path.join(PROCESSED, name)
    if os.path.exists(path):
        with open(path, "rb") as f:
            return pickle.load(f)
    data = build()
    with open(path, "wb") as f:
        pickle.dump(data, f)
    return data


def to_workload(records, edges):
    """records: list dict(duration, cpu, mem_frac); edges: list (u, v) indeks lokal."""
    cl = []
    for i, r in enumerate(records):
        dur = max(1.0, r["duration"])
        cpu = max(1.0, r.get("cpu", 1.0))
        ram = int(min(MACHINE_RAM_MB, max(256, r["mem_frac"] * MACHINE_RAM_MB)))
        cl.append(Cloudlet(i, dur * REF_MIPS * cpu, ram, False,
                           float(min(500.0, max(1.0, dur * MB_PER_SEC_OUTPUT)))))
    n = len(cl)
    preds = [[] for _ in range(n)]; succs = [[] for _ in range(n)]; data = {}
    for u, v in edges:
        if u != v and u not in preds[v]:
            preds[v].append(u); succs[u].append(v); data[(u, v)] = cl[u].output_size
    return Workload(cl, preds, succs, data)
