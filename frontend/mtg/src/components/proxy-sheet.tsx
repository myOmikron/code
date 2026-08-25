import clsx from "clsx";
import { CARD, GRID, MARGIN, SHEET } from "src/utils/proxy-print";
import type { ProxyFace } from "src/utils/proxy-print";

/** What every sheet says it came from */
const MARK = "planarium.app";

/** How far the mark sits from the top edge, in millimetres */
const MARK_TOP = 6;

/**
 * The properties for {@link ProxySheet}
 */
export type ProxySheetProps = {
    /** What goes on this sheet, at most one grid's worth */
    faces: Array<ProxyFace>;
    /** Whether a hairline is drawn around each card to cut along */
    cutLines: boolean;
    /**
     * `paper` measures everything in millimetres, which is what makes a cut
     * proxy the size of the card it stands in for. `screen` gives up the
     * millimetres for shares of the sheet, so the preview fits whatever width
     * it is handed and still shows exactly what comes out of the printer.
     */
    mode: "paper" | "screen";
};

/**
 * One sheet of A4, filled with cards.
 *
 * @returns the sheet
 */
export function ProxySheet({ faces, cutLines, mode }: ProxySheetProps) {
    const paper = mode === "paper";

    return (
        <div
            className={clsx(
                "relative bg-white",
                paper
                    ? "break-after-page"
                    : "aspect-[210/297] w-full shadow-(--shadow-card-md) ring-1 ring-zinc-950/10",
            )}
            style={
                paper
                    ? {
                          width: `${SHEET.width}mm`,
                          height: `${SHEET.height}mm`,
                          padding: `${MARGIN.y}mm ${MARGIN.x}mm`,
                          // The paper is white and the cards are not: without
                          // this a browser drops every background it thinks it
                          // can save ink on, and the sheet comes out blank.
                          printColorAdjust: "exact",
                          WebkitPrintColorAdjust: "exact",
                      }
                    : {
                          // Both figures are shares of the sheet's width, which
                          // is what a percentage padding resolves against, the
                          // vertical one included.
                          padding: `${(MARGIN.y / SHEET.width) * 100}% ${(MARGIN.x / SHEET.width) * 100}%`,
                          // Lets the mark be sized against the sheet rather than
                          // against the page, so it shrinks with the preview.
                          containerType: "inline-size",
                      }
            }
        >
            {/* Parked in the margin above the grid rather than laid out with
                it: a card has to stay 63 by 88 millimetres, and a line of text
                that pushed the grid down would cost it. */}
            <span
                className={"absolute text-black/45"}
                style={
                    paper
                        ? { top: `${MARK_TOP}mm`, left: `${MARGIN.x}mm`, fontSize: "3mm" }
                        : {
                              top: `${(MARK_TOP / SHEET.height) * 100}%`,
                              left: `${(MARGIN.x / SHEET.width) * 100}%`,
                              fontSize: "1.5cqw",
                          }
                }
            >
                {MARK}
            </span>

            <div className={"grid"} style={{ gridTemplateColumns: `repeat(${GRID.columns}, 1fr)`, gap: 0 }}>
                {faces.map((face) => (
                    <img
                        key={face.key}
                        src={face.image}
                        alt={face.name}
                        className={clsx("object-cover", cutLines && "outline outline-black/40")}
                        style={
                            paper
                                ? { width: `${CARD.width}mm`, height: `${CARD.height}mm` }
                                : { width: "100%", aspectRatio: `${CARD.width} / ${CARD.height}` }
                        }
                    />
                ))}
            </div>
        </div>
    );
}
