"""Bench step 2: materialize the emitted designs into Scene3 JSON (kernel
input) and time the backend lanes in-process via FastAPI TestClient — no
running server needed. Timings are the server-side handler cost; real HTTP
adds transport on top (localhost ~2-10 ms, LAN/WAN more).

Run from the optikit-core repo root:
    uv run --no-sync python ../openUC2-OptiKit/src/bench/gen_scenes.py
"""

from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

import yaml
from fastapi.testclient import TestClient

from optikit_core.service.app import create_app

HERE = Path(__file__).resolve().parent
DESIGNS = HERE / "fixtures" / "designs"
SCENES = HERE / "fixtures" / "scenes"
RESULTS = HERE / "results"

RAY_SWEEP = [16, 64, 256, 1024, 4096]
SWEEP_SCENES = ["row3", "fold", "epi"]
SCALE_RAYS = 256


def timeit(fn, warmup: int, iters: int) -> dict:
    for _ in range(warmup):
        fn()
    durations = []
    for _ in range(iters):
        t0 = time.perf_counter()
        fn()
        durations.append((time.perf_counter() - t0) * 1000.0)
    durations.sort()
    return {
        "median_ms": round(statistics.median(durations), 3),
        "p90_ms": round(durations[int(len(durations) * 0.9) - 1], 3),
        "mean_ms": round(statistics.fmean(durations), 3),
        "iters": iters,
    }


def main() -> None:
    SCENES.mkdir(parents=True, exist_ok=True)
    RESULTS.mkdir(parents=True, exist_ok=True)
    client = TestClient(create_app())

    out: dict = {"scene3": {}, "simulate": [], "env": {"python": sys.version.split()[0]}}

    for design_path in sorted(DESIGNS.glob("*.yml")):
        name = design_path.stem
        files = {"optikit-design.yml": design_path.read_text(encoding="utf-8")}

        # --- /v1/scene3: materialize (the kernel's structural-edit lane) ---
        r = client.post("/v1/scene3", json={"files": files})
        if r.status_code != 200:
            print(f"[scene3] {name}: HTTP {r.status_code}: {r.text[:300]}")
            continue
        body = r.json()
        scene = body["scene"]
        (SCENES / f"{name}.json").write_text(json.dumps(scene), encoding="utf-8")
        stats = timeit(lambda: client.post("/v1/scene3", json={"files": files}), 3, 25)
        counts = {k: len(scene.get(k) or []) for k in
                  ("bodies", "surfaces", "apertures", "sources", "detectors")}
        out["scene3"][name] = {
            **stats,
            "counts": counts,
            "warnings": len(body.get("warnings") or []),
            "findings": [f.get("code") for f in body.get("findings") or []],
        }
        print(f"[scene3] {name}: {stats['median_ms']} ms median, counts={counts}, "
              f"findings={out['scene3'][name]['findings']}")

        # --- /v1/simulate: the authoritative Optiland lane -----------------
        try:
            ri = client.post("/v1/chain/infer", json={"files": files})
            if ri.status_code != 200:
                print(f"[simulate] {name}: infer failed HTTP {ri.status_code}: {ri.text[:200]}")
                continue
            paths = ri.json().get("paths") or {}
            if not paths:
                print(f"[simulate] {name}: no inferable path, skipped")
                continue
            path_name = sorted(paths)[0]
            doc = yaml.safe_load(files["optikit-design.yml"])
            doc["paths"] = {path_name: paths[path_name]}
            files_p = {"optikit-design.yml": yaml.safe_dump(doc, sort_keys=False)}

            sweep = RAY_SWEEP if name in SWEEP_SCENES else [SCALE_RAYS]
            for n in sweep:
                body_sim = {"files": files_p, "path": path_name, "actions": ["trace"],
                            "num_rays": n, "distribution": "line_y"}
                rs = client.post("/v1/simulate", json=body_sim)
                if rs.status_code != 200:
                    print(f"[simulate] {name} n={n}: HTTP {rs.status_code}: {rs.text[:300]}")
                    break
                rays_world = rs.json().get("rays_world") or []
                n_points = sum(len(p_) for p_ in rays_world)
                stats = timeit(lambda: client.post("/v1/simulate", json=body_sim), 2, 12)
                out["simulate"].append({
                    "scene": name, "path": path_name, "num_rays": n, **stats,
                    "polylines": len(rays_world), "points": n_points,
                })
                print(f"[simulate] {name} n={n}: {stats['median_ms']} ms median, "
                      f"{len(rays_world)} polylines")
        except Exception as exc:  # keep the sweep going; record the failure
            print(f"[simulate] {name}: FAILED {type(exc).__name__}: {exc}")
            out["simulate"].append({"scene": name, "error": f"{type(exc).__name__}: {exc}"})

    try:
        import optiland
        out["env"]["optiland"] = getattr(optiland, "__version__", "?")
    except ImportError:
        out["env"]["optiland"] = "absent"

    (RESULTS / "backend.json").write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"\nwrote {RESULTS / 'backend.json'}")


if __name__ == "__main__":
    main()
