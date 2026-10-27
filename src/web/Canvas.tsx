import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  Controls,
  MarkerType,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ChangeState, Comparison } from "../core/resolve";
import type { Comment, Mark, RNode, RVariant, RView } from "../core/types";
import { CardNode, FrameNode, type CardData, type FrameData } from "./Card";
import { markFor } from "./util";

export type CanvasHandle = { focusNode(id: string): void; fitFrame(id: string): void; fitAll(): void };

type Props = {
  view: RView;
  target: RVariant;
  against?: RVariant;
  cmp: Comparison;
  mode: "overlay" | "side";
  selected?: string;
  marks: Record<string, Mark>;
  comments: Comment[];
  onSelect(id: string | undefined): void;
};

const nodeTypes = { card: CardNode, frame: FrameNode };

type PaneSpec = {
  key: string;
  label?: string;
  variant: RVariant;
  states: Map<string, ChangeState>;
  edgeStates: Map<string, ChangeState>;
  ghosts?: RVariant; // removed cards/edges drawn from this variant
  compared: boolean;
};

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas(p, ref) {
  const instances = useRef<Record<string, ReactFlowInstance>>({});
  const [vp, setVp] = useState<Viewport>();
  const [zoom, setZoom] = useState(1);

  const panes: PaneSpec[] = useMemo(() => {
    if (p.mode === "side" && p.against) {
      const left = new Map<string, ChangeState>();
      for (const n of p.against.nodes) {
        const s = p.cmp.nodes.get(n.id);
        left.set(n.id, s === "removed" ? "removed" : s === "changed" ? "changed" : "same");
      }
      const leftE = new Map<string, ChangeState>();
      for (const e of p.against.edges) leftE.set(e.id, p.cmp.edges.get(e.id) === "removed" ? "removed" : "same");
      return [
        { key: "left", label: p.against.label, variant: p.against, states: left, edgeStates: leftE, compared: true },
        { key: "right", label: p.target.label, variant: p.target, states: p.cmp.nodes, edgeStates: p.cmp.edges, compared: true },
      ];
    }
    return [
      { key: "main", variant: p.target, states: p.cmp.nodes, edgeStates: p.cmp.edges, ghosts: p.against, compared: !!p.against },
    ];
  }, [p.mode, p.target, p.against, p.cmp]);

  const primary = () => instances.current.right ?? instances.current.main;

  useImperativeHandle(ref, () => ({
    focusNode(id) {
      const b = p.view.layout.nodes[id];
      const inst = primary();
      if (!b || !inst) return;
      const z = Math.max(inst.getZoom(), 0.9);
      void inst.setCenter(b.x + b.w / 2, b.y + b.h / 2, { zoom: z, duration: 350 });
    },
    fitFrame(id) {
      const b = p.view.layout.frames[id];
      if (b) void primary()?.fitBounds({ x: b.x, y: b.y, width: b.w, height: b.h }, { padding: 0.08, duration: 350 });
    },
    fitAll() {
      void primary()?.fitView({ padding: 0.08, duration: 350 });
    },
  }));

  const onMove = useCallback((_: unknown, v: Viewport) => {
    setVp(v);
    setZoom(v.zoom);
  }, []);

  return (
    <div className={`canvas ${p.mode === "side" ? "side" : ""} ${zoom < 0.45 ? "z-far" : zoom < 0.75 ? "z-mid" : ""}`}>
      {panes.map((pane) => (
        <div className="pane" key={pane.key}>
          {pane.label && <div className={`pane-label k-${pane.variant.kind}`}>{pane.label}</div>}
          <ReactFlowProvider>
            <Pane
              {...p}
              pane={pane}
              viewport={panes.length > 1 ? vp : undefined}
              onMove={onMove}
              onInit={(inst) => (instances.current[pane.key] = inst)}
            />
          </ReactFlowProvider>
        </div>
      ))}
    </div>
  );
});

