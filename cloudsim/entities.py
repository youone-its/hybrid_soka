"""Entitas ala CloudSim: Datacenter, Vm, Cloudlet."""
from dataclasses import dataclass, field


@dataclass
class Vm:
    id: int
    dc_id: int
    vm_type: str
    mips: float          # kecepatan (Million Instructions / s)
    pes: int
    ram: int             # MB
    has_gpu: bool
    cost_per_sec: float  # $/s
    power_idle: float    # Watt
    power_max: float     # Watt


@dataclass
class Datacenter:
    id: int
    name: str
    intra_bw: float      # MB/s antar VM dalam DC
    vms: list = field(default_factory=list)


@dataclass
class Cloudlet:
    id: int
    length: float        # MI
    ram: int             # MB yang dibutuhkan
    needs_gpu: bool
    output_size: float   # MB data ke successor
