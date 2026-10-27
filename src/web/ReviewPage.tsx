import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useData, useLiveReload } from "./api";
import { navigate } from "./nav";
import { compare, type Comparison } from "../core/resolve";
import type { Mark, RReview, RVariant, RView } from "../core/types";
import { Canvas, type CanvasHandle } from "./Canvas";
import { Inspector } from "./Inspector";
import { Brief } from "./Brief";
import { Search } from "./Search";
import { Help } from "./Help";
import { KIND_LABEL, markFor, nextInDirection, type Dir } from "./util";

type Q = { view?: string; v?: string; vs?: string; mode?: "overlay" | "side"; node?: string };

const readQ = (): Q => Object.fromEntries(new URLSearchParams(location.search)) as Q;

export function ReviewPage({ reviewKey }: { reviewKey: string }) {
  const [q, setQState] = useState<Q>(readQ);
  const setQ = useCallback((patch: Partial<Q>, push = false) => {
    setQState((prev) => {
      const next = { ...prev, ...patch };
      const s = new URLSearchParams(Object.entries(next).filter(([, v]) => v !== undefined && v !== "") as [string, string][]);
      navigate(`${location.pathname}${s.size ? "?" + s : ""}`, !push);
      return next;
    });
  }, []);
  useEffect(() => {
    const on = () => setQState(readQ());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);

  const rv = useData(() => api.review(reviewKey), [reviewKey]);
  const fb = useData(() => api.feedback(reviewKey), [reviewKey]);
  const review = rv.data && !("failed" in rv.data) ? (rv.data as RReview) : undefined;
  const viewId = q.view && review?.views.includes(q.view) ? q.view : review?.views[0];
  const vw = useData(() => (viewId ? api.view(reviewKey, viewId) : Promise.resolve(undefined)), [reviewKey, viewId]);
  const view = vw.data?.view;

  useLiveReload((key) => {
    if (key && key !== reviewKey) return;
    rv.reload();
    vw.reload();
    fb.reload();
  });

  useEffect(() => {
    if (review) document.title = `${review.title} · agent.review`;
  }, [review?.title]);

  // Variants: target (what you look at) and against (what it's compared with).
  const target: RVariant | undefined = useMemo(() => {
    if (!view) return;
    return view.variants.find((v) => v.id === q.v) ?? view.variants.find((v) => v.id === view.defaultVariant) ?? view.variants.at(-1);
  }, [view, q.v]);
  const against: RVariant | undefined = useMemo(() => {
    if (!view || !target || q.vs === "none") return;
    const id = q.vs ?? (target.id === (view.defaultVariant ?? view.variants.at(-1)?.id) ? view.defaultCompare : undefined) ?? target.extends;
    return id && id !== target.id ? view.variants.find((v) => v.id === id) : undefined;
  }, [view, target, q.vs]);
  const cmp: Comparison | undefined = useMemo(() => (target ? compare(target, against) : undefined), [target, against]);
  const mode = q.mode === "side" && against ? "side" : "overlay";

  const [inspectorOpen, setInspectorOpen] = useState(!!q.node);
  const [briefOpen, setBriefOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [composeTick, setComposeTick] = useState(0);
  const canvas = useRef<CanvasHandle>(null);

  const selected = q.node;
  const select = useCallback(
    (id: string | undefined, opts: { open?: boolean; focus?: boolean } = {}) => {
      setQ({ node: id });
      if (opts.open !== undefined) setInspectorOpen(opts.open);
      if (id && opts.focus) canvas.current?.focusNode(id);
    },
    [setQ],
  );

  const comments = fb.data?.comments ?? [];
  const marks = fb.data?.marks ?? {};

  const setMark = useCallback(
    async (nodeId: string, state: Mark["state"] | null) => {
      if (!view || !target) return;
      const n = target.nodes.find((x) => x.id === nodeId);
      if (!n) return;
      const key = `${view.id}/${nodeId}`;
      const mark: Mark | null = state ? { state, hash: n.hash, variant: target.id, ts: new Date().toISOString() } : null;
      fb.setData((d) => {
        if (!d) return d;
        const m = { ...d.marks };
        if (mark) m[key] = mark;
        else delete m[key];
        return { ...d, marks: m };
      });
      await api.mark(reviewKey, key, mark);
    },
    [view, target, reviewKey],
  );

  // Tour
  const tourSteps = review?.tour ?? [];
  const goTour = useCallback(
    (i: number) => {
      const s = tourSteps[i];
      if (!s) return setTour(null);
      setTour(i);
      setQ({ view: s.view, v: s.variant, vs: undefined, node: s.node }, true);
      if (s.node) setInspectorOpen(false);
    },
    [tourSteps, setQ],
  );
  // focus the tour's node once its view has loaded
  useEffect(() => {
    if (tour === null || !view) return;
    const s = tourSteps[tour];
    if (s?.node && s.view === view.id) setTimeout(() => canvas.current?.focusNode(s.node!), 60);
  }, [tour, view?.id]);

  const variantIdx = view && target ? view.variants.findIndex((v) => v.id === target.id) : -1;
  const cycleVariant = (d: number) => {
    if (!view) return;
    const n = view.variants.length;
    setQ({ v: view.variants[(variantIdx + d + n) % n]!.id, vs: undefined });
  };
  const cycleView = (d: number) => {
    if (!review || !viewId) return;
    const i = review.views.indexOf(viewId);
    const n = review.views.length;
    setQ({ view: review.views[(i + d + n) % n], v: undefined, vs: undefined, node: undefined }, true);
  };

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable=true]")) {
        if (e.key === "Escape") (t as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!view || !target || !cmp) return;
      const k = e.key;
      const dirs: Record<string, Dir> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", h: "left", l: "right", k: "up", j: "down" };
      if (dirs[k]) {
        e.preventDefault();
        const visible = new Set([...cmp.nodes.keys()]);
        const next = nextInDirection(view.layout.nodes, visible, selected, dirs[k]!);
        if (next) select(next, { focus: true });
        return;
      }
      if (/^[1-9]$/.test(k)) {
        const f = view.frames[Number(k) - 1];
        if (f) {
          canvas.current?.fitFrame(f.id);
          const first = Object.entries(view.layout.nodes)
            .filter(([id]) => cmp.nodes.has(id) && target.nodes.concat(against?.nodes ?? []).find((n) => n.id === id)?.frame === f.id)
            .sort((a, b) => a[1].y - b[1].y || a[1].x - b[1].x)[0];
          if (first) setQ({ node: first[0] });
        }
        return;
      }
      switch (k) {
        case "Enter":
          if (selected) setInspectorOpen(true);
          break;
        case "Escape":
          if (helpOpen) setHelpOpen(false);
          else if (inspectorOpen) setInspectorOpen(false);
          else if (tour !== null) setTour(null);
          else canvas.current?.fitAll();
          break;
        case "v":
          cycleVariant(1);
          break;
        case "V":
          cycleVariant(-1);
          break;
        case "c":
          setQ({ vs: against ? "none" : target.extends ?? view.variants.find((v) => v.id !== target.id)?.id });
          break;
        case "s":
          if (against) setQ({ mode: mode === "side" ? "overlay" : "side" });
          break;
        case "r":
          if (selected) {
            const m = markFor(marks, view.id, selected, target);
            void setMark(selected, m.state === "verified" && !m.stale ? null : "verified");
          }
          break;
        case "x":
          if (selected) {
            const m = markFor(marks, view.id, selected, target);
            void setMark(selected, m.state === "flagged" && !m.stale ? null : "flagged");
          }
          break;
        case "m":
          if (selected) {
            e.preventDefault();
            setInspectorOpen(true);
            setComposeTick((n) => n + 1);
          }
          break;
        case "b":
          setBriefOpen((o) => !o);
          break;
        case "t":
          if (tourSteps.length) tour === null ? goTour(0) : setTour(null);
          break;
        case "]":
          if (tour !== null) goTour(tour + 1);
          break;
        case "[":
          if (tour !== null && tour > 0) goTour(tour - 1);
          break;
        case ".":
          cycleView(1);
          break;
        case ",":
          cycleView(-1);
          break;
        case "/":
          e.preventDefault();
          setSearchOpen(true);
          break;
        case "?":
          setHelpOpen((o) => !o);
          break;
        case "0":
          canvas.current?.fitAll();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (rv.error) return <div className="banner error">{rv.error}</div>;
  if (rv.data && "failed" in rv.data)
    return (
      <div className="page-error">
        <h2>This review has errors</h2>
        <IssueList issues={rv.data.issues} />
      </div>
    );
  if (!review) return <div className="loading">Loading…</div>;

  const openCount = comments.filter((c) => c.status === "open" && c.author === "reviewer" && !c.parent).length;
  const viewComments = comments.filter((c) => c.view === viewId);
  const verified = view && target ? target.nodes.filter((n) => { const m = markFor(marks, view.id, n.id, target); return m.state === "verified" && !m.stale; }).length : 0;
  const selNode = target?.nodes.find((n) => n.id === selected) ?? against?.nodes.find((n) => n.id === selected);
  const issues = [...review.issues, ...(vw.data?.issues ?? [])];

  return (
    <div className="rp">
      <header className="topbar">
        <a
          className="brand small-brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
          title="All reviews"
        >
          <span className="brand-mark" />
        </a>
        <div className="tb-title">
          <span className={`status-pill s-${review.status}`}>{review.status}</span>
          <span className="tb-name" title={review.dir}>{review.title}</span>
        </div>
        <nav className="view-tabs">
          {review.views.map((v, i) => (
            <button
              key={v}
              className={v === viewId ? "on" : ""}
              onClick={() => setQ({ view: v, v: undefined, vs: undefined, node: undefined }, true)}
              title={`View ${i + 1} (, and . to switch)`}
            >
              {review.viewTitles[v] ?? v}
              {comments.some((c) => c.view === v && c.status === "open" && !c.parent && c.author === "reviewer") && <i className="dot" />}
            </button>
          ))}
        </nav>
        <div className="tb-right">
          {view && target && (
            <span className="progress" title="Cards you marked verified in this variant">
              <b>{verified}</b>/{target.nodes.length} verified
            </span>
          )}
          {openCount > 0 && <span className="pill warn">{openCount} open</span>}
          {issues.some((i) => i.level === "error") && <span className="pill bad">{issues.filter((i) => i.level === "error").length} errors</span>}
          <button className="icon-btn" onClick={() => setSearchOpen(true)} title="Search (/)">⌕</button>
          <button className="icon-btn" onClick={() => setHelpOpen(true)} title="Shortcuts (?)">?</button>
        </div>
      </header>

      {view && target && (
        <div className="variant-bar">
          {!briefOpen && (
            <button className="brief-toggle" onClick={() => setBriefOpen(true)} title="Show the brief (b)">
              ☰ Brief
            </button>
          )}
          <div className="vb-chain">
            {view.variants.map((v, i) => (
              <button
                key={v.id}
                className={`vchip k-${v.kind} ${v.id === target.id ? "on" : ""} ${v.id === against?.id ? "vs" : ""}`}
                onClick={(e) => (e.shiftKey ? setQ({ vs: v.id === target.id ? "none" : v.id }) : setQ({ v: v.id, vs: undefined }))}
                title={`${KIND_LABEL[v.kind]}${v.extends ? ` · builds on ${v.extends}` : ""}\nClick: show · Shift-click: compare against`}
              >
                {i > 0 && <span className="vchip-arrow">→</span>}
                <span className="vchip-dot" />
                {v.label}
                {(() => {
                  const vd = comments.filter((c) => c.kind === "verdict" && c.view === view.id && c.variant === v.id).sort((a, b) => a.ts.localeCompare(b.ts)).at(-1);
                  return vd ? <span className={`vchip-verdict v-${vd.choice}`} title={vd.choice === "approve" ? "Approved" : "Changes requested"}>{vd.choice === "approve" ? "✓" : "✗"}</span> : null;
                })()}
              </button>
            ))}
          </div>
          <div className="vb-compare">
            <label>
              compared with
              <select value={against?.id ?? "none"} onChange={(e) => setQ({ vs: e.target.value })}>
                <option value="none">nothing</option>
                {view.variants
                  .filter((v) => v.id !== target.id)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
              </select>
            </label>
            {against && (
              <div className="seg">
                <button className={mode === "overlay" ? "on" : ""} onClick={() => setQ({ mode: "overlay" })} title="Differences on one map">
                  Overlay
                </button>
                <button className={mode === "side" ? "on" : ""} onClick={() => setQ({ mode: "side" })} title="Two maps, side by side (s)">
                  Side by side
                </button>
              </div>
            )}
            {cmp && against && (
              <span className="counts">
                {cmp.counts.added > 0 && <span className="c-added">+{cmp.counts.added} new</span>}
                {cmp.counts.changed > 0 && <span className="c-changed">~{cmp.counts.changed} changed</span>}
                {cmp.counts.removed > 0 && <span className="c-removed">−{cmp.counts.removed} removed</span>}
                {cmp.counts.added + cmp.counts.changed + cmp.counts.removed === 0 && <span className="muted">no differences</span>}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="rp-main">
        {briefOpen && (
          <Brief
            review={review}
            view={view}
            target={target}
            against={against}
            cmp={cmp}
            comments={comments}
            issues={issues}
            reviewKey={reviewKey}
            onPick={(id) => select(id, { focus: true, open: true })}
            onTour={tourSteps.length ? () => goTour(0) : undefined}
            onClose={() => setBriefOpen(false)}
            onChanged={fb.reload}
          />
        )}
        <div className="canvas-wrap">
          {vw.error && <div className="banner error">{vw.error}</div>}
          {!view && vw.data && <div className="page-error"><h2>This view has errors</h2><IssueList issues={vw.data.issues} /></div>}
          {view && target && cmp && (
            <Canvas
              ref={canvas}
              view={view}
              target={target}
              against={against}
              cmp={cmp}
              mode={mode}
              selected={selected}
              marks={marks}
              comments={viewComments}
              onSelect={(id) => select(id, { open: !!id })}
            />
          )}
        </div>
        {inspectorOpen && view && target && selNode && (
          <Inspector
            key={`${view.id}/${selNode.id}`}
            reviewKey={reviewKey}
            view={view}
            node={selNode}
            target={target}
            against={against}
            state={cmp?.nodes.get(selNode.id) ?? "same"}
            mark={markFor(marks, view.id, selNode.id, target)}
            comments={viewComments.filter((c) => c.node === selNode.id)}
            composeTick={composeTick}
            onMark={(s) => setMark(selNode.id, s)}
            onClose={() => setInspectorOpen(false)}
            onChanged={fb.reload}
          />
        )}
      </div>

      <footer className="bottombar">
        {tour !== null && tourSteps[tour] ? (
          <div className="tour">
            <span className="tour-n">
              Tour {tour + 1}/{tourSteps.length}
            </span>
            <b>{tourSteps[tour]!.title}</b>
            <span className="tour-text">{tourSteps[tour]!.text.replace(/[`*]/g, "")}</span>
            <button onClick={() => goTour(tour - 1)} disabled={tour === 0}>
              ← [
            </button>
            <button onClick={() => goTour(tour + 1)}>{tour + 1 < tourSteps.length ? "next ]" : "finish"}</button>
            <button onClick={() => setTour(null)}>✕</button>
          </div>
        ) : (
          <div className="hints">
            <span><kbd>←↑↓→</kbd> move</span>
            <span><kbd>1-9</kbd> frame</span>
            <span><kbd>⏎</kbd> open</span>
            <span><kbd>v</kbd> variant</span>
            <span><kbd>c</kbd> compare</span>
            <span><kbd>r</kbd> verified</span>
            <span><kbd>m</kbd> comment</span>
            {tourSteps.length > 0 && <span><kbd>t</kbd> tour</span>}
            <span><kbd>/</kbd> search</span>
            <span><kbd>?</kbd> all keys</span>
          </div>
        )}
      </footer>

      {searchOpen && view && (
        <Search
          view={view}
          target={target}
          against={against}
          comments={viewComments}
          onPick={(id) => {
            setSearchOpen(false);
            select(id, { focus: true, open: true });
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
      {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

export function IssueList({ issues }: { issues: { level: string; file: string; path?: string; message: string }[] }) {
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={i.level}>
          <b>{i.level}</b> <code>{i.file.split("/").slice(-2).join("/")}</code>
          {i.path && <> › <code>{i.path}</code></>}: {i.message}
        </li>
      ))}
    </ul>
  );
}

export type { RView };
