/**
 * The shape of i18next's translate function, as the label helpers take it.
 *
 * They take it as an argument rather than calling `useTranslation` themselves
 * so that they stay plain functions, usable inside a `map` over rows without a
 * hook per row. The interpolation values are part of the shape: a label that
 * names the cards it is about has to hand them over.
 */
export type Translate = (key: string, options?: Record<string, unknown>) => string;
