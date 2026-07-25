/** Renders a mana cost string like "{1}{U}" as coloured pips. */
export function ManaCost({ value }: { value: string }) {
  const symbols = value.match(/\{([^}]+)\}/g)?.map((symbol) => symbol.slice(1, -1)) ?? [];
  return <span className="mana-cost">{symbols.map((symbol, index) => <span key={`${symbol}-${index}`} className={`mana mana-${symbol.toLowerCase()}`}>{symbol}</span>)}</span>;
}
