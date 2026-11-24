"""Runner eksperimen: bangun lingkungan, jalankan semua algoritma, kumpulkan metrik."""
import os
import time
import numpy as np

from cloudsim import build_environment
from config.settings import WEIGHTS
from algorithms import get_registry
from algorithms.heft import HEFT
from .objectives import Evaluator
from . import report


def run_scenario(scenario, algo_names, params, seed, outdir, algo_seed=None, save=True):
    """Workload dibangun dari `seed` (tetap); `algo_seed` mengatur RNG algoritma (untuk multi-run)."""
    algo_seed = seed if algo_seed is None else algo_seed
    rng = np.random.default_rng(seed)
    env = build_environment(scenario, rng)
    print(f"\n>> {scenario.name}: {env.n} task, {env.m} VM, {len(env.dcs)} datacenter, "
          f"{len(env.data)} dependensi")

    # referensi normalisasi fitness = metrik HEFT
    tmp = Evaluator(env, WEIGHTS)
    ref = tmp.metrics(HEFT(params, rng).schedule(env, tmp))

    registry = get_registry()
    rows, conv = [], {}
    for name in algo_names:
        algo = registry[name](params, np.random.default_rng(algo_seed + 1))
        ev = Evaluator(env, WEIGHTS, ref)
        t0 = time.perf_counter()
        assign = algo.schedule(env, ev)
        rt = time.perf_counter() - t0
        f, mt, _ = ev.evaluate(assign)
        row = {"scenario": scenario.name, "algorithm": name, "fitness": f, **mt.as_dict(),
               "runtime": rt, "evaluations": ev.n_evals}
        rows.append(row)
        print(f"  {name:<9} F={f:.4f} makespan={mt.makespan:9.1f} cost={mt.cost:7.3f} "
              f"SLA={mt.sla_rate:.3f} t={rt:6.1f}s")
        if name in ("ALNS", "DHA-ALNS", "HEFT-TS"):
            conv[name] = algo.history

    if not save:
        return rows
    report.print_table(rows, scenario.name)
    report.save_csv(rows, os.path.join(outdir, f"results_{scenario.name}.csv"))
    report.plot_comparison(rows, scenario.name, outdir)
    if conv:
        report.plot_convergence(dict(sorted(conv.items(), key=lambda kv: kv[0] != "DHA-ALNS")),
                                scenario.name, outdir)
    return rows


def run_multi(scenario, algo_names, params, seed, outdir, runs):
    """Jalankan `runs` kali dengan seed algoritma berbeda; simpan mean ± std."""
    all_rows = []
    for r in range(runs):
        print(f"\n=== run {r + 1}/{runs} (algo seed {seed + r}) ===")
        rows = run_scenario(scenario, algo_names, params, seed, outdir, algo_seed=seed + r, save=(r == 0))
        for row in rows:
            row["run"] = r
        all_rows += rows
    report.save_csv(all_rows, os.path.join(outdir, f"runs_{scenario.name}.csv"))
    keys = ["fitness", "makespan", "cost", "energy", "utilization", "sla_rate", "runtime", "evaluations"]
    summary = []
    for name in algo_names:
        rs = [r for r in all_rows if r["algorithm"] == name]
        row = {"scenario": scenario.name, "algorithm": name, "runs": len(rs)}
        for k in keys:
            v = np.array([r[k] for r in rs], float)
            row[k + "_mean"], row[k + "_std"] = v.mean(), v.std(ddof=1) if len(v) > 1 else 0.0
        summary.append(row)
    summary.sort(key=lambda r: r["fitness_mean"])
    print(f"\n== {scenario.name}: {runs} run, mean ± std (urut fitness) ==")
    for r in summary:
        print(f"  {r['algorithm']:<9} F={r['fitness_mean']:.4f}±{r['fitness_std']:.4f}  "
              f"makespan={r['makespan_mean']:8.1f}  cost={r['cost_mean']:.3f}  "
              f"evals={r['evaluations_mean']:.0f}  t={r['runtime_mean']:.2f}s")
    report.save_csv(summary, os.path.join(outdir, f"summary_{scenario.name}.csv"))
    return all_rows
