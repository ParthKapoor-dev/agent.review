import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { Markdown } from "./Rich";
import type { Comment, CommentKind } from "../core/types";

const KINDS: { id: CommentKind; label: string; hint: string }[] = [
  { id: "question", label: "Question", hint: "You want an answer before deciding" },
  { id: "blocking", label: "Must fix", hint: "Blocks approval" },
  { id: "suggestion", label: "Suggestion", hint: "Worth doing, not blocking" },
  { id: "nit", label: "Nit", hint: "Small thing" },
  { id: "note", label: "Note", hint: "For the record" },
];

const when = (ts: string) => new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export function Threads(p: {
  reviewKey: string;
  view: string;
  node?: string;
  variant?: string;
  variantLabels?: Record<string, string>;
  comments: Comment[];
  composeTick?: number;
  onChanged(): void;
}) {
  const roots = p.comments.filter((c) => !c.parent && c.kind !== "answer" && c.kind !== "verdict");
  const [showResolved, setShowResolved] = useState(false);
  const shown = roots.filter((r) => showResolved || r.status === "open");
  const hidden = roots.length - shown.length;
  return (
    <div className="threads">
      {shown.map((r) => (
        <Thread key={r.id} {...p} root={r} replies={p.comments.filter((c) => c.parent === r.id)} />
      ))}
      {hidden > 0 && (
        <button className="link" onClick={() => setShowResolved(true)}>
          Show {hidden} resolved
        </button>
      )}
      <Composer {...p} />
    </div>
  );
}

function Thread(p: Parameters<typeof Threads>[0] & { root: Comment; replies: Comment[] }) {
  const [replying, setReplying] = useState(false);
  const r = p.root;
  return (
    <div className={`thread k-${r.kind} ${r.status}`}>
      <div className="th-head">
        <span className={`kind-pill kp-${r.kind}`}>{KINDS.find((k) => k.id === r.kind)?.label ?? r.kind}</span>
        {r.variant && <span className="muted small">on {p.variantLabels?.[r.variant] ?? r.variant}</span>}
        <span className="spacer" />
        <span className="muted small">{when(r.ts)}</span>
      </div>
      <Markdown text={r.text} />
      {p.replies.map((c) => (
        <div key={c.id} className={`reply by-${c.author}`}>
          <span className="who">{c.author === "agent" ? "Agent" : "You"}</span>
          <Markdown text={c.text} />
        </div>
      ))}
      <div className="th-actions">
        <button className="link" onClick={() => setReplying((x) => !x)}>
          Reply
        </button>
        <button
          className="link"
          onClick={async () => {
            await api.setStatus(p.reviewKey, r.id, r.status === "open" ? "resolved" : "open");
            p.onChanged();
          }}
        >
          {r.status === "open" ? "Resolve" : "Reopen"}
        </button>
        {r.deliveredAt && <span className="seen" title={`Handed to the agent ${when(r.deliveredAt)}`}>seen by agent</span>}
        <span className="muted small mono" title="Thread id, for the agent">{r.id}</span>
      </div>
      {replying && <Composer {...p} parent={r.id} onDone={() => setReplying(false)} />}
    </div>
  );
}

function Composer(p: Parameters<typeof Threads>[0] & { parent?: string; onDone?(): void }) {
  const [text, setText] = useState("");
  const [kind, setKind] = useState<CommentKind>("question");
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (p.composeTick && !p.parent) ta.current?.focus();
  }, [p.composeTick]);
  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await api.comment(p.reviewKey, { view: p.view, node: p.node, variant: p.variant, kind: p.parent ? "note" : kind, text, parent: p.parent });
      setText("");
      p.onChanged();
      p.onDone?.();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="composer">
      <textarea
        ref={ta}
        value={text}
        placeholder={p.parent ? "Reply…" : "Comment for the agent…  (⌘/Ctrl+Enter to send)"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
        }}
        rows={p.parent ? 2 : 3}
      />
      <div className="composer-row">
        {!p.parent && (
          <div className="kinds">
            {KINDS.map((k) => (
              <button key={k.id} className={`kind-pill kp-${k.id} ${kind === k.id ? "on" : ""}`} onClick={() => setKind(k.id)} title={k.hint}>
                {k.label}
              </button>
            ))}
          </div>
        )}
        <span className="spacer" />
        <button className="primary" disabled={!text.trim() || busy} onClick={submit}>
          {p.parent ? "Reply" : "Comment"}
        </button>
      </div>
    </div>
  );
}
