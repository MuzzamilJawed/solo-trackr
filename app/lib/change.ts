// A 0.00% move is "no change", not a gain: it must not get a green up-arrow.

export type Direction = "up" | "down" | "flat";

/**
 * Direction of a change. It is "flat" when the value would DISPLAY as zero at the
 * given number of decimals (default 2: |v| < 0.005; 1 decimal: |v| < 0.05).
 */
export const direction = (v: number | null | undefined, decimals = 2): Direction =>
  v == null || !Number.isFinite(v) || Math.abs(v) < 0.5 * 10 ** -decimals ? "flat" : v > 0 ? "up" : "down";

export const ARROW: Record<Direction, string> = { up: "↑", down: "↓", flat: "–" };
export const TRI: Record<Direction, string> = { up: "▲", down: "▼", flat: "–" };

/** Text colour classes (light + dark). */
export const TEXT: Record<Direction, string> = {
  up: "text-green-600 dark:text-green-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-zinc-500 dark:text-zinc-400",
};

/** Pill (background + text) classes. */
export const PILL: Record<Direction, string> = {
  up: "bg-green-500/10 text-green-600 dark:text-green-400",
  down: "bg-red-500/10 text-red-600 dark:text-red-400",
  flat: "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
};
