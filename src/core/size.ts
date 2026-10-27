// Card size estimate. The server lays out with these sizes and the card CSS clamps text to fit,
// so the two must agree: keep CARD_* in sync with .card styles in web/styles.css.
import type { RNode } from "./types";

export const CARD_W = 300;
const PAD = 12;
const TOP = 22; // badge row
const TITLE_LH = 20;
const TITLE_CH = 32; // chars per title line at 15px in 276px
const BODY_LH = 18;
const BODY_CH = 40;
const FOOT = 26;

const lines = (s: string | undefined, perLine: number, max: number) =>
  s ? Math.min(max, Math.max(1, Math.ceil(s.length / perLine))) : 0;

export function cardHeight(n: Pick<RNode, "title" | "summary" | "change">, hasChangeNote = !!n.change): number {
  let h = PAD + TOP + 4 + lines(n.title, TITLE_CH, 3) * TITLE_LH;
  if (n.summary) h += 6 + lines(n.summary, BODY_CH, 3) * BODY_LH;
  if (hasChangeNote) h += 8 + 2 * BODY_LH;
  return h + 6 + FOOT + PAD;
}

export const clampLines = { title: 3, summary: 3, change: 2 };
