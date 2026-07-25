import type { ReactNode } from "react";

/** Names of the inline SVG glyphs the app uses. */
export type IconName =
  | "cards"
  | "scan"
  | "layers"
  | "camera"
  | "image"
  | "search"
  | "check"
  | "spark"
  | "chevron"
  | "plus"
  | "close"
  | "bolt";

const iconPaths: Record<IconName, ReactNode> = {
  cards: <><rect x="5" y="4" width="12" height="16" rx="2"/><path d="m9 4 1-1h7a2 2 0 0 1 2 2v12l-2 1"/></>,
  scan: <><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><rect x="8" y="7" width="8" height="10" rx="1.5"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  camera: <><path d="M14.5 5 13 3h-2L9.5 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4.5Z"/><circle cx="12" cy="12" r="4"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 20"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  spark: <><path d="m12 3-1.4 4.1L6.5 8.5l4.1 1.4L12 14l1.4-4.1 4.1-1.4-4.1-1.4L12 3Z"/><path d="m5.5 14-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8-.8-2.2Z"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}
