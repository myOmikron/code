// Renders the real life tracker tiles with the route's own hit bookkeeping, so
// the "ups, that was commander damage" offer can be tapped through and
// screenshotted without logging into the app. Driven by a CDP script that hits
// a tile's minus button and then its shield, which turns the other tiles into
// targets.
import clsx from "clsx";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/i18n";
import type { TileBooking } from "src/components/life-tile";
import { LifeTile } from "src/components/life-tile";
import type { Table } from "src/utils/life-tracker";
import {
    emptyCommanderDamage,
    opponentOrder,
    rebookableHit,
    seatingFor,
    trackHit,
    withHit,
} from "src/utils/life-tracker";

const PLAYERS = Number(new URLSearchParams(window.location.search).get("players") ?? 4);

/** The pod, seated the way the screen the probe is driven at seats one */
const seating = seatingFor(PLAYERS, "sides", window.innerWidth >= window.innerHeight ? "landscape" : "portrait");

/** Who is booking and what stands to be rebooked */
type Booking = { player: number; offer: number | undefined };

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
    const [booking, setBooking] = useState<Booking | undefined>(undefined);

    /**
     * Writes one commander's tally on the booking player, costing life for it
     * unless the life is already gone
     *
     * @param opponent whose commander
     * @param amount what to add
     * @param costs whether the total pays for it
     */
    function book(opponent: number, amount: number, costs: boolean) {
        if (booking === undefined) return;
        const { player } = booking;
        setBooking({ player, offer: undefined });
        setTable((current) => {
            const taken = current.damage[player][opponent];
            const next = Math.max(0, taken + amount);
            return {
                ...current,
                life: current.life.map((life, index) => (costs && index === player ? life - (next - taken) : life)),
                damage: current.damage.map((row, index) =>
                    index === player ? row.map((value, other) => (other === opponent ? next : value)) : row,
                ),
                hits: withHit(current.hits, player, undefined),
            };
        });
    }

    /**
     * What part one tile plays in the booking
     *
     * @param index whose tile
     *
     * @returns the part, or nothing while nobody is booking
     */
    function bookingFor(index: number): TileBooking | undefined {
        if (booking === undefined) return undefined;
        if (booking.player === index) {
            return {
                role: "booking",
                taken: table.damage[index][index],
                onChange: (amount) => book(index, amount, true),
                onRebook: () => book(index, booking.offer ?? 0, false),
                offer: booking.offer,
                onDismiss: () => setBooking({ player: index, offer: undefined }),
            };
        }
        return {
            role: "target",
            player: booking.player + 1,
            reader: seating.seats[booking.player].seat,
            taken: table.damage[booking.player][index],
            offer: booking.offer,
            onChange: (amount) => book(index, amount, true),
            onRebook: () => book(index, booking.offer ?? 0, false),
        };
    }

    return (
        <div className={clsx("grid h-svh w-full gap-1.5 bg-zinc-950 p-2", seating.grid)}>
            {table.life.map((total, index) => (
                <LifeTile
                    key={index}
                    number={index + 1}
                    life={total}
                    delta={table.deltas[index]}
                    damage={table.damage[index]}
                    dealt={table.damage.map((row) => row[index])}
                    opponents={opponentOrder(seating.seats, index)}
                    placement={seating.seats[index]}
                    flush={seating.flush}
                    onChange={(amount) =>
                        setTable((current) => ({
                            ...current,
                            life: current.life.map((life, player) => (player === index ? life + amount : life)),
                            deltas: { ...current.deltas, [index]: (current.deltas[index] ?? 0) + amount },
                            hits: withHit(current.hits, index, trackHit(current.hits[index], amount, Date.now())),
                        }))
                    }
                    booking={bookingFor(index)}
                    onToggleBooking={() =>
                        setBooking((current) =>
                            current?.player === index
                                ? undefined
                                : { player: index, offer: rebookableHit(table.hits[index], Date.now()) },
                        )
                    }
                />
            ))}
        </div>
    );
}

createRoot(document.getElementById("root")!).render(<Probe />);
document.body.dataset.status = "ready";
