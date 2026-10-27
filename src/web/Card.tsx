import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ChangeState } from "../core/resolve";
import type { RNode } from "../core/types";
import { TYPE_LABEL } from "./util";

export type CardData = {
  n: RNode;
  state: ChangeState;
  ghost: boolean;
  vertical: boolean;
  mark: { state?: "seen" | "verified" | "flagged"; stale: boolean };
  open: number;
  total: number;
};

export type FrameData = { title: string; description?: string; index: number };

const STATE_BADGE: Record<ChangeState, string | null> = { added: "New", changed: "Changed", removed: "Removed", same: null };

function footText(n: RNode): string | undefined {
  const ref = n.refs?.[0];
  if (ref) return ref.path ?? ref.label ?? ref.url;
  if (n.type === "step" && n.code && typeof n.code === "object") return n.code.file ?? n.code.lang;
  if (n.type === "step" && n.inputs?.length)
    return `in: ${n.inputs.map((i) => (typeof i === "string" ? i : i.name)).join(", ")}`;
  if (n.type === "diff") return n.path;
  if (n.type === "test") {
    const one = (v: unknown) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v).replace(/"/g, ""));
    if (n.actual !== undefined && n.result === "fail") return `got ${one(n.actual)}`;
    return n.expected !== undefined ? `expects ${one(n.expected)}` : undefined;
  }
  if (n.type === "question") return `${n.options?.length ?? 0} options`;
  if (n.type === "unverified") return `${n.items.length} items`;
  if (n.type === "claim") return n.evidence?.length ? `${n.evidence.length} evidence` : "no evidence";
}

export const CardNode = memo(function CardNode({ data, selected }: NodeProps) {
  const d = data as CardData;
  const n = d.n;
  const badge = STATE_BADGE[d.state];
  const markIcon = d.mark.state === "verified" ? "✓" : d.mark.state === "flagged" ? "⚑" : d.mark.state === "seen" ? "◦" : "";
  const notRequested = n.tags?.some((t) => /not.?requested|out.?of.?scope/i.test(t));
  return (
    <div
      className={[
        "card",
        `t-${n.type}`,
        `st-${d.state}`,
        d.ghost ? "ghost" : "",
        selected ? "sel" : "",
        d.mark.state && !d.mark.stale ? `mk-${d.mark.state}` : "",
        n.type === "test" ? `res-${n.result}` : "",
      ].join(" ")}
    >
      <Handle type="target" position={d.vertical ? Position.Top : Position.Left} className="h" />
      <Handle type="source" position={d.vertical ? Position.Bottom : Position.Right} className="h" />
      <div className="card-top">
        <span className="type-badge">{(n.type === "step" && n.kind) || TYPE_LABEL[n.type]}</span>
        {n.type === "test" && <span className={`result r-${n.result}`}>{n.result}</span>}
        {n.type === "claim" && <span className={`conf c-${n.confidence}`}>{n.confidence}</span>}
        {badge && <span className={`state-badge sb-${d.state}`}>{badge}</span>}
        {notRequested && <span className="state-badge sb-scope">Not requested</span>}
        <span className="spacer" />
        {markIcon && (
          <span className={`mark-icon ${d.mark.stale ? "stale" : ""}`} title={d.mark.stale ? "Changed since you reviewed it" : d.mark.state}>
            {d.mark.stale ? "↻" : markIcon}
          </span>
        )}
      </div>
      <div className="card-title">{n.title}</div>
      {n.summary && <div className="card-sum">{n.summary}</div>}
      {n.change && d.state !== "same" && <div className="card-change">{n.change}</div>}
      {n.change && d.state === "same" && <div className="card-change quiet">{n.change}</div>}
      <div className="card-foot">
        <span className="foot-text">{footText(n)}</span>
        {d.total > 0 && (
          <span className={`ccount ${d.open ? "open" : ""}`} title={`${d.open} open of ${d.total} threads`}>
            💬 {d.open || d.total}
          </span>
        )}
      </div>
    </div>
  );
});

export const FrameNode = memo(function FrameNode({ data }: NodeProps) {
  const d = data as FrameData;
  return (
    <div className="frame">
      <div className="frame-head">
        <span className="frame-n">{d.index}</span>
        <span className="frame-title">{d.title}</span>
      </div>
      {d.description && <div className="frame-desc">{d.description}</div>}
    </div>
  );
});
