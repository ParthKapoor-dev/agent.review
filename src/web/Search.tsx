import { useMemo, useState } from "react";
import type { Comment, RNode, RVariant, RView } from "../core/types";
import { codeOf } from "./Rich";
import { TYPE_LABEL } from "./util";

const text = (n: RNode) =>
  [n.title, n.summary, n.change, "body" in n ? n.body : "", "code" in n ? codeOf(n.code)?.code : "", n.refs?.map((r) => r.path).join(" ")]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();

export function Search(p: { view: RView; target?: RVariant; against?: RVariant; comments: Comment[]; onPick(id: string): void; onClose(): void }) {
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const nodes = useMemo(() => {
    const m = new Map<string, RNode>();
    for (const v of p.view.variants) for (const n of v.nodes) m.set(n.id, n);
    for (const n of p.target?.nodes ?? []) m.set(n.id, n);
    return [...m.values()];
  }, [p.view, p.target]);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return nodes.slice(0, 12).map((n) => ({ n, hit: "" }));
    return nodes
      .map((n) => {
        const t = text(n);
        const cm = p.comments.filter((c) => c.node === n.id && c.text.toLowerCase().includes(s));
        const at = t.indexOf(s);
        if (at < 0 && !cm.length) return null;
        const hit = at >= 0 ? t.slice(Math.max(0, at - 30), at + 60).replace(/\n/g, " ") : `comment: ${cm[0]!.text.slice(0, 80)}`;
        return { n, hit, score: (n.title.toLowerCase().includes(s) ? 0 : 1) + (at < 0 ? 1 : 0) };
      })
      .filter((x): x is { n: RNode; hit: string; score: number } => !!x)
      .sort((a, b) => a.score - b.score)
      .slice(0, 20);
  }, [q, nodes, p.comments]);
  const inTarget = new Set(p.target?.nodes.map((n) => n.id));
  return (
    <div className="overlay" onClick={p.onClose}>
      <div className="search" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Search cards, code and comments in this view"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") p.onClose();
            if (e.key === "ArrowDown") setI((x) => Math.min(x + 1, results.length - 1));
            if (e.key === "ArrowUp") setI((x) => Math.max(x - 1, 0));
            if (e.key === "Enter" && results[i]) p.onPick(results[i]!.n.id);
          }}
        />
        <ul>
          {results.map((r, k) => (
            <li key={r.n.id} className={k === i ? "on" : ""} onMouseEnter={() => setI(k)} onClick={() => p.onPick(r.n.id)}>
              <span className="type-badge">{TYPE_LABEL[r.n.type]}</span>
              <span className="sr-title">{r.n.title}</span>
              {!inTarget.has(r.n.id) && <span className="muted small">not in this variant</span>}
              {r.hit && <div className="muted small sr-hit">…{r.hit}…</div>}
            </li>
          ))}
          {results.length === 0 && <li className="muted">No matches</li>}
        </ul>
      </div>
    </div>
  );
}
