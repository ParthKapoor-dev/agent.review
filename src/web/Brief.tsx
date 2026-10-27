// The left panel: what this review is, what is waiting on you, and what changed in the variant shown.
import type { Comparison } from "../core/resolve";
import type { Comment, Issue, RReview, RVariant, RView } from "../core/types";
import { Threads } from "./Comments";
import { Markdown } from "./Rich";
import { IssueList } from "./ReviewPage";
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
  const errors = p.issues.filter((i) => i.level === "error");
  const warnings = p.issues.filter((i) => i.level === "warning");

  return (
    <aside className="brief">
      <div className="brief-head">
        <span className="muted small">Brief</span>
        <span className="spacer" />
        {p.onTour && (
          <button className="primary small" onClick={p.onTour} title="t">
            ▶ Take the tour
          </button>
        )}
        <button className="icon-btn" onClick={p.onClose} title="Hide (b)">
          ⟨
        </button>
      </div>

      <Markdown text={p.review.summary} />

      {b && (
        <div className="board">
          {b.waiting?.length ? <Board title="Waiting on you" items={b.waiting} cls="waiting" /> : null}
          {b.pending?.length ? <Board title="In progress" items={b.pending} cls="pending" /> : null}
          {b.next?.length ? <Board title="Next" items={b.next} cls="next" /> : null}
          {b.done?.length ? <Board title="Done" items={b.done} cls="done" /> : null}
        </div>
      )}

      {p.review.links.length > 0 && (
        <div className="links">
          {p.review.links.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
              {l.label} ↗
            </a>
          ))}
        </div>
      )}

      {p.view && (
        <section>
          <h3>{p.view.title}</h3>
          <Markdown text={p.view.description} className="small" />
        </section>
      )}

      {p.target && (
        <section className={`variant-card k-${p.target.kind}`}>
          <div className="vc-head">
            <span className="vchip-dot" />
            <b>{p.target.label}</b>
            <span className="muted small">{KIND_LABEL[p.target.kind]}</span>
          </div>
          <Markdown text={p.target.summary} className="small" />
          {responds.length > 0 && (
            <div className="responds">
              <div className="muted small">Responds to your comments:</div>
              {responds.map((c) => (
                <div key={c.id} className={`resp ${c.status}`}>
                  <span className={`kind-pill kp-${c.kind}`}>{c.kind}</span> {c.text.slice(0, 140)}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {openQuestions.length > 0 && (
        <section>
          <h3>Decisions waiting on you</h3>
          <ul className="change-list">
            {openQuestions.map((n) => (
              <li key={n.id} onClick={() => p.onPick(n.id)} className="cl-question">
                <span className="cl-mark">?</span>
                <span>{n.title}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {p.against && (
        <section>
          <h3>
            Changes vs {p.against.label} <span className="muted small">({changes.length})</span>
          </h3>
          {changes.length === 0 && <div className="muted small">Nothing differs.</div>}
          <ul className="change-list">
            {changes.map(([id, s]) => {
              const n = nodeOf(id);
              return (
                <li key={id} onClick={() => p.onPick(id)} className={`cl-${s}`}>
                  <span className="cl-mark">{s === "added" ? "+" : s === "removed" ? "−" : "~"}</span>
                  <span>
                    {n?.title ?? id}
                    {n?.change && s !== "removed" && <div className="muted small">{n.change}</div>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {p.view && (
        <section>
          <h3>Comments on this view</h3>
          <Threads
            reviewKey={p.reviewKey}
            view={p.view.id}
            variant={p.target?.id}
            variantLabels={Object.fromEntries(p.view.variants.map((v) => [v.id, v.label]))}
            comments={p.comments.filter((c) => c.view === p.view!.id && !c.node)}
            onChanged={p.onChanged}
          />
        </section>
      )}

      {(errors.length > 0 || warnings.length > 0) && (
        <section>
          <h3>Problems in the agent's files</h3>
          <IssueList issues={[...errors, ...warnings]} />
        </section>
      )}
    </aside>
  );
}

function Board({ title, items, cls }: { title: string; items: string[]; cls: string }) {
  return (
    <div className={`board-col b-${cls}`}>
      <div className="board-title">{title}</div>
      <ul>
        {items.map((t, i) => (
          <li key={i}>
            <Markdown text={t} className="inline" />
          </li>
        ))}
      </ul>
    </div>
  );
}
