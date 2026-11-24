"""Konfigurasi skenario eksperimen & parameter algoritma."""
from dataclasses import dataclass, field


@dataclass
class Scenario:
    name: str
    n_tasks: int
    n_vms: int
    n_datacenters: int = 3
    dataset: str = "alibaba"       # alibaba | google
    deadline_factor: float = 1.2   # deadline = factor * lower-bound critical path


SCENARIOS = {
    "small":  Scenario("small", 100, 10, 2),
    "medium": Scenario("medium", 300, 20, 3),
    "large":  Scenario("large", 800, 40, 4),
}

# Bobot fungsi objektif F(x) = w1*T + w2*C + w3*E + w4*S (dinormalisasi terhadap HEFT)
WEIGHTS = {"makespan": 0.4, "cost": 0.2, "energy": 0.2, "sla": 0.2}


@dataclass
class AlgoParams:
    # Metaheuristik baseline
    ga_pop: int = 30
    ga_gens: int = 60
    pso_particles: int = 25
    pso_iters: int = 60
    aco_ants: int = 15
    aco_iters: int = 40
    # ALNS
    alns_iters: int = 1500
    destroy_ratio: tuple = (0.02, 0.12)
    sa_t0: float = 0.005
    sa_cooling: float = 0.997
    reaction: float = 0.2              # faktor reaksi update bobot operator
    scores: tuple = (10.0, 5.0, 1.0)   # global best, improvement, accepted
    # DHA-ALNS
    n_workers: int = 4
    n_clusters: int = 4
    rounds: int = 3                    # putaran decompose -> ALNS lokal -> koordinasi
    local_iters: int = 400
    global_iters: int = 300
    extra: dict = field(default_factory=dict)


def quick(p: AlgoParams) -> AlgoParams:
    """Parameter kecil untuk uji cepat."""
    p.ga_gens = p.pso_iters = 20
    p.aco_iters = 10
    p.alns_iters = 400
    p.local_iters, p.global_iters, p.rounds = 120, 80, 2
    return p
