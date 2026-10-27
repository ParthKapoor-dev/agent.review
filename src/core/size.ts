// Card size estimate. The server lays out with these sizes and the card CSS clamps text to fit,
// so the two must agree: keep these in sync with the .card rules in web/styles.css.
// Cards carry a title and glyphs only; summaries live in the inspector. A change note gets one
// line, and only when the card has one in some variant.
import type { RNode } from "./types";

export const CARD_W = 272;
const PAD = 14;
const HEAD = 20; // icon + tag row
const GAP = 8;
const TITLE_LH = 21;
const TITLE_CH = 30; // chars per title line at 15.5px in 244px
const CHANGE = 8 + 18;
const FOOT = 8 + 20;

const lines = (s: string, perLine: number, max: number) => Math.min(max, Math.max(1, Math.ceil(s.length / perLine)));

export function cardHeight(n: Pick<RNode, "title" | "change">, hasChangeNote = !!n.change): number {
  return PAD + HEAD + GAP + lines(n.title, TITLE_CH, 3) * TITLE_LH + (hasChangeNote ? CHANGE : 0) + FOOT + PAD;
}
