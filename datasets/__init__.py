"""Loader dataset workload dari trace nyata: google | alibaba."""


def load_workload(name, n_tasks, rng):
    if name == "google":
        from .google import load_google
        return load_google(n_tasks, rng)
    if name == "alibaba":
        from .alibaba import load_alibaba
        return load_alibaba(n_tasks, rng)
    raise ValueError(f"dataset tidak dikenal: {name}")


DATASETS = ("alibaba", "google")
