import { useState } from "react";
import type { ChangeState } from "../core/resolve";
import type { Comment, MarkState, RNode, RVariant, RView } from "../core/types";
import { api } from "./api";
import { Threads } from "./Comments";
import { CodeBlock, CodeDiff, CopyText, Markdown, Mermaid, PatchView, codeOf } from "./Rich";
import { CONFIDENCE_LABEL, TYPE_LABEL, sameValue, show } from "./util";

type Props = {
  reviewKey: string;
  view: RView;
  node: RNode;
  target: RVariant;
  against?: RVariant;
  state: ChangeState;
  mark: { state?: MarkState; stale: boolean; variant?: string };
  comments: Comment[];
  composeTick: number;
  onMark(s: MarkState | null): void;
  onClose(): void;
  onChanged(): void;
};

const CODE_FIELDS = ["code", "before", "after", "patch"] as const;
const SKIP_FIELDS = new Set(["id", "hash", "type", "frame", "change", ...CODE_FIELDS]);

/** Fields (other than code) whose value differs between two versions of a card. */
function fieldChanges(a: RNode, b: RNode) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)].filter((k) => !SKIP_FIELDS.has(k)));
  return [...keys]
    .filter((k) => !sameValue((a as never)[k], (b as never)[k]))
    .map((k) => ({ key: k, before: (a as never)[k] as unknown, after: (b as never)[k] as unknown }));
}

