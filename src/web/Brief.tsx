// The left panel: what needs you first, then the story in brief, then what changed. Everything
// past the first screen is folded away until asked for.
import { useState, type ReactNode } from "react";
import { ChevronRight, Play, Hand, Link2, Check, X } from "lucide-react";
import type { Comparison } from "../core/resolve";
import type { Comment, Issue, RReview, RVariant, RView } from "../core/types";
import { api } from "./api";
import { Threads } from "./Comments";
import { Markdown } from "./Rich";
import { IssueList } from "./ReviewPage";
import { TypeIcon } from "./Icon";
import { KIND_LABEL } from "./util";

type Props = {
  review: RReview;
  view?: RView;
  target?: RVariant;
  against?: RVariant;
  cmp?: Comparison;
  comments: Comment[];
  issues: Issue[];
  reviewKey: string;
  onPick(id: string): void;
  onTour?: () => void;
  onClose(): void;
  onChanged(): void;
};

export function Brief(p: Props) {
  const b = p.review.board;
  const changes = p.cmp && p.against ? [...p.cmp.nodes].filter(([, s]) => s !== "same") : [];
  const nodeOf = (id: string) => p.target?.nodes.find((n) => n.id === id) ?? p.against?.nodes.find((n) => n.id === id);
  const responds = (p.target?.respondsTo ?? []).map((id) => p.comments.find((c) => c.id === id)).filter(Boolean) as Comment[];
  const openQuestions =
    p.target?.nodes.filter((n) => n.type === "question" && !p.comments.some((c) => c.node === n.id && c.kind === "answer" && c.view === p.view?.id)) ?? [];
  const viewComments = p.view ? p.comments.filter((c) => c.view === p.view!.id && !c.node && !c.parent && c.kind !== "verdict") : [];
  const problems = p.issues.length;

  return (
    <aside className="brief">
      {b?.waiting?.length ? (
        <section className="needs">
          <div className="eyebrow">
            <Hand size={13} /> Needs you
          </div>
          <ul>
            {b.waiting.map((t, i) => (
              <li key={i}>
                <Markdown text={t} className="inline" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Summary text={p.review.summary} />

      <div className="brief-actions">
        {p.onTour && (
          <button className="pill-btn" onClick={p.onTour} title="t">
            <Play size={12} fill="currentColor" /> Tour · {p.review.tour.length}
          </button>
        )}
        {p.review.links.map((l) => (
          <a key={l.url} className="pill-btn ghost" href={l.url} target="_blank" rel="noreferrer" title={l.label}>
            <Link2 size={12} /> {l.label}
          </a>
        ))}
      </div>

      {b && (b.done?.length || b.pending?.length || b.next?.length) ? (
        <Fold
          title={
            <span className="board-counts">
              {b.done?.length ? <span><b>{b.done.length}</b> done</span> : null}
              {b.pending?.length ? <span><b>{b.pending.length}</b> in progress</span> : null}
              {b.next?.length ? <span><b>{b.next.length}</b> next</span> : null}
            </span>
          }
        >
          {(["pending", "next", "done"] as const).map((k) =>
            b[k]?.length ? (
              <div key={k} className="board-list">
                <div className="eyebrow">{k === "pending" ? "In progress" : k}</div>
                <ul>
                  {b[k]!.map((t, i) => (
                    <li key={i}>
                      <Markdown text={t} className="inline" />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </Fold>
      ) : null}

      {p.target && (
        <section className={`variant-card k-${p.target.kind}`}>
          <div className="vc-head">
            <span className="vc-dot" />
            <b>{p.target.label}</b>
            <span className="muted small">{KIND_LABEL[p.target.kind].split(" (")[0]}</span>
          </div>
          {p.target.summary && <Markdown text={p.target.summary} className="small clamp-2" />}
          {responds.length > 0 && (
            <div className="responds small">
              Answers {responds.length} of your comment{responds.length > 1 ? "s" : ""}
            </div>
          )}
          {p.view && <Verdict {...p} view={p.view} target={p.target} />}
        </section>
      )}

      {openQuestions.length > 0 && (
        <section>
          <div className="eyebrow">Decide · {openQuestions.length}</div>
          <ul className="rows">
            {openQuestions.map((n) => (
              <li key={n.id} onClick={() => p.onPick(n.id)}>
                <TypeIcon type="question" size={13} />
                <span>{n.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.against && (
        <section>
          <div className="eyebrow">
            vs {p.against.label} · {changes.length || "no"} change{changes.length === 1 ? "" : "s"}
          </div>
          <ul className="rows">
            {changes.map(([id, s]) => (
              <li key={id} onClick={() => p.onPick(id)} className={`r-${s}`} title={nodeOf(id)?.change}>
                <span className="glyph">{s === "added" ? "+" : s === "removed" ? "−" : "~"}</span>
                <span>{nodeOf(id)?.title ?? id}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.view && (
        <Fold title={<span>Comments on this view{viewComments.length ? ` · ${viewComments.length}` : ""}</span>}>
          <Threads
            reviewKey={p.reviewKey}
            view={p.view.id}
            variant={p.target?.id}
            variantLabels={Object.fromEntries(p.view.variants.map((v) => [v.id, v.label]))}
            comments={p.comments.filter((c) => c.view === p.view!.id && !c.node)}
            onChanged={p.onChanged}
          />
        </Fold>
      )}

      {problems > 0 && (
        <Fold title={<span className="warn-text">{problems} problem{problems > 1 ? "s" : ""} in the agent's files</span>}>
          <IssueList issues={p.issues} />
        </Fold>
      )}
    </aside>
  );
}

/** First paragraph only, with the rest one click away. */
function Summary({ text }: { text?: string }) {
  const [more, setMore] = useState(false);
  if (!text) return null;
  const paras = text.split(/\n\s*\n/);
  const long = paras.length > 1 || text.length > 260;
  return (
    <div className={`summary ${more ? "" : "short"}`}>
      <Markdown text={more ? text : paras[0]} />
      {long && (
        <button className="link" onClick={() => setMore((m) => !m)}>
          {more ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

function Fold({ title, children }: { title: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`fold ${open ? "open" : ""}`}>
      <button className="fold-head" onClick={() => setOpen((o) => !o)}>
        <ChevronRight size={14} className="chev" />
        {title}
      </button>
      {open && <div className="fold-body">{children}</div>}
    </section>
  );
}

/** Approve or request changes on the variant shown. The agent reads it as a "verdict" comment. */
function Verdict(p: Props & { view: RView; target: RVariant }) {
  const mine = p.comments
    .filter((c) => c.kind === "verdict" && c.view === p.view.id && c.variant === p.target.id)
    .sort((a, b) => a.ts.localeCompare(b.ts))
    .at(-1);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState<"approve" | "changes" | null>(null);
  const send = async (choice: "approve" | "changes") => {
    await api.comment(p.reviewKey, { view: p.view.id, variant: p.target.id, kind: "verdict", choice, text: note });
    setNote("");
    setOpen(null);
    p.onChanged();
  };
  if (open)
    return (
      <div className="verdict">
        <textarea
          autoFocus
          rows={2}
          placeholder={open === "approve" ? "Anything to add? (optional)" : "What needs to change?"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="row">
          <button className="link" onClick={() => setOpen(null)}>Cancel</button>
          <span className="spacer" />
          <button className={`btn ${open === "changes" ? "danger" : "ok"}`} disabled={open === "changes" && !note.trim()} onClick={() => send(open)}>
            {open === "approve" ? "Approve" : "Request changes"}
          </button>
        </div>
      </div>
    );
  return (
    <div className="verdict">
      {mine && (
        <div className={`verdict-state v-${mine.choice}`}>
          {mine.choice === "approve" ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}
          {mine.choice === "approve" ? "Approved" : "Changes requested"}
        </div>
      )}
      <div className="verdict-btns">
        <button className="vbtn ok" onClick={() => setOpen("approve")}>
          <Check size={13} strokeWidth={2.5} /> Approve
        </button>
        <button className="vbtn no" onClick={() => setOpen("changes")}>
          <X size={13} strokeWidth={2.5} /> Changes
        </button>
      </div>
    </div>
  );
}
