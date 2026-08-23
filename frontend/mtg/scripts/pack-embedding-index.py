"""Projects the raw embedding vectors down and packs them into the runtime index.

Reads the float32 vectors produced by build-embedding-index.mjs, fits a PCA on a sample,
projects every vector to a much smaller dimension, quantises to int8 and writes the files the
app loads. Splitting this out from the inference step is deliberate: it runs in seconds, so the
projection can be retuned without paying 45 minutes of inference again.

The quantisation scale is a single global factor, not one per dimension. A per-dimension scale
would represent each vector more accurately but would distort the dot product, because the
squared scale of each dimension would then weight the sum. One factor keeps the integer dot
product proportional to the real one.

Usage: python3 scripts/pack-embedding-index.py [--dim 128] [--sample 50000]
           [--preprocessing clahe4+area224] [--out public/data/scan-index]
"""

import argparse
import gzip
import json
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE = HERE.parent / ".cache" / "scryfall"
OUTPUT = HERE.parent / "public" / "data" / "scan-index"
SOURCE_DIM = 768


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dim", type=int, default=128, help="target dimension after PCA")
    parser.add_argument("--sample", type=int, default=50000, help="vectors used to fit the PCA")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument(
        "--preprocessing",
        default="clahe4+area224",
        choices=["clahe4+area224", "area224"],
        help="which variant's vectors to pack; each has its own source file and manifest entry",
    )
    parser.add_argument("--out", default=None, help="index directory, defaults to the shipped one")
    return parser.parse_args()


def load_vectors(preprocessing):
    slug = "clahe4" if preprocessing == "clahe4+area224" else "plain"
    path = CACHE / "embeddings" / f"dinov2-small.{slug}.f32"
    raw = np.fromfile(path, dtype=np.float32)
    count = raw.size // SOURCE_DIM
    if raw.size % SOURCE_DIM:
        raise SystemExit(f"{path} enthält {raw.size} Werte, kein Vielfaches von {SOURCE_DIM}")
    return raw[: count * SOURCE_DIM].reshape(count, SOURCE_DIM)


def load_faces(count):
    faces = []
    with open(CACHE / "faces.jsonl", encoding="utf-8") as handle:
        for index, line in enumerate(handle):
            if index >= count:
                break
            faces.append(json.loads(line))
    if len(faces) != count:
        raise SystemExit(f"faces.jsonl hat {len(faces)} Zeilen, erwartet {count}")
    return faces


def fit_pca(vectors, dim, sample_size, seed):
    rng = np.random.default_rng(seed)
    take = min(sample_size, vectors.shape[0])
    sample = vectors[rng.choice(vectors.shape[0], size=take, replace=False)].astype(np.float64)
    mean = sample.mean(axis=0)
    centred = sample - mean
    # Covariance eigenvectors via SVD of the centred sample: numerically better behaved than
    # forming the covariance matrix explicitly.
    _, singular, components = np.linalg.svd(centred, full_matrices=False)
    explained = float((singular[:dim] ** 2).sum() / (singular**2).sum())
    return mean.astype(np.float32), components[:dim].astype(np.float32), explained


def main():
    args = parse_args()
    global OUTPUT
    if args.out:
        OUTPUT = Path(args.out)
    OUTPUT.mkdir(parents=True, exist_ok=True)

    vectors = load_vectors(args.preprocessing)
    count = vectors.shape[0]
    print(f"{count} Vektoren à {SOURCE_DIM}")
    faces = load_faces(count)

    mean, components, explained = fit_pca(vectors, args.dim, args.sample, args.seed)
    print(f"PCA {SOURCE_DIM} -> {args.dim}, erklärte Varianz {explained * 100:.1f}%")

    projected = (vectors - mean) @ components.T
    norms = np.linalg.norm(projected, axis=1, keepdims=True)
    norms[norms == 0] = 1
    projected /= norms

    scale = 127.0 / float(np.abs(projected).max())
    quantised = np.clip(np.rint(projected * scale), -127, 127).astype(np.int8)

    reconstructed = quantised.astype(np.float32) / scale
    reconstructed /= np.maximum(np.linalg.norm(reconstructed, axis=1, keepdims=True), 1e-9)
    fidelity = float((reconstructed * projected).sum(axis=1).mean())
    print(f"int8-Skala {scale:.2f}, mittlerer Kosinus zum float-Vektor {fidelity:.5f}")

    (OUTPUT / "vectors.i8").write_bytes(quantised.tobytes())
    projection = np.concatenate([mean.reshape(1, -1), components], axis=0).astype(np.float32)
    (OUTPUT / "projection.f32").write_bytes(projection.tobytes())

    # Short keys and no image url: the url follows from the id, so storing 111k of them would
    # add megabytes for information the client can derive.
    identity = [
        {
            "i": face["id"],
            "n": face["name"],
            "s": face["set"],
            "S": face["setName"],
            "c": face["collectorNumber"],
            "l": face["lang"],
            "f": face["face"],
            "m": face.get("manaCost") or "",
            "t": face.get("typeLine") or "",
            "k": face.get("colors") or [],
        }
        for face in faces
    ]
    with gzip.open(OUTPUT / "cards.json.gz", "wt", encoding="utf-8") as handle:
        json.dump(identity, handle, separators=(",", ":"), ensure_ascii=False)

    manifest = {
        "formatVersion": 1,
        "model": "dinov2-small",
        "pooling": "cls+patchmean",
        # Must match PREPROCESSING in src/scanner/embedding.ts. The app refuses an index whose
        # vectors were built with different preprocessing than it applies to its queries.
        "preprocessing": args.preprocessing,
        "sourceDim": SOURCE_DIM,
        "dim": args.dim,
        "count": count,
        "scale": scale,
        "explainedVariance": explained,
        "quantisationFidelity": fidelity,
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    for name in ("vectors.i8", "projection.f32", "cards.json.gz", "manifest.json"):
        size = (OUTPUT / name).stat().st_size
        print(f"  {name:18} {size / 1e6:7.2f} MB")


if __name__ == "__main__":
    main()
