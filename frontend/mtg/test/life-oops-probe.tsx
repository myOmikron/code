// Renders the real life tracker tiles with the route's own hit bookkeeping, so
// the "ups, that was commander damage" offer can be tapped through and
// screenshotted without logging into the app. Driven by a CDP script that hits
// a tile's minus button and then its shield.
import clsx from "clsx";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import { LifeTile } from "src/components/life-tile";
import type { Table } from "src/utils/life-tracker";
import { emptyCommanderDamage, opponentOrder, seatingFor, trackHit, withHit } from "src/utils/life-tracker";

const PLAYERS = Number(new URLSearchParams(window.location.search).get("players") ?? 4);

/** The pod, seated the way the screen the probe is driven at seats one */
const seating = seatingFor(
    PLAYERS,
    "sides",
    window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
);

/**
 * The tracker's tiles alone, on a phone-sized table
 *
 * @returns the probe
 */
function Probe() {
    const [table, setTable] = useState<Table>({
        life: Array<number>(PLAYERS).fill(40),
        damage: emptyCommanderDamage(PLAYERS),
        deltas: {},
        hits: {},
    });

    return (
        <div className={clsx("grid h-svh w-full gap-1.5 bg-zinc-950 p-2", seating.grid)}>
            {table.life.map((total, index) => (
                <LifeTile
                    key={index}
                    number={index + 1}
                    life={total}
                    delta={table.deltas[index]}
                    damage={table.damage[index]}
                    opponents={opponentOrder(seating.seats, index)}
                    placement={seating.seats[index]}
                    flush={seating.flush}
                    hit={table.hits[index]}
                    onChange={(amount) =>
                        setTable((current) => ({
                            ...current,
                            life: current.life.map((life, player) => (player === index ? life + amount : life)),
                            deltas: { ...current.deltas, [index]: (current.deltas[index] ?? 0) + amount },
                            hits: withHit(current.hits, index, trackHit(current.hits[index], amount, Date.now())),
                        }))
                    }
                    onDamage={(opponent, amount) =>
                        setTable((current) => ({
                            ...current,
                            damage: current.damage.map((row, player) =>
                                player === index
                                    ? row.map((value, other) =>
                                          other === opponent ? Math.max(0, value + amount) : value,
                                      )
                                    : row,
                            ),
                            hits: withHit(current.hits, index, undefined),
                        }))
                    }
                    onRebook={(opponent, amount) =>
                        setTable((current) => ({
                            ...current,
                            damage: current.damage.map((row, player) =>
                                player === index
                                    ? row.map((value, other) => (other === opponent ? value + amount : value))
                                    : row,
                            ),
                            hits: withHit(current.hits, index, undefined),
                        }))
                    }
                />
            ))}
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Probe />);
document.body.dataset.status = "ready";
