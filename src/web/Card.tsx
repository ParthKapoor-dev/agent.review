import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Check, Flag, Eye, RotateCcw, MessageSquare, X, CircleDashed, Ban } from "lucide-react";
import type { ChangeState } from "../core/resolve";
import type { RNode } from "../core/types";
import { TypeIcon } from "./Icon";
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

const STATE_WORD: Record<ChangeState, string | null> = { added: "new", changed: "changed", removed: "removed", same: null };

/** A short tag next to the icon: the step's kind, or nothing (the icon already says the type). */
const tagOf = (n: RNode) => (n.type === "step" && n.kind ? n.kind : n.type === "diff" && n.path ? n.path.split("/").pop() : undefined);

function Signals({ n }: { n: RNode }) {
  switch (n.type) {
    case "test":
      return n.result === "pass" ? (
        <span className="sig ok"><Check size={12} strokeWidth={2.5} /> pass</span>
      ) : n.result === "fail" ? (
        <span className="sig bad"><X size={12} strokeWidth={2.5} /> fail</span>
      ) : (
        <span className="sig dim"><CircleDashed size={12} /> {n.result === "skip" ? "skipped" : "not run"}</span>
      );
    case "claim":
      return <span className={`sig conf-${n.confidence}`}><i className="dot" /> {n.confidence}</span>;
    case "question":
      return <span className="sig dim">{(n.options ?? []).map((_, i) => String.fromCharCode(65 + i)).join(" · ") || "open"}</span>;
    case "unverified":
      return <span className="sig warn">{n.items.length} unchecked</span>;
    default:
      return null;
  }
}

export const CardNode = memo(function CardNode({ data, selected }: NodeProps) {
  const d = data as CardData;
  const n = d.n;
  const word = STATE_WORD[d.state];
  const notRequested = n.tags?.some((t) => /not.?requested|out.?of.?scope/i.test(t));
  const tag = tagOf(n);
  const mark = d.mark.state && !d.mark.stale ? d.mark.state : undefined;
  const tip = [n.summary, n.change && `Change: ${n.change}`].filter(Boolean).join("\n\n");
  return (
    <div
      title={tip || undefined}
      className={[
        "card",
        `t-${n.type}`,
        `st-${d.state}`,
        d.ghost ? "ghost" : "",
        selected ? "sel" : "",
        mark ? `mk-${mark}` : "",
        n.type === "test" ? `res-${n.result}` : "",
        notRequested ? "scope" : "",
      ].join(" ")}
    >
      <Handle type="target" position={d.vertical ? Position.Top : Position.Left} className="h" />
      <Handle type="source" position={d.vertical ? Position.Bottom : Position.Right} className="h" />
      <div className="card-head">
        <TypeIcon type={n.type} />
        <span className="card-tag">{tag ?? TYPE_LABEL[n.type]}</span>
        <span className="spacer" />
        {word && <span className={`state s-${d.state}`}>{word}</span>}
      </div>
      <div className="card-title">{n.title}</div>
      {n.change && d.state !== "same" && <div className="card-change">{n.change}</div>}
      <div className="card-foot">
        <Signals n={n} />
        {notRequested && (
          <span className="sig scope" title="Not requested">
            <Ban size={12} /> not asked
          </span>
        )}
        <span className="spacer" />
        {d.total > 0 && (
          <span className={`sig ${d.open ? "warn" : "dim"}`} title={`${d.open} open of ${d.total}`}>
            <MessageSquare size={12} /> {d.open || d.total}
          </span>
        )}
        {d.mark.stale ? (
          <span className="mark stale" title="Changed since you reviewed it"><RotateCcw size={13} /></span>
        ) : mark === "verified" ? (
          <span className="mark verified" title="Verified"><Check size={14} strokeWidth={2.5} /></span>
        ) : mark === "flagged" ? (
          <span className="mark flagged" title="Flagged"><Flag size={13} /></span>
        ) : mark === "seen" ? (
          <span className="mark seen" title="Seen"><Eye size={13} /></span>
        ) : null}
      </div>
    </div>
  );
});

export const FrameNode = memo(function FrameNode({ data }: NodeProps) {
  const d = data as FrameData;
  return (
    <div className="frame" title={d.description}>
      <div className="frame-head">
        <span className="frame-n">{String(d.index).padStart(2, "0")}</span>
        <span className="frame-title">{d.title}</span>
      </div>
    </div>
  );
});
