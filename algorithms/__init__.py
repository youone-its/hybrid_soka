"""Algoritma baseline + registry semua penjadwal."""
from .heft import HEFT
from .minmin import MinMin
from .ga import GA, HEFTGA
from .pso import PSO
from .aco import ACO
from .alns import ALNS
from .heft_ts import HEFTTS


def get_registry():
    from dha_alns import DHAALNS
    return {c.name: c for c in (HEFT, MinMin, GA, PSO, ACO, ALNS, HEFTGA, HEFTTS, DHAALNS)}
