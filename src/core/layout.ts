// One layout for the union of every variant's nodes, so switching variants never moves a card.
// Frames become ELK compound nodes laid out left-to-right (or top-down) in their declared order.
import ELK, { type ElkNode, type ElkExtendedEdge } from "elkjs/lib/elk-api.js";
import type { Box, RVariant } from "./types";
import type { View } from "./schema";
import { CARD_W, cardHeight } from "./size";

// Bun defines `self`, so elk's worker script thinks it is inside a Web Worker and exports nothing.
// Hide `self` while loading it to get the in-process FakeWorker.
function inProcessWorker() {
  const g = globalThis as { self?: unknown };
  const saved = g.self;
  delete g.self;
  try {
    return require("elkjs/lib/elk-worker.min.js").Worker;
  } finally {
    g.self = saved;
  }
}
const FakeWorker = inProcessWorker();
const elk = new ELK({ workerFactory: (url?: string) => new FakeWorker(url) });
const OTHER = "__other";

export async function layoutView(
  view: Pick<View, "frames" | "direction">,
  variants: RVariant[],
): Promise<{ nodes: Record<string, Box>; frames: Record<string, Box> }> {
  // Union: later variants win for the node's frame; height is the max over variants.
  const union = new Map<string, { frame?: string; h: number }>();
  const edges = new Map<string, { from: string; to: string }>();
  for (const v of variants) {
    for (const n of v.nodes) {
      const prev = union.get(n.id);
      const h = cardHeight(n, variants.some((x) => x.nodes.some((m) => m.id === n.id && m.change)));
      union.set(n.id, { frame: n.frame ?? prev?.frame, h: Math.max(h, prev?.h ?? 0) });
    }
    for (const e of v.edges) edges.set(e.id, { from: e.from, to: e.to });
  }

  const dir = view.direction === "down" ? "DOWN" : "RIGHT";
  const frameIds = view.frames.map((f) => f.id);
  const known = new Set(frameIds);
  const useFrames = frameIds.length > 0;
  if (useFrames && [...union.values()].some((n) => !n.frame || !known.has(n.frame))) frameIds.push(OTHER);

  const leaf = (id: string, h: number): ElkNode => ({ id, width: CARD_W, height: h });
  const elkEdges: ElkExtendedEdge[] = [...edges].map(([id, e]) => ({ id, sources: [e.from], targets: [e.to] }));

  const graph: ElkNode = useFrames
    ? {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": dir,
          "elk.hierarchyHandling": "INCLUDE_CHILDREN",
          "elk.partitioning.activate": "true",
          "elk.spacing.nodeNode": "40",
          "elk.layered.spacing.nodeNodeBetweenLayers": "90",
          "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        },
        children: frameIds.map((fid, i) => ({
          id: `frame:${fid}`,
          layoutOptions: {
            "elk.partitioning.partition": String(i),
            "elk.padding": "[top=64,left=24,bottom=24,right=24]",
            "elk.spacing.nodeNode": "20",
            "elk.layered.spacing.nodeNodeBetweenLayers": "70",
          },
          children: [...union]
            .filter(([, n]) => (n.frame && known.has(n.frame) ? n.frame : OTHER) === fid)
            .map(([id, n]) => leaf(id, n.h)),
        })),
        edges: elkEdges,
      }
    : {
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": dir,
          "elk.spacing.nodeNode": "36",
          "elk.layered.spacing.nodeNodeBetweenLayers": "90",
          "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        },
        children: [...union].map(([id, n]) => leaf(id, n.h)),
        edges: elkEdges,
      };

  // ELK rejects an empty compound node; give it a placeholder size instead.
  for (const c of graph.children ?? []) if (c.children && c.children.length === 0) {
    delete c.children;
    c.width = CARD_W + 48;
    c.height = 120;
  }

  const out = await elk.layout(graph);
  const nodes: Record<string, Box> = {};
  const frames: Record<string, Box> = {};
  const walk = (n: ElkNode, ox: number, oy: number) => {
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0);
      const y = oy + (c.y ?? 0);
      const box = { x, y, w: c.width ?? 0, h: c.height ?? 0 };
      if (c.id.startsWith("frame:")) {
        frames[c.id.slice(6)] = box;
        walk(c, x, y);
      } else nodes[c.id] = box;
    }
  };
  walk(out, 0, 0);
  // Frames read as columns (or rows): give them a shared top edge and the same depth.
  const fs = Object.values(frames);
  if (fs.length) {
    const across = dir === "RIGHT" ? (["y", "h"] as const) : (["x", "w"] as const);
    const [pos, len] = across;
    const lo = Math.min(...fs.map((b) => b[pos]));
    const hi = Math.max(...fs.map((b) => b[pos] + b[len]));
    for (const b of fs) {
      b[pos] = lo;
      b[len] = hi - lo;
    }
  }
  return { nodes, frames };
}