function Pane(
  p: Props & {
    pane: PaneSpec;
    viewport?: Viewport;
    onMove(e: unknown, v: Viewport): void;
    onInit(inst: ReactFlowInstance): void;
  },
) {
  const { view, pane } = p;
  const vertical = view.direction === "down";

  const nodes: FlowNode[] = useMemo(() => {
    const out: FlowNode[] = view.frames.map((f, i) => {
      const b = view.layout.frames[f.id];
      return {
        id: `frame:${f.id}`,
        type: "frame",
        position: { x: b?.x ?? 0, y: b?.y ?? 0 },
        style: { width: b?.w, height: b?.h },
        data: { title: f.title, description: f.description, index: i + 1 } satisfies FrameData,
        selectable: false,
        draggable: false,
        focusable: false,
        zIndex: -1,
      };
    });
    const openByNode = new Map<string, number>();
    const allByNode = new Map<string, number>();
    for (const c of p.comments) {
      if (!c.node || c.parent) continue;
      allByNode.set(c.node, (allByNode.get(c.node) ?? 0) + 1);
      if (c.status === "open" && c.author === "reviewer") openByNode.set(c.node, (openByNode.get(c.node) ?? 0) + 1);
    }
    const add = (n: RNode, state: ChangeState, ghost: boolean) => {
      const b = view.layout.nodes[n.id];
      if (!b) return;
      out.push({
        id: n.id,
        type: "card",
        position: { x: b.x, y: b.y },
        style: { width: b.w, height: b.h },
        width: b.w,
        height: b.h,
        data: {
          n,
          state: pane.compared ? state : "same",
          ghost,
          vertical,
          mark: markFor(p.marks, view.id, n.id, p.target),
          open: openByNode.get(n.id) ?? 0,
          total: allByNode.get(n.id) ?? 0,
        } satisfies CardData,
        selected: n.id === p.selected,
        draggable: false,
      });
    };
    for (const n of pane.variant.nodes) add(n, pane.states.get(n.id) ?? "same", false);
    if (pane.ghosts) for (const n of pane.ghosts.nodes) if (pane.states.get(n.id) === "removed") add(n, "removed", true);
    return out;
  }, [view, pane, p.selected, p.marks, p.comments, p.target, vertical]);

  const edges: FlowEdge[] = useMemo(() => {
    const mk = (e: RVariant["edges"][number], state: ChangeState): FlowEdge => ({
      id: e.id,
      source: e.from,
      target: e.to,
      label: e.label,
      className: `e-${pane.compared ? state : "same"} ${e.style === "dashed" ? "e-dashed" : ""}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      selectable: false,
      focusable: false,
    });
    const out = pane.variant.edges.map((e) => mk(e, pane.edgeStates.get(e.id) ?? "same"));
    if (pane.ghosts) for (const e of pane.ghosts.edges) if (pane.edgeStates.get(e.id) === "removed") out.push(mk(e, "removed"));
    return out;
  }, [pane]);

  const controlled = p.viewport ? { viewport: p.viewport, onViewportChange: (v: Viewport) => p.onMove(null, v) } : {};

  // Open readable: fit everything if that stays legible, else start at the first frame.
  const onInit = (inst: ReactFlowInstance) => {
    p.onInit(inst);
    requestAnimationFrame(() => {
      const el = document.querySelector(".canvas .pane") as HTMLElement | null;
      const W = el?.clientWidth ?? 1000;
      const H = el?.clientHeight ?? 700;
      const boxes = [...Object.values(view.layout.frames), ...Object.values(view.layout.nodes)];
      if (!boxes.length) return;
      // Side by side: start at the first change, since that is what the mode is for.
      const firstChange = pane.compared && !pane.ghosts
        ? [...pane.states].filter(([, st]) => st !== "same").map(([id]) => view.layout.nodes[id]).filter(Boolean).sort((a, b) => a!.x - b!.x || a!.y - b!.y)[0]
        : undefined;
      const sel = (p.selected ? view.layout.nodes[p.selected] : undefined) ?? firstChange;
      if (sel) return void inst.setCenter(sel.x + sel.w / 2, sel.y + sel.h / 2, { zoom: 0.9 });
      const minX = Math.min(...boxes.map((b) => b.x));
      const minY = Math.min(...boxes.map((b) => b.y));
      const maxX = Math.max(...boxes.map((b) => b.x + b.w));
      const maxY = Math.max(...boxes.map((b) => b.y + b.h));
      const fit = Math.min((W * 0.92) / (maxX - minX), (H * 0.9) / (maxY - minY), 1);
      if (fit >= 0.62) return void inst.fitView({ padding: 0.06, maxZoom: 1 });
      const zoom = Math.min(0.85, (H * 0.9) / (maxY - minY));
      const vertical = view.direction === "down";
      void inst.setViewport(
        vertical
          ? { zoom, x: (W - (maxX - minX) * zoom) / 2 - minX * zoom, y: 32 - minY * zoom }
          : { zoom, x: 32 - minX * zoom, y: (H - (maxY - minY) * zoom) / 2 - minY * zoom },
      );
    });
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onInit={onInit}
      onMove={p.viewport ? undefined : p.onMove}
      {...controlled}
      onNodeClick={(_, n) => n.type === "card" && p.onSelect(n.id)}
      onPaneClick={() => p.onSelect(undefined)}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      panOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      selectionOnDrag={false}
      panOnDrag
      minZoom={0.08}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
      onlyRenderVisibleElements
    >
      <Background gap={24} size={1} />
      <MiniMap
        pannable
        zoomable
        nodeClassName={(n) => (n.type === "frame" ? "mm-frame" : `mm-${(n.data as CardData).state}`)}
        maskColor="var(--minimap-mask)"
      />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
