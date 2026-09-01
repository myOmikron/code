// Renders the real role-quota panel with its real target document, so a
// corridor handle can be dragged over CDP without logging into the app. The
// panel sizes its own track off the corridor in force, which is what made
// dragging to the right edge a feedback loop; `#state` carries the targets
// out to the driving script so a run can assert what a drag actually saved.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { BucketReport } from "src/api/graph-generated";
import { DeckAdvisorQuotas } from "src/components/deck-advisor-quotas";
import { DEFAULT_TARGETS, DeckTargets, withCorridor, withoutCorridor } from "src/utils/deck-targets";

const buckets = [
    {
        bucket: "interaction",
        coverage: 8,
        low: 8,
        high: 12,
        default_low: 8,
        default_high: 12,
        status: "ok",
        deviation: 0,
    },
    {
        bucket: "mana_sources",
        coverage: 36,
        low: 33,
        high: 38,
        default_low: 33,
        default_high: 38,
        status: "ok",
        deviation: 0,
    },
] as unknown as Array<BucketReport>;

/** The panel with the targets it edits, exactly as the advisor route wires it */
function Probe() {
    const [targets, setTargets] = useState<DeckTargets>(DEFAULT_TARGETS);

    return (
        <div className={"w-96 p-6"}>
            <DeckAdvisorQuotas
                buckets={buckets}
                custom={targets.buckets}
                onSet={(bucket, corridor) => setTargets((held) => withCorridor(held, bucket, corridor))}
                onReset={(bucket) => setTargets((held) => withoutCorridor(held, bucket))}
                art={new Map()}
            />
            <pre id={"state"}>{JSON.stringify(targets.buckets)}</pre>
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Probe />);
document.body.dataset["status"] = "ready";
