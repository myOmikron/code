/**
 * Radar-axis shaping for one profile read: why a suggestion scored.
 *
 * The deck's own theme read moved to `deck-theme-read.ts`, which reads the
 * cards behind a theme rather than its share of a distribution — see the
 * argument there.
 *
 * Pure functions over the graph service's reports. Nothing here derives a
 * figure the API did not send — every value is a channel score or a theme
 * share the backend computed, rescaled for geometry and returned alongside
 * the original.
 *
 * Why rescale at all: raw channel scores share no common scale by design. A
 * combo completion is worth ~1.8 points flat while a role-gap hit caps near
 * 0.2 — the fusion weights price channels against each other, not against a
 * 0-to-1 axis. Plotted raw, every radar would be a combo spike. So each axis
 * is normalised against the strongest suggestion *in the same report* on that
 * axis: 1.0 means "best in this batch on this axis", which is a claim the
 * data actually supports. The raw score rides along for display, so the
 * honest number is never further away than the shape.
 */

import { Provenance, Suggestion } from "src/api/graph-generated";

/**
 * The five axes, in fixed order — five *kinds of argument*, not a 1:1 copy of
 * the backend's channels. `theme_fit` and `typal_bridge` fold into one
 * `identity` axis: both say "fits what this deck is about" (the theme layer
 * even ships tribal as a theme), and keeping them apart left two often-dead
 * axes whose split reflected trigger history, not meaning. The backend
 * channels stay distinct — weights, badges, grouping — this fold is purely
 * how the radar reads them, and the identity axis carries its contributors so
 * a caller can name the specific theme or creature type.
 *
 * Axis order matters on a radar — adjacent axes form the shape's lobes — so
 * it is fixed here: empirical, identity, the two mechanical-layer axes, then
 * combos. An axis nothing fired sits at the centre, never dropped, so two
 * radars stay comparable at a glance.
 *
 * Negative provenance (`theme_excluded` and `type_saturation` demotions) is
 * NOT an axis — a radar cannot draw negative length. {@link exclusions} hands
 * those entries back for a footnote instead, so what is drawn still accounts
 * for the total.
 */
export const AXIS_ORDER = ["edhrec_synergy", "identity", "resource_bridge", "role_gap", "combo_completion"];

/** The channels that fold into the `identity` axis */
const IDENTITY_CHANNELS = new Set(["theme_fit", "typal_bridge"]);

/** One axis of a suggestion's radar */
export type RadarAxis = {
    /** The axis id, one of {@link AXIS_ORDER} */
    id: string;
    /** The raw fused points this axis contributed */
    score: number;
    /** The plotted magnitude, 0 to 1, against the batch peak on this axis */
    value: number;
    /** What fed the identity axis, so a caller can name the theme or type */
    contributors?: Array<{ key: string | null; channel: string; score: number }>;
};

/**
 * Holds a value inside the unit interval
 *
 * @param value the number to clamp
 *
 * @returns the value, held to 0…1
 */
function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/**
 * Per-axis positive score sums for one suggestion, zero-filled
 *
 * @param suggestion the suggestion to read
 *
 * @returns the axis sums and what fed the identity axis
 */
function axisScores(suggestion: Suggestion): {
    scores: Record<string, number>;
    contributors: Array<{ key: string | null; channel: string; score: number }>;
} {
    const scores: Record<string, number> = Object.fromEntries(AXIS_ORDER.map((id) => [id, 0]));
    const contributors: Array<{ key: string | null; channel: string; score: number }> = [];

    for (const entry of suggestion.provenance) {
        // Demotions are footnotes, not axes; unknown channels are ignored
        // rather than growing an axis the order does not define.
        if (entry.score <= 0) continue;

        if (IDENTITY_CHANNELS.has(entry.channel)) {
            scores.identity += entry.score;
            contributors.push({ key: entry.key ?? null, channel: entry.channel, score: entry.score });
        } else if (entry.channel in scores) {
            scores[entry.channel] += entry.score;
        }
    }

    return { scores, contributors };
}

/**
 * Per-axis peaks across a batch of suggestions — the strongest score any
 * suggestion in the batch reached on each axis, for {@link suggestionRadar} to
 * normalise against.
 *
 * Hoisted out of `suggestionRadar` so a caller with many suggestions to plot
 * (a whole gallery) computes this once per report instead of once per tile:
 * the peaks are the same for every tile in a batch, so recomputing them per
 * tile was O(n²) for no reason — see the gallery for how this is cached.
 *
 * @param suggestions the batch to scan
 *
 * @returns the peak score per axis, zero-filled for an axis nothing reached
 */
export function batchPeaks(suggestions: Array<Suggestion>): Record<string, number> {
    const peaks: Record<string, number> = Object.fromEntries(AXIS_ORDER.map((id) => [id, 0]));
    for (const peer of suggestions) {
        const { scores } = axisScores(peer);
        for (const id of AXIS_ORDER) peaks[id] = Math.max(peaks[id], scores[id]);
    }
    return peaks;
}

/**
 * Radar axes for one suggestion, normalised per axis against the peaks of the
 * batch it arrived in.
 *
 * @param suggestion one entry from the report
 * @param peaks the batch's per-axis peaks, from {@link batchPeaks}
 *
 * @returns the axes in {@link AXIS_ORDER}
 */
export function suggestionRadar(suggestion: Suggestion, peaks: Record<string, number>): Array<RadarAxis> {
    const { scores, contributors } = axisScores(suggestion);
    // An empty batch — or one where nothing scored on any axis — falls back
    // to the "batch of one" reading: normalise against the suggestion's own
    // scores, so a lone suggestion (the card dialog, opened outside a list)
    // still draws a legible shape instead of an all-zero radar.
    const effectivePeaks = AXIS_ORDER.every((id) => peaks[id] === 0) ? scores : peaks;

    return AXIS_ORDER.map((id) => ({
        id,
        score: scores[id],
        value: effectivePeaks[id] > 0 ? clamp01(scores[id] / effectivePeaks[id]) : 0,
        ...(id === "identity" ? { contributors } : {}),
    }));
}

/**
 * The demotions baked into a suggestion's total — negative provenance, such
 * as a theme the user excluded. A radar cannot draw negative length, so these
 * belong in a footnote beside it rather than on an axis.
 *
 * @param suggestion the suggestion to read
 *
 * @returns the negative provenance entries
 */
export function exclusions(suggestion: Suggestion): Array<Provenance> {
    return suggestion.provenance.filter((entry) => entry.score < 0);
}

/**
 * The multi-channel agreement bonus baked into a suggestion's total score.
 *
 * Recovered as `score − Σ provenance` rather than recomputed from the
 * backend's constant, which a copy here would drift from silently. Float dust
 * from the subtraction reads as zero.
 *
 * @param suggestion the suggestion to read
 *
 * @returns the bonus, or 0 when there is none
 */
export function fusionBonus(suggestion: Suggestion): number {
    const summed = suggestion.provenance.reduce((sum, entry) => sum + entry.score, 0);
    const bonus = suggestion.score - summed;

    return bonus > 0.005 ? bonus : 0;
}
