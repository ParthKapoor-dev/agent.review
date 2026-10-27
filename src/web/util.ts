import type { Box, Mark, RNode, RVariant } from "../core/types";

export const KIND_LABEL: Record<RVariant["kind"], string> = {
  current: "Current (what runs today)",
  proposed: "Proposed (the plan)",
  actual: "Actual (what was built)",
  iteration: "Iteration (after review)",
  alternative: "Alternative (an option)",
};

export const TYPE_LABEL: Record<RNode["type"], string> = {
  note: "Note",
  step: "Step",
  diff: "Diff",
  test: "Test",
  question: "Decision",
  claim: "Claim",
  unverified: "Not checked",
  diagram: "Diagram",
  table: "Table",
  image: "Image",
};

export const CONFIDENCE_LABEL = {
  checked: "Checked by running it",
  read: "Read the source, not run",
  inferred: "Inferred, not checked",
  unknown: "No source",
} as const;

/** A mark only counts if it was made on the same content the card shows now. */
export function markFor(marks: Record<string, Mark>, view: string, node: string, target: RVariant) {
  const m = marks[`${view}/${node}`];
  const n = target.nodes.find((x) => x.id === node);
  if (!m) return { state: undefined, stale: false } as const;
  return { state: m.state, stale: !!n && m.hash !== n.hash, variant: m.variant } as const;
}

export type Dir = "left" | "right" | "up" | "down";

/** Spatial navigation: the nearest visible card in a direction, favouring cards in line. */
export function nextInDirection(boxes: Record<string, Box>, visible: Set<string>, from: string | undefined, dir: Dir) {
  const ids = [...visible].filter((id) => boxes[id]);
  if (!ids.length) return;
  const c = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  if (!from || !boxes[from]) {
    return ids.sort((a, b) => boxes[a]!.x - boxes[b]!.x || boxes[a]!.y - boxes[b]!.y)[0];
  }
  const o = c(boxes[from]!);
  let best: string | undefined;
  let bestScore = Infinity;
  for (const id of ids) {
    if (id === from) continue;
    const p = c(boxes[id]!);
    const dx = p.x - o.x;
    const dy = p.y - o.y;
    const [main, cross] = dir === "left" ? [-dx, dy] : dir === "right" ? [dx, dy] : dir === "up" ? [-dy, dx] : [dy, dx];
    if (main <= 8) continue;
    const score = main + Math.abs(cross) * 2.5;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/** Best-effort display of test inputs / expected / actual values. */
export const show = (v: unknown) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v, null, 2));

export const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
