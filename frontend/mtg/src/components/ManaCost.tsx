// Tailwind resolves class names statically, so the per-colour background has to be a lookup of
// complete class strings rather than an interpolated `bg-mana-${symbol}`.
const MANA_COLOURS: Record<string, string> = {
  w: "bg-[#f1e7bc]",
  u: "bg-[#8ec8e6]",
  b: "bg-[#9c9996]",
  r: "bg-[#e98c6a]",
  g: "bg-[#80b78a]",
};

/** Renders a mana cost string like "{1}{U}" as coloured pips. */
export function ManaCost({ value }: { value: string }) {
  const symbols = value.match(/\{([^}]+)\}/g)?.map((symbol) => symbol.slice(1, -1)) ?? [];
  return (
    <span className="flex shrink-0 gap-0.5">
      {symbols.map((symbol, index) => (
        <span
          key={`${symbol}-${index}`}
          className={`grid size-4 place-items-center rounded-full border border-white/25 text-[8px] font-black text-[#151611] shadow-[inset_0_0_4px_rgba(0,0,0,.25)] ${MANA_COLOURS[symbol.toLowerCase()] ?? "bg-[#c8c9c2]"}`}
        >
          {symbol}
        </span>
      ))}
    </span>
  );
}
