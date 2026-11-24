"""Unduh trace: python -m datasets.download [google|alibaba|all] [--google-parts N]"""
import argparse
import os
import subprocess
import tarfile
import urllib.request
from .common import RAW

GOOGLE = "https://storage.googleapis.com/clusterdata-2011-2/task_events/part-{:05d}-of-00500.csv.gz"
ALIBABA = "http://aliopentrace.oss-cn-beijing.aliyuncs.com/v2018Traces/batch_task.tar.gz"


def fetch(url, dst):
    if os.path.exists(dst):
        print("ada:", dst); return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    print("unduh:", url)
    urllib.request.urlretrieve(url, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("which", nargs="?", default="all", choices=["google", "alibaba", "all"])
    ap.add_argument("--google-parts", type=int, default=1)
    a = ap.parse_args()
    if a.which in ("google", "all"):
        for i in range(a.google_parts):
            fetch(GOOGLE.format(i), os.path.join(RAW, "google", f"task_events_part-{i:05d}.csv.gz"))
    if a.which in ("alibaba", "all"):
        tgz = os.path.join(RAW, "alibaba", "batch_task.tar.gz")
        fetch(ALIBABA, tgz)
        if not os.path.exists(os.path.join(RAW, "alibaba", "batch_task.csv")):
            with tarfile.open(tgz) as t:
                t.extract("batch_task.csv", os.path.dirname(tgz), filter="data")


if __name__ == "__main__":
    main()
