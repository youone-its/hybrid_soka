# DHA-ALNS di CloudSim (Python)

Implementasi `brief.md`: penjadwalan workflow (DAG) di cloud heterogen dengan
**DHA-ALNS**, dibandingkan dengan baseline HEFT, Min-Min, GA, PSO, ACO, ALNS, HEFT-GA, serta
hybrid usulan kedua **HEFT-TS** (HEFT-seeded Tabu Search + VND).

## Menjalankan
```bash
python main.py                          # skenario small, semua algoritma
python main.py -s small medium large    # beberapa skenario
python main.py -s all --quick           # semua skenario, iterasi ringan
python main.py -a HEFT ALNS DHA-ALNS -w 8
python main.py -s small medium -r 10    # 10 run (seed berbeda) -> summary_*.csv mean ± std
```
Output (CSV + grafik PNG) ada di `results/`.

## Struktur folder
```
main.py                  # entry point CLI (satu-satunya file yang dijalankan)
config/settings.py       # skenario, bobot objektif, parameter algoritma
cloudsim/                # mini-CloudSim: simulator cloud
  entities.py            #   Datacenter, Vm, Cloudlet
  workload.py            #   struktur Workload (DAG)
datasets/                # loader trace: google.py, alibaba.py, download.py
data/raw, data/processed # trace mentah & cache hasil parsing
  environment.py         #   tipe VM, matriks exec time, bandwidth, deadline SLA
  simulation.py          #   discrete-event simulation engine
algorithms/              # baseline
  base.py heft.py minmin.py ga.py (GA, HEFT-GA) pso.py aco.py alns.py
  heft_ts.py             #   HEFT-TS: HEFT seed -> Tabu Search -> VND (hybrid pola B)
dha_alns/                # algoritma usulan
  analyzer.py            #   Workload Analyzer
  decomposition.py       #   Hierarchical Decomposition (dependency/resource/locality)
  operators.py           #   operator destroy & repair
  alns_core.py           #   ALNS + adaptive operator selection + SA acceptance
  worker.py              #   ALNS worker (paralel, ProcessPool)
  coordinator.py         #   merge, validasi, resource rebalancing, global refinement
  dha_alns.py            #   orkestrasi 4 tahap
evaluation/
  objectives.py          #   metrik & F(x)=w1T+w2C+w3E+w4S
  experiment.py          #   runner per skenario
  report.py              #   tabel, CSV, grafik
results/                 # output
```

## Catatan model
- **Simulator**: tidak ada CloudSim resmi untuk Python, jadi `cloudsim/` adalah
  re-implementasi ringan konsep CloudSim (Datacenter–VM–Cloudlet–Broker) dengan
  event-driven engine: VM space-shared, transfer data antar VM/DC memakai bandwidth.
- **Fitness** dinormalisasi terhadap HEFT: `F = 0.4·T/T_HEFT + 0.2·C/C_HEFT + 0.2·E/E_HEFT + 0.2·(SLA rate + tardiness)`.
- **Energi**: `busy·P_max + idle·P_idle` per VM; **biaya**: pay-per-use `busy·harga/s`.
- **Konvergensi DHA-ALNS**: evaluasi worker paralel dihitung sebagai maksimum per
  putaran (ekuivalen wall-clock), bukan jumlah total.

## Dataset
```bash
python -m datasets.download all          # Google 2011 task_events part-0 (4 MB) + Alibaba 2018 batch_task (130 MB)
python main.py -d alibaba -s medium      # alibaba (default) | google
```
| Dataset | Sumber | Yang dipakai | Dependensi |
|---|---|---|---|
| `google` | Google Cluster Trace 2011 (`clusterdata-2011-2/task_events`) | durasi = FINISH − SCHEDULE, `cpu_request`, `memory_request` | tidak ada (bag-of-tasks) |
| `alibaba` | Alibaba Cluster Trace v2018 (`batch_task.csv`) | durasi = end − start, `plan_cpu`, `plan_mem`, DAG dari `task_name` (mis. `R6_3`) | DAG per job |

Konversi (`datasets/common.py`): `length (MI) = durasi × 1000 MIPS × core`, RAM = memori
ternormalisasi × 16 GB. Trace tidak memuat ukuran data antar-task maupun GPU, jadi
ukuran output diestimasi `0.5 MB/s × durasi` dan tidak ada task GPU. Hasil parsing
di-cache di `data/processed/` (hapus untuk parse ulang). Alibaba: hanya 2 jt baris pertama
dibaca, diambil job DAG lengkap (3–60 task, semua Terminated), lalu job diambil acak sampai jumlah task tercapai.

## HEFT-TS (HEFT-seeded Tabu Search + VND)
Hybrid relay (heuristik -> metaheuristik) + local search:
1. **HEFT** membangun solusi awal.
2. **Tabu Search**: tiap iterasi mengevaluasi daftar kandidat terarah: move task di
   critical path / VM bottleneck, move ke VM lebih murah, dan swap. Ambil tetangga
   terbaik yang tidak tabu (aspirasi bila global best). Task dilarang kembali ke VM
   asal selama `tenure` = 7 iterasi.
3. **VND** setiap ada global best baru: move critical path -> move murah -> swap.

Budget evaluasi = `alns_iters` (sama dengan ALNS) agar adil. Parameter via
`AlgoParams.extra`: `ts_budget`, `ts_tenure`.
Ref.: Porto & Ribeiro (1995), tabu search untuk task scheduling heterogen dengan precedence.

Multi-run: `-r N` menjalankan N seed algoritma pada workload yang sama, lalu menyimpan
`runs_<skenario>.csv` (per run) dan `summary_<skenario>.csv` (mean ± std).
Hasil single-run lama disimpan di `results_v1/`.
