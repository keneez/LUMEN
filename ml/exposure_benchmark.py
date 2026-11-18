"""Evaluate the shipped browser CNN on paired synthetic brightness changes.

Usage from a checkout: python ml/exposure_benchmark.py
Dependencies: Python with NumPy, Node.js >= 18.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from scenes import CLASSES, scene

HERE = Path(__file__).resolve().parent
BASE_SEED = 33_000_000
PER_CLASS = 80
GAINS = [0.5, 0.75, 1.0, 1.25, 1.5]


def run_benchmark(project_root):
    frames = np.stack([
        scene(kind, BASE_SEED + class_index * 1000 + i)
        for class_index, kind in enumerate(CLASSES)
        for i in range(PER_CLASS)
    ])
    weights = (project_root / "cv_model.js").read_bytes()
    report = {
        "domain": "procedural synthetic scenes",
        "classes": CLASSES,
        "base_seed": BASE_SEED,
        "seed_stride": 1000,
        "per_class": PER_CLASS,
        "distinct_scenes": len(frames),
        "weights_file": "cv_model.js",
        "weights_sha256": hashlib.sha256(weights).hexdigest(),
        "conditions": [],
    }
    for gain in GAINS:
        pixels = np.rint(np.clip(frames * gain, 0, 1) * 255).astype(np.uint8)
        output = subprocess.run(
            ["node", str(HERE / "score_frames.cjs"), str(project_root)],
            input=pixels.tobytes(), stdout=subprocess.PIPE, check=True,
        )
        predictions = json.loads(output.stdout)
        if len(predictions) != len(frames):
            raise ValueError("The classifier returned an unexpected number of predictions")
        matrix = np.zeros((len(CLASSES), len(CLASSES)), dtype=int)
        for index, label in enumerate(predictions):
            matrix[index // PER_CLASS, CLASSES.index(label)] += 1
        report["conditions"].append({
            "gain": gain,
            "correct": int(matrix.trace()),
            "total": len(frames),
            "accuracy": float(matrix.trace() / len(frames)),
            "confusion": matrix.tolist(),
        })
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=HERE.parent,
                        help="Directory containing cv_model.js and vision.js")
    parser.add_argument("--output", type=Path, default=HERE / "exposure_results.json")
    args = parser.parse_args()
    report = run_benchmark(args.project_root.resolve())
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    for row in report["conditions"]:
        print(f"{row['gain']:.2f}x  {row['correct']}/{row['total']}  {row['accuracy']:.1%}")


if __name__ == "__main__":
    main()
