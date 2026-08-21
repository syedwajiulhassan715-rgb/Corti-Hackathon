import { LEVEL_LABEL, LEVEL_TOKEN, type PriorityLevel } from "@/lib/api";

/**
 * The ladder rung, as a chip.
 *
 * Always renders the WORD as well as the colour. A ward has colour-blind staff,
 * screenshots lose hue, and a projector in a bright room flattens everything to
 * grey — a badge that only means something in colour means nothing in half the
 * places this will be looked at.
 */
export function LevelBadge({
  level,
  size = "md",
}: {
  level: PriorityLevel;
  size?: "sm" | "md";
}) {
  const token = LEVEL_TOKEN[level];
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase whitespace-nowrap",
        size === "sm" ? "text-micro px-2 py-0.5" : "text-micro px-2.5 py-1",
      ].join(" ")}
      style={{
        color: `var(--lvl-${token})`,
        borderColor: `color-mix(in srgb, var(--lvl-${token}) 45%, transparent)`,
        background: `color-mix(in srgb, var(--lvl-${token}) 9%, transparent)`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: `var(--lvl-${token})` }}
        aria-hidden
      />
      {LEVEL_LABEL[level]}
    </span>
  );
}