export function Inspector(p: Props) {
  const n = p.node;
  const old = p.against?.nodes.find((x) => x.id === n.id);
  const removed = p.state === "removed";
  const [split, setSplit] = useState(false);
  const variantLabels = Object.fromEntries(p.view.variants.map((v) => [v.id, v.label]));

  // Where this card exists across variants, and where its content changed.
  const history = p.view.variants.map((v) => {
    const here = v.nodes.find((x) => x.id === n.id);
    const parent = v.extends ? p.view.variants.find((x) => x.id === v.extends)?.nodes.find((x) => x.id === n.id) : undefined;
    return { v, here, changed: !!here && (!parent || parent.hash !== here.hash) };
  });

  return (
    <aside className="inspector">
      <div className="in-head">
        <span className="type-badge">{(n.type === "step" && n.kind) || TYPE_LABEL[n.type]}</span>
        {p.state !== "same" && p.against && <span className={`state-badge sb-${p.state}`}>{p.state === "added" ? "New" : p.state === "changed" ? "Changed" : "Removed"} vs {p.against.label}</span>}
        <span className="spacer" />
        <button className="icon-btn" onClick={p.onClose} title="Close (esc)">
          ✕
        </button>
      </div>
      <h2 className="in-title">{n.title}</h2>
      {n.summary && <p className="in-sum">{n.summary}</p>}

      <div className="in-history" title="Variants that contain this card. A filled dot means its content changed there.">
        {history.map(({ v, here, changed }) => (
          <span key={v.id} className={`hist k-${v.kind} ${here ? "" : "absent"} ${changed ? "changed" : ""} ${v.id === p.target.id ? "cur" : ""}`}>
            <i />
            {v.label}
          </span>
        ))}
      </div>

      {!removed && (
        <div className="mark-row">
          {(["seen", "verified", "flagged"] as const).map((s) => (
            <button key={s} className={`mark-btn mb-${s} ${p.mark.state === s && !p.mark.stale ? "on" : ""}`} onClick={() => p.onMark(p.mark.state === s && !p.mark.stale ? null : s)}>
              {s === "verified" ? "✓ Verified" : s === "flagged" ? "⚑ Flag" : "◦ Seen"}
            </button>
          ))}
          {p.mark.stale && <span className="stale-note">↻ Changed since you marked it {p.mark.state}{p.mark.variant ? ` on ${variantLabels[p.mark.variant] ?? p.mark.variant}` : ""}</span>}
        </div>
      )}

      {n.change && <div className="callout change">{n.change}</div>}

      {old && p.state === "changed" && (
        <section>
          <div className="sec-head">
            <h3>What changed since {p.against!.label}</h3>
            <label className="small muted">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> split
            </label>
          </div>
          {CODE_FIELDS.map((f) => {
            const a = (old as never)[f];
            const b = (n as never)[f];
            if (a === undefined && b === undefined) return null;
            if (codeOf(a)?.code === codeOf(b)?.code) return null;
            return <CodeDiff key={f} before={a} after={b} split={split} name={f === "code" ? undefined : f} />;
          })}
          {fieldChanges(old, n).map((c) => (
            <div className="field-change" key={c.key}>
              <div className="fc-key">{c.key}</div>
              <div className="fc-pair">
                <pre className="fc-before">{show(c.before) || "—"}</pre>
                <pre className="fc-after">{show(c.after) || "—"}</pre>
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        {p.state === "changed" && <h3>Now</h3>}
        <Body {...p} />
      </section>

      {n.refs && n.refs.length > 0 && (
        <section>
          <h3>Where it lives</h3>
          <ul className="refs">
            {n.refs.map((r, i) => (
              <li key={i}>
                {r.label && <span className="muted">{r.label}: </span>}
                {r.url ? (
                  <a href={r.url} target="_blank" rel="noreferrer">{r.path ?? r.url}</a>
                ) : (
                  <code>{r.path}{r.lines ? `:${r.lines}` : ""}</code>
                )}
                {r.path && <CopyText text={r.path} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3>Comments</h3>
        <Threads
          reviewKey={p.reviewKey}
          view={p.view.id}
          node={n.id}
          variant={p.target.id}
          variantLabels={variantLabels}
          comments={p.comments}
          composeTick={p.composeTick}
          onChanged={p.onChanged}
        />
      </section>
    </aside>
  );
}

function Ports({ label, ports }: { label: string; ports?: (string | { name: string; type?: string; note?: string })[] }) {
  if (!ports?.length) return null;
  return (
    <div className="ports">
      <span className="muted">{label}</span>
      {ports.map((x, i) =>
        typeof x === "string" ? (
          <code key={i}>{x}</code>
        ) : (
          <code key={i} title={x.note}>
            {x.name}
            {x.type && <span className="muted">: {x.type}</span>}
          </code>
        ),
      )}
    </div>
  );
}

function Body(p: Props) {
  const n = p.node;
  switch (n.type) {
    case "note":
      return <Markdown text={n.body} />;
    case "step":
      return (
        <>
          <Markdown text={n.body} />
          <Ports label="in" ports={n.inputs} />
          <Ports label="out" ports={n.outputs} />
          <CodeBlock code={n.code} />
        </>
      );
    case "diff":
      return (
        <>
          <Markdown text={n.body} />
          {n.patch ? <PatchView patch={n.patch} /> : <CodeDiff before={n.before} after={n.after} name={n.path} />}
        </>
      );
    case "test":
      return <TestBody {...p} />;
    case "question":
      return <QuestionBody {...p} />;
    case "claim":
      return (
        <>
          <div className={`conf-line c-${n.confidence}`}>{CONFIDENCE_LABEL[n.confidence]}</div>
          <Markdown text={n.body} />
          {n.evidence?.length ? (
            <>
              <h4>Evidence</h4>
              <Evidence reviewKey={p.reviewKey} items={n.evidence} />
            </>
          ) : (
            <div className="callout warn">No evidence given. Treat this as unchecked.</div>
          )}
        </>
      );
    case "unverified":
      return (
        <>
          <Markdown text={n.body} />
          <ul className="unverified">
            {n.items.map((it, i) => (
              <li key={i}>
                <b>{it.text}</b>
                {it.why && <div className="muted">{it.why}</div>}
              </li>
            ))}
          </ul>
        </>
      );
    case "diagram":
      return (
        <>
          <Markdown text={n.body} />
          <Mermaid source={n.mermaid} />
        </>
      );
    case "table":
      return (
        <>
          <Markdown text={n.body} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>{n.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {n.rows.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j}>{c === null ? <span className="muted">null</span> : String(c)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    case "image":
      return (
        <>
          <Markdown text={n.body} />
          <img className="shot" src={/^https?:/.test(n.src) ? n.src : api.fileUrl(p.reviewKey, n.src)} alt={n.title} />
        </>
      );
  }
}

function Evidence({ reviewKey, items }: { reviewKey: string; items: { label?: string; path?: string; lines?: string; url?: string; text?: string }[] }) {
  return (
    <ul className="refs">
      {items.map((e, i) => (
        <li key={i}>
          {e.label && <b>{e.label}</b>} {e.text && <span>{e.text}</span>}{" "}
          {e.url && <a href={e.url} target="_blank" rel="noreferrer">{e.url}</a>}
          {e.path && (
            <a href={api.fileUrl(reviewKey, e.path)} target="_blank" rel="noreferrer">
              <code>{e.path}{e.lines ? `:${e.lines}` : ""}</code>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function TestBody(p: Props) {
  const n = p.node as Extract<RNode, { type: "test" }>;
  const hasActual = n.actual !== undefined;
  const match = hasActual && sameValue(n.expected, n.actual);
  return (
    <>
      <div className={`result-line r-${n.result}`}>
        {n.result === "pass" ? "✓ Passed" : n.result === "fail" ? "✗ Failed" : n.result === "skip" ? "Skipped" : "Not run yet"}
      </div>
      <Markdown text={n.body} />
      {n.inputs !== undefined && (
        <>
          <h4>Given</h4>
          <pre className="val">{show(n.inputs)}</pre>
        </>
      )}
      <div className="expect-grid">
        <div>
          <h4>Expected</h4>
          <pre className="val">{show(n.expected) || "—"}</pre>
        </div>
        <div>
          <h4>Actual</h4>
          <pre className={`val ${hasActual ? (match ? "ok" : "bad") : ""}`}>{hasActual ? show(n.actual) : "not run"}</pre>
        </div>
      </div>
      {n.command && (
        <>
          <h4>Run it yourself</h4>
          <div className="cmd">
            <code>{n.command}</code>
            <CopyText text={n.command} />
          </div>
        </>
      )}
      {n.evidence?.length ? (
        <>
          <h4>Evidence</h4>
          <Evidence reviewKey={p.reviewKey} items={n.evidence} />
        </>
      ) : null}
    </>
  );
}

function QuestionBody(p: Props) {
  const n = p.node as Extract<RNode, { type: "question" }>;
  const answers = p.comments.filter((c) => c.kind === "answer").sort((a, b) => a.ts.localeCompare(b.ts));
  const latest = answers.at(-1);
  const [choice, setChoice] = useState<string | undefined>(latest?.choice);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await api.comment(p.reviewKey, { view: p.view.id, node: n.id, variant: p.target.id, kind: "answer", choice, text: why });
      setWhy("");
      p.onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Markdown text={n.body} />
      <div className="options">
        {n.options?.map((o, i) => (
          <label key={o.id} className={`option ${choice === o.id ? "on" : ""}`}>
            <input type="radio" name={`q-${n.id}`} checked={choice === o.id} onChange={() => setChoice(o.id)} />
            <span className="opt-letter">{String.fromCharCode(65 + i)}</span>
            <span>
              <b>{o.label}</b>
              {n.recommended === o.id && <span className="rec">recommended</span>}
              <Markdown text={o.detail} className="small" />
            </span>
          </label>
        ))}
      </div>
      <textarea placeholder="Why (optional)" value={why} onChange={(e) => setWhy(e.target.value)} rows={2} />
      <div className="composer-row">
        {latest && (
          <span className="muted small">
            You answered <b>{n.options?.find((o) => o.id === latest.choice)?.label ?? latest.choice}</b>
            {latest.status === "resolved" ? " · agent has seen it" : ""}
          </span>
        )}
        <span className="spacer" />
        <button className="primary" disabled={!choice || busy || (choice === latest?.choice && !why.trim())} onClick={save}>
          {latest ? "Change answer" : "Answer"}
        </button>
      </div>
    </>
  );
}
