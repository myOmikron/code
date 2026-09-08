//! Which WebGPU arrangement to try, and what to try after it fails.
//!
//! Its own module, and deliberately free of imports. Both sides need it — the worker to set the
//! arrangement up, the page to remember it across loads — and when it lived next to the model
//! loader the page pulled the whole inference runtime along with it, 388 kB of it, to call one
//! five-line function.

/**
 * How to arrange WebGPU for one attempt.
 *
 * One page load can test exactly one of these, because `env.webgpu.adapter` is only consulted
 * before the provider's first session. So the page remembers what the last load found out and
 * hands back the next thing to try, ending at "off" once nothing is left.
 */
export type WebgpuStrategy = "full" | "no-subgroups" | "no-subgroups-f16" | "off";

/**
 * What to try after an arrangement failed
 *
 * @param strategy what was tried
 * @returns the next one, or "off" when the list is exhausted
 */
export function nextStrategy(strategy: WebgpuStrategy): WebgpuStrategy {
    if (strategy === "full") return "no-subgroups";
    if (strategy === "no-subgroups") return "no-subgroups-f16";
    return "off";
}
