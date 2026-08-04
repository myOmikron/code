import type { CardQuad } from "../scanClient";

/** Format a EUR amount in German locale. */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

/** SVG polygon `points` string for a quad, clockwise from the top-left. */
export function quadPoints(quad: CardQuad): string {
  return [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft].map((p) => `${p.x},${p.y}`).join(" ");
}
