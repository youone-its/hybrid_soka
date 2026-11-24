"""Alibaba Cluster Trace v2018 — batch_task.csv (workflow DAG).

Kolom: task_name, instance_num, job_name, task_type, status, start_time, end_time,
       plan_cpu (100 = 1 core), plan_mem (0..100, ternormalisasi)
task_name memuat DAG: 'R6_3' = task 6 bergantung pada task 3; 'M1' tanpa dependensi.
"""
import csv
import os
import re
from .common import RAW, cached, to_workload

PATH = os.path.join(RAW, "alibaba", "batch_task.csv")
MAX_ROWS = 2_000_000           # cukup untuk ribuan job DAG; file aslinya 14 jt baris
NAME_RE = re.compile(r"^[A-Za-z]+(\d+)((?:_\d+)*)$")


def _parse_jobs():
    if not os.path.exists(PATH):
        raise FileNotFoundError(f"{PATH} tidak ada — jalankan: python -m datasets.download alibaba")
    jobs = {}
    with open(PATH, newline="") as f:
        for k, row in enumerate(csv.reader(f)):
            if k >= MAX_ROWS:
                break
            try:
                name, _, job, _, status, st, et, cpu, mem = row
                m = NAME_RE.match(name)
                if not m:
                    continue                                   # task independen (task_xxx)
                st, et = int(st), int(et)
                if status != "Terminated" or not cpu or not mem or et <= st or st <= 0:
                    jobs[job] = None                           # job tak lengkap -> buang
                    continue
                if job in jobs and jobs[job] is None:
                    continue
                deps = [int(x) for x in m.group(2).split("_") if x]
                jobs.setdefault(job, {})[int(m.group(1))] = (deps, et - st, float(cpu) / 100, float(mem) / 100)
            except ValueError:
                continue
    out = []
    for job, tasks in jobs.items():
        if not tasks or not (3 <= len(tasks) <= 60):
            continue
        if not any(d for d, *_ in tasks.values()):
            continue                                   # hanya job ber-DAG
        if all(all(p in tasks for p in d) for d, *_ in tasks.values()):
            out.append((job, tasks))
    out.sort()
    return out


def load_alibaba(n_tasks, rng):
    jobs = cached("alibaba_dag_jobs.pkl", _parse_jobs)
    order = rng.permutation(len(jobs))
    records, edges = [], []
    for j in order:
        _, tasks = jobs[j]
        if len(records) + len(tasks) > n_tasks:
            if len(records) >= n_tasks * 0.9:
                break
            continue
        idx = {}
        for tid, (deps, dur, cpu, mem) in tasks.items():
            idx[tid] = len(records)
            records.append({"duration": dur, "cpu": cpu, "mem_frac": mem})
        for tid, (deps, *_) in tasks.items():
            edges += [(idx[p], idx[tid]) for p in deps]
    return to_workload(records, edges)
