//! Which card embedding models exist, and what follows from choosing one.
//!
//! Kept apart from the preprocessing and pooling code, which pulls in the image pipeline, so the
//! main thread can name a model and find its index without loading any of that.

/**
 * A way of turning a rectified card into model input.
 *
 * A variant is a parameter rather than a constant because comparing two of them end to end is
 * the only way to find out whether one is better, and that comparison has to run both sides of
 * the chain, index and query, in the same variant. Naming them makes an A/B a flag instead of an
 * edit.
 */
export type Preprocessing = "area224" | "clahe4+area224" | "bilinear448x320";

/**
 * A card embedding model the scanner can run.
 *
 * A name rather than a constant for the same reason as {@link Preprocessing}: the model file, its
 * input geometry, its pooling and the index it is searched against all follow from it, so two
 * models can be compared end to end, and a query and an index from different models are refused
 * instead of quietly returning the wrong card.
 */
export type EmbeddingModel = "dinov2-small" | "dhv-embed";

/**
 * Everything that follows from the choice of an {@link EmbeddingModel}
 */
export type EmbeddingModelSpec = {
    id: EmbeddingModel;
    /** File name under `public/models/`, served from `/models/` */
    file: string;
    /** Directory of the matching index under `public/data/`, served from `/data/` */
    index: string;
    /** The preprocessing its index is built with, and so the one its queries must use */
    preprocessing: Preprocessing;
    /** How the raw model output becomes one vector per image */
    pooling: "cls+patchmean" | "l2";
    /** Length of the pooled vector, which is the index's `sourceDim` */
    dim: number;
};

/**
 * The models the scanner knows.
 *
 * `dinov2-small` is the shipped one. `dhv-embed` is dhvazquez/mtg_card_identification_embeddings
 * (MIT): EfficientNet-Lite0 trained with Sub-center ArcFace on warped renders of Scryfall cards,
 * whose output is already the 256-d unit vector.
 */
export const EMBEDDING_MODELS: Record<EmbeddingModel, EmbeddingModelSpec> = {
    "dinov2-small": {
        id: "dinov2-small",
        file: "dinov2-small.onnx",
        index: "scan-index",
        preprocessing: "area224",
        pooling: "cls+patchmean",
        dim: 768,
    },
    "dhv-embed": {
        id: "dhv-embed",
        file: "mtg_embed_fp32.onnx",
        index: "scan-index-dhv",
        preprocessing: "bilinear448x320",
        pooling: "l2",
        dim: 256,
    },
};

/** The model a device uses until someone picks another. */
export const DEFAULT_EMBEDDING_MODEL: EmbeddingModel = "dinov2-small";

/**
 * Whether a stored or passed value names a known model
 *
 * @param value anything
 * @returns whether it is an {@link EmbeddingModel}
 */
export function isEmbeddingModel(value: unknown): value is EmbeddingModel {
    return typeof value === "string" && Object.hasOwn(EMBEDDING_MODELS, value);
}
