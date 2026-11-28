"""Projects the raw embedding vectors down and packs them into the runtime index.

Reads the float32 vectors produced by build-embedding-index.mjs, fits a PCA on a sample,
projects every vector to a much smaller dimension, quantises to int8 and writes the files the
app loads. Splitting this out from the inference step is deliberate: it runs in seconds, so the
projection can be retuned without paying 45 minutes of inference again.

The quantisation scale is a single global factor, not one per dimension. A per-dimension scale
would represent each vector more accurately but would distort the dot product, because the
squared scale of each dimension would then weight the sum. One factor keeps the integer dot
product proportional to the real one.

Which model, model file, pooling and preprocessing the vectors come from is read from the
builder's sidecar JSON and carried into the manifest, which the app checks against what it
embeds its queries with.

Usage: python3 scripts/pack-embedding-index.py [--vectors .cache/embeddings/dhv-embed.bilinear.f32]
           [--dim 128] [--projection pca|identity] [--sample 50000] [--cache DIR] [--out DIR]
       without --vectors: [--preprocessing clahe4+area224|area224] picks a DINOv2 vector file
       under <cache>/embeddings, as before
"""

import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
PUBLIC_DATA = HERE.parent / "public" / "data"
DINOV2 = {"model": "dinov2-small", "pooling": "cls+patchmean", "dim": 768, "index": "scan-index"}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dim", type=int, default=128, help="target dimension after the projection")
    parser.add_argument(
        "--projection",
        default="pca",
        choices=["pca", "identity"],
        help="identity keeps the raw vectors as they are and needs --dim equal to their length",
    )
    parser.add_argument("--sample", type=int, default=50000, help="vectors used to fit the PCA")
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument(
        "--preprocessing",
        default="clahe4+area224",
        choices=["clahe4+area224", "area224"],
        help="which DINOv2 variant's vectors to pack when --vectors is not given",
    )
    parser.add_argument("--vectors", default=None, help="raw .f32 file; its .json sidecar names the model")
    parser.add_argument(
        "--cache",
        default=os.environ.get("SCAN_CACHE", str(HERE.parent / ".cache" / "scryfall")),
        help="reference cache holding faces.jsonl, or SCAN_CACHE",
    )
    parser.add_argument(
        "--embeddings",
        default=os.environ.get("SCAN_EMBEDDINGS"),
        help="where DINOv2 vector files are looked up, or SCAN_EMBEDDINGS; defaults to <cache>/embeddings",
    )
    parser.add_argument("--out", default=None, help="index directory, defaults to the one the app serves")
    return parser.parse_args()


def describe_vectors(args):
    """Finds the raw vector file and what made it."""
    if args.vectors:
        path = Path(args.vectors)
        meta = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
        return path, meta
    slug = "clahe4" if args.preprocessing == "clahe4+area224" else "plain"
    embeddings = Path(args.embeddings) if args.embeddings else Path(args.cache) / "embeddings"
    path = embeddings / f"dinov2-small.{slug}.f32"
    meta = {**DINOV2, **json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))}
    meta["preprocessing"] = args.preprocessing
    return path, meta


def load_vectors(path, source_dim):
    raw = np.fromfile(path, dtype=np.float32)
    count = raw.size // source_dim
    if raw.size % source_dim:
        raise SystemExit(f"{path} enthält {raw.size} Werte, kein Vielfaches von {source_dim}")
    return raw[: count * source_dim].reshape(count, source_dim)


def load_faces(cache, count):
    faces = []
    with open(Path(cache) / "faces.jsonl", encoding="utf-8") as handle:
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
    path, meta = describe_vectors(args)
    source_dim = meta["dim"]
    output = Path(args.out) if args.out else PUBLIC_DATA / meta.get("index", DINOV2["index"])
    output.mkdir(parents=True, exist_ok=True)

    vectors = load_vectors(path, source_dim)
    count = vectors.shape[0]
    print(f"{count} Vektoren à {source_dim} von {meta['model']} ({meta.get('modelFile', '?')}), {meta['preprocessing']}")
    faces = load_faces(args.cache, count)

    if args.projection == "identity":
        if args.dim != source_dim:
            raise SystemExit(f"--projection identity braucht --dim {source_dim}")
        mean = np.zeros(source_dim, dtype=np.float32)
        components = np.eye(source_dim, dtype=np.float32)
        explained = 1.0
        print(f"keine Projektion, {source_dim} Dimensionen")
    else:
        mean, components, explained = fit_pca(vectors, args.dim, args.sample, args.seed)
        print(f"PCA {source_dim} -> {args.dim}, erklärte Varianz {explained * 100:.1f}%")

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

    (output / "vectors.i8").write_bytes(quantised.tobytes())
    projection = np.concatenate([mean.reshape(1, -1), components], axis=0).astype(np.float32)
    (output / "projection.f32").write_bytes(projection.tobytes())

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
            # Only when it differs: a Japanese card says 暴虐の覇王アスマディ and carries
            # "Vaevictis Asmadi" in its metadata, and the reader sees the former. Stored for the
            # 2% of printings where the two are not the same, so the file grows by that much.
            **({"p": face["printedName"]} if face.get("printedName") and face["printedName"] != face["name"] else {}),
            # Set only for printings that were never sold unfoiled, so the scanner can mark them
            # without asking. Written as a flag rather than the finish list because that is the
            # only question anyone asks of it, and absent when false to keep the file small.
            **({"o": 1} if face.get("finishes") and "nonfoil" not in face["finishes"] else {}),
        }
        for face in faces
    ]
    # mtime=0 rather than gzip's default of "now". The manifest's content hash is taken over these
    # bytes, and a timestamp in the header changes them on every run, so an unchanged catalogue
    # still got a new hash, a new URL and a fresh 85 MB download for everyone who already had it.
    with open(output / "cards.json.gz", "wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as compressed:
            compressed.write(json.dumps(identity, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))

    # Content hash over the three payload files, so the app can request them under a URL that
    # changes whenever their bytes do. Without that the service worker's CacheFirst rule pins
    # whichever index the browser downloaded first, forever, and a rebuilt index never arrives.
    digest = hashlib.blake2b(digest_size=8)
    for name in ("vectors.i8", "projection.f32", "cards.json.gz"):
        digest.update((output / name).read_bytes())

    manifest = {
        "formatVersion": 1,
        "version": digest.hexdigest(),
        # Must match the model's entry in EMBEDDING_MODELS in src/scanner/embedding.ts. The app
        # refuses an index whose vectors were made by a different model, model file or
        # preprocessing than its queries.
        "model": meta["model"],
        **({"modelFile": meta["modelFile"]} if meta.get("modelFile") else {}),
        "pooling": meta["pooling"],
        "preprocessing": meta["preprocessing"],
        "projection": args.projection,
        "sourceDim": source_dim,
        "dim": args.dim,
        "count": count,
        "scale": scale,
        "explainedVariance": explained,
        "quantisationFidelity": fidelity,
        # What the app has to download before it can scan. Written here rather than asked for with
        # HEAD requests at load time: the app needs the total before it starts, to tell someone on
        # a mobile connection what they are agreeing to, and three extra round trips to learn it
        # would be paid on every visit.
        "bytes": {
            name: (output / name).stat().st_size for name in ("projection.f32", "vectors.i8", "cards.json.gz")
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    for name in ("vectors.i8", "projection.f32", "cards.json.gz", "manifest.json"):
        size = (output / name).stat().st_size
        print(f"  {name:18} {size / 1e6:7.2f} MB")


if __name__ == "__main__":
    main()
