"""Google Cluster Trace 2011 (clusterdata-2011-2) — task_events.

Kolom: time(us), missing, job_id, task_index, machine_id, event_type, user,
       scheduling_class, priority, cpu_request, memory_request, disk_request, diff_machine
event_type: 1=SCHEDULE, 4=FINISH. Durasi = FINISH - SCHEDULE (task sukses).
Trace ini tidak memuat dependensi -> task independen (bag-of-tasks).
"""
import csv
import glob
import gzip
import os
from .common import RAW, cached, to_workload

PATTERN = os.path.join(RAW, "google", "task_events_part-*.csv.gz")
CPU_CORES = 16   # cpu_request ternormalisasi (0..1) terhadap mesin terbesar


def _parse_tasks():
    files = sorted(glob.glob(PATTERN))
    if not files:
        raise FileNotFoundError("trace Google tidak ada — jalankan: python -m datasets.download google")
    sched, out = {}, []
    for path in files:
        with gzip.open(path, "rt", newline="") as f:
            for row in csv.reader(f):
                key = (row[2], row[3]); t = int(row[0]); ev = row[5]
                if ev == "1" and t > 0:
                    sched[key] = t
                elif ev == "4" and key in sched and row[9] and row[10]:
                    dur = (t - sched.pop(key)) / 1e6
                    if dur > 0:
                        out.append({"duration": dur, "cpu": max(1.0, float(row[9]) * CPU_CORES),
                                    "mem_frac": float(row[10])})
    return out


def load_google(n_tasks, rng):
    tasks = cached("google_tasks.pkl", _parse_tasks)
    pick = rng.choice(len(tasks), size=min(n_tasks, len(tasks)), replace=False)
    return to_workload([tasks[i] for i in pick], [])
