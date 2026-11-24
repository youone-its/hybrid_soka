"""Entry point: simulasi penjadwalan DHA-ALNS vs baseline di mini-CloudSim Python.

Contoh:
    python main.py                          # Alibaba, skenario small
    python main.py -s small medium large    # beberapa skenario
    python main.py -s all --quick           # semua skenario, parameter ringan
    python main.py -a HEFT ALNS DHA-ALNS    # pilih algoritma
    python main.py -d alibaba -s medium     # dataset Alibaba 2018 (DAG)
    python main.py -d google -s medium      # dataset Google 2011 (independen)
    python main.py -s small -r 10           # 10 run, laporan mean ± std
"""
import argparse
import os
from dataclasses import replace

from config.settings import SCENARIOS, AlgoParams, quick
from algorithms import get_registry
from evaluation.experiment import run_scenario, run_multi
from evaluation.report import save_csv
from datasets import DATASETS


def main():
    algos = list(get_registry())
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-s", "--scenarios", nargs="+", default=["small"], help=f"{list(SCENARIOS)} atau all")
    ap.add_argument("-a", "--algorithms", nargs="+", default=algos, choices=algos)
    ap.add_argument("-w", "--workers", type=int, default=4, help="jumlah proses worker DHA-ALNS")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--quick", action="store_true", help="iterasi lebih sedikit")
    ap.add_argument("-d", "--dataset", default="alibaba", choices=DATASETS,
                    help="sumber workload (google/alibaba: unduh dulu via python -m datasets.download)")
    ap.add_argument("-o", "--out", default="results")
    ap.add_argument("-r", "--runs", type=int, default=1, help="jumlah run (seed algoritma berbeda) -> mean ± std")
    args = ap.parse_args()

    params = AlgoParams(n_workers=args.workers, n_clusters=max(2, args.workers))
    if args.quick:
        params = quick(params)
    names = list(SCENARIOS) if "all" in args.scenarios else args.scenarios
    os.makedirs(args.out, exist_ok=True)

    all_rows = []
    for s in names:
        sc = replace(SCENARIOS[s], dataset=args.dataset, name=f"{args.dataset}_{s}")
        if args.runs > 1:
            all_rows += run_multi(sc, args.algorithms, params, args.seed, args.out, args.runs)
        else:
            all_rows += run_scenario(sc, args.algorithms, params, args.seed, args.out)
    save_csv(all_rows, os.path.join(args.out, "results_all.csv"))
    print(f"\nHasil tersimpan di: {os.path.abspath(args.out)}/")


if __name__ == "__main__":
    main()
