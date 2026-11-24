"""Penyimpanan hasil (CSV) dan grafik perbandingan."""
import csv
import os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
HIGHLIGHT, MUTED = "#2a78d6", "#b4b3ad"
SERIES = ["#2a78d6", "#eb6834", "#1baf7a"]   # slot 1-3 palet kategorikal tervalidasi

METRIC_LABELS = {
    "fitness": "Fitness F(x) (lebih kecil lebih baik)",
    "makespan": "Makespan (s)", "cost": "Biaya eksekusi ($)",
    "energy": "Energi (J)", "utilization": "Utilisasi sumber daya",
    "sla_rate": "Rasio pelanggaran SLA", "runtime": "Runtime optimasi (s)",
}


def save_csv(rows, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader(); w.writerows(rows)


def print_table(rows, scenario):
    cols = ["algorithm", "fitness", "makespan", "cost", "energy", "utilization", "sla_rate", "runtime"]
    print(f"\n=== Skenario: {scenario} ===")
    print(" | ".join(f"{c:>11}" for c in cols))
    for r in sorted(rows, key=lambda r: r["fitness"]):
        print(" | ".join(f"{r[c]:>11.4g}" if isinstance(r[c], float) else f"{r[c]:>11}" for c in cols))


def _style(ax):
    ax.set_facecolor(SURFACE)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(GRID)
    ax.tick_params(colors=INK2, labelsize=8)
    ax.yaxis.grid(True, color=GRID, lw=0.8); ax.set_axisbelow(True)


def plot_comparison(rows, scenario, outdir, highlight=("DHA-ALNS", "HEFT-TS")):
    metrics = ["fitness", "makespan", "cost", "energy", "utilization", "sla_rate"]
    fig, axes = plt.subplots(2, 3, figsize=(14, 7.5), facecolor=SURFACE)
    names = [r["algorithm"] for r in rows]
    for ax, mt in zip(axes.flat, metrics):
        _style(ax)
        vals = [r[mt] for r in rows]
        colors = [SERIES[highlight.index(n)] if n in highlight else MUTED for n in names]
        ax.bar(names, vals, color=colors, width=0.6, edgecolor=SURFACE, linewidth=2)
        ax.set_title(METRIC_LABELS[mt], color=INK, fontsize=10, loc="left")
        ax.tick_params(axis="x", rotation=40)
    fig.suptitle(f"Perbandingan algoritma — skenario {scenario}", color=INK, x=0.01, ha="left")
    fig.tight_layout()
    path = os.path.join(outdir, f"comparison_{scenario}.png")
    fig.savefig(path, dpi=130); plt.close(fig)
    return path


def plot_convergence(histories: dict, scenario, outdir):
    fig, ax = plt.subplots(figsize=(8, 4.5), facecolor=SURFACE)
    _style(ax)
    for (name, h), c in zip(histories.items(), SERIES):
        x = [p[0] for p in h]; y = [p[1] for p in h]
        ax.plot(x, y, color=c, lw=2, label=name, drawstyle="steps-post")
        ax.annotate(name, (x[-1], y[-1]), xytext=(4, 0), textcoords="offset points",
                    color=INK2, fontsize=8, va="center")
    ax.set_xlabel("Jumlah evaluasi fitness", color=INK2)
    ax.set_ylabel("Best fitness", color=INK2)
    ax.legend(frameon=False, labelcolor=INK2)
    ax.set_title(f"Konvergensi — skenario {scenario}", color=INK, loc="left")
    fig.tight_layout()
    path = os.path.join(outdir, f"convergence_{scenario}.png")
    fig.savefig(path, dpi=130); plt.close(fig)
    return path
