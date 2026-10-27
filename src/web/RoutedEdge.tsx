// Draws an edge along the route ELK computed (orthogonal, around cards), with rounded corners.
// Falls back to React Flow's bezier when there is no route.
import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { Point } from "../core/types";

const R = 10;

function roundedPath(pts: Point[]) {
  let d = `M ${pts[0]!.x} ${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1]!, pts[i]!, pts[i + 1]!];
    const r = Math.min(R, Math.hypot(b.x - a.x, b.y - a.y) / 2, Math.hypot(c.x - b.x, c.y - b.y) / 2);
    const p1 = { x: b.x - Math.sign(b.x - a.x) * r, y: b.y - Math.sign(b.y - a.y) * r };
    const p2 = { x: b.x + Math.sign(c.x - b.x) * r, y: b.y + Math.sign(c.y - b.y) * r };
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`;
  }
  const last = pts.at(-1)!;
  return `${d} L ${last.x} ${last.y}`;
}

/** Label on the middle of the longest segment, where it is least likely to sit on a corner. */
function labelAt(pts: Point[]) {
  let best = 0;
  let len = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
    if (l > len) [len, best] = [l, i];
  }
  return { x: (pts[best]!.x + pts[best + 1]!.x) / 2, y: (pts[best]!.y + pts[best + 1]!.y) / 2 };
}

export const RoutedEdge = memo(function RoutedEdge(p: EdgeProps) {
  const pts = (p.data as { points?: Point[] } | undefined)?.points;
  const common = { id: p.id, markerEnd: p.markerEnd, label: p.label, labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 4 };
  if (pts && pts.length >= 2) {
    const at = labelAt(pts);
    return <BaseEdge {...common} path={roundedPath(pts)} labelX={at.x} labelY={at.y} />;
  }
  const [path, lx, ly] = getBezierPath(p);
  return <BaseEdge {...common} path={path} labelX={lx} labelY={ly} />;
});
