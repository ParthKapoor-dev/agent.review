// One place that maps card types and states to icons, so the canvas can say with a glyph what it
// used to say with a word.
import {
  StickyNote, SquareFunction, GitCompareArrows, FlaskConical, Signpost, BadgeCheck, EyeOff, Network, Table2,
  Image as ImageIcon, type LucideIcon,
} from "lucide-react";
import type { RNode } from "../core/types";

export const TYPE_ICON: Record<RNode["type"], LucideIcon> = {
  note: StickyNote,
  step: SquareFunction,
  diff: GitCompareArrows,
  test: FlaskConical,
  question: Signpost,
  claim: BadgeCheck,
  unverified: EyeOff,
  diagram: Network,
  table: Table2,
  image: ImageIcon,
};

export function TypeIcon({ type, size = 14 }: { type: RNode["type"]; size?: number }) {
  const I = TYPE_ICON[type];
  return <I size={size} strokeWidth={1.75} className={`ti ti-${type}`} aria-hidden />;
}
