/**
 * The shape of i18next's translate function, as the label helpers take it.
 *
 * They take it as an argument rather than calling `useTranslation` themselves
 * so that they stay plain functions, usable inside a `map` over rows without a
 * hook per row.
 */
export type Translate = (key: string) => string;
