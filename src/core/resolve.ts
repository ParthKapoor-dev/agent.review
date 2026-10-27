// Turns a view's variant chain (root + patches) into full node/edge sets, and compares two variants.
// Pure: no file system. Used by the server (resolve) and the web app (compare).
import { Node, type View, type Edge } from "./schema";
import type { Issue, RNode, REdge, RVariant } from "./types";

export const edgeId = (e: Edge) => e.id ?? `${e.from}->${e.to}`;

/** Stable, order-independent JSON for hashing. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined && k !== "hash")
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** FNV-1a; enough to notice that a card changed. */
export function hashOf(v: unknown): string {
  const s = stable(v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** The `change` note describes a delta, not the content, so it doesn't count toward the hash. */
const contentHash = (n: Record<string, unknown>) => hashOf({ ...n, change: undefined });

export function resolveVariants(view: View, file: string): { variants: RVariant[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const byId = new Map(view.variants.map((v) => [v.id, v]));
  const done = new Map<string, RVariant>();
  const roots = view.variants.filter((v) => !v.extends);
  if (roots.length !== 1)
    issues.push({
      level: "error",
      file,
      path: "variants",
      message: `Exactly one variant must have no 'extends' (found ${roots.length}: ${roots.map((r) => r.id).join(", ") || "none"})`,
    });

  // Raw (unparsed) cards per variant, so a child can patch a card whose parent version was invalid
  // without the error being reported again in every descendant.
  const raws = new Map<string, Map<string, Record<string, unknown>>>();
  const reported = new Set<string>();

  const build = (vid: string, seen: string[]): RVariant | undefined => {
    if (done.has(vid)) return done.get(vid);
    const v = byId.get(vid);
    if (!v) return undefined;
    if (seen.includes(vid)) {
      issues.push({ level: "error", file, path: `variants.${vid}`, message: `Cycle in 'extends': ${[...seen, vid].join(" → ")}` });
      return undefined;
    }
    let nodes = new Map<string, Record<string, unknown>>();
    let edges = new Map<string, REdge>();
    if (v.extends) {
      const parent = build(v.extends, [...seen, vid]);
      if (!parent)
        issues.push({ level: "error", file, path: `variants.${vid}.extends`, message: `Unknown parent variant '${v.extends}'` });
      else {
        nodes = new Map([...raws.get(parent.id)!].map(([id, n]) => [id, { ...n, change: undefined }]));
        edges = new Map(parent.edges.map((e) => [e.id, e]));
      }
    }
    const removed = new Set<string>();
    for (const rid of v.remove) {
      removed.add(rid);
      if (!nodes.delete(rid) && !edges.delete(rid))
        issues.push({ level: "warning", file, path: `variants.${vid}.remove`, message: `'${rid}' is not a card or edge in '${v.extends ?? "(root)"}'` });
    }
    const touched = new Set<string>();
    for (const patch of v.nodes) {
      touched.add(patch.id);
      const prev = nodes.get(patch.id);
      nodes.set(patch.id, prev ? { ...prev, ...patch } : { ...patch });
    }
    // An edge with the id of an inherited one replaces it (e.g. to change its label).
    for (const e of v.edges) edges.set(edgeId(e), { ...e, id: edgeId(e) });
    raws.set(vid, nodes);

    const out: RNode[] = [];
    const broken = new Set<string>();
    for (const [nid, raw] of nodes) {
      const parsed = Node.safeParse(raw);
      if (!parsed.success) {
        broken.add(nid);
        if (!touched.has(nid)) continue; // inherited; reported where it was written
        const fresh = !v.extends || !raws.get(v.extends)?.has(nid);
        if (!fresh && raw.type === undefined) continue;
        for (const iss of parsed.error.issues) {
          const field = iss.path.join(".");
          const key = `${nid}|${field}|${iss.message}`;
          if (reported.has(key)) continue;
          reported.add(key);
          issues.push({
            level: "error",
            file,
            path: `variants.${vid}.nodes.${nid}${field ? "." + field : ""}`,
            message: `${hintFor(String(iss.path.at(-2) ?? iss.path.at(-1) ?? ""), iss.message)} (card '${nid}' is left off the canvas until fixed)`,
          });
        }
        continue;
      }
      out.push({ ...parsed.data, hash: contentHash(parsed.data) } as RNode);
    }
    for (const n of out) if (touched.has(n.id)) issues.push(...tooLong(file, `variants.${vid}.nodes.${n.id}`, n));
    const ids = new Set(out.map((n) => n.id));
    const frames = new Set(view.frames.map((f) => f.id));
    for (const n of out)
      if (n.frame && !frames.has(n.frame) && touched.has(n.id))
        issues.push({ level: "warning", file, path: `variants.${vid}.nodes.${n.id}.frame`, message: `Unknown frame '${n.frame}' (frames: ${[...frames].join(", ") || "none"})` });
    const goodEdges = [...edges.values()].filter((e) => {
      const ok = ids.has(e.from) && ids.has(e.to);
      // Removing a card quietly drops its edges; only warn about edges that point nowhere.
      const ends = [e.from, e.to];
      if (!ok && !ends.some((x) => removed.has(x) || broken.has(x)) && v.edges.some((x) => edgeId(x) === e.id))
        issues.push({ level: "warning", file, path: `variants.${vid}.edges.${e.id}`, message: `Edge points at a card that does not exist (${e.from} → ${e.to})` });
      return ok;
    });
    const r: RVariant = {
      id: v.id,
      label: v.label,
      kind: v.kind,
      extends: v.extends,
      summary: v.summary,
      respondsTo: v.respondsTo,
      createdAt: v.createdAt,
      nodes: out,
      edges: goodEdges,
    };
    done.set(vid, r);
    return r;
  };

  for (const v of view.variants) build(v.id, []);
  return { variants: view.variants.map((v) => done.get(v.id)).filter((v): v is RVariant => !!v), issues };
}

/** Reviewers read titles, not paragraphs. Long text is a warning, with where the rest should go. */
export const LIMITS = { title: 70, summary: 120, change: 80 } as const;
function tooLong(file: string, path: string, n: { title: string; summary?: string; change?: string }): Issue[] {
  const out: Issue[] = [];
  const say = (field: keyof typeof LIMITS, text: string | undefined, where: string) => {
    if (text && text.length > LIMITS[field])
      out.push({ level: "warning", file, path: `${path}.${field}`, message: `${text.length} chars; keep under ${LIMITS[field]}. ${where}` });
  };
  say("title", n.title, "Say what it does in a short sentence; move detail to summary or body.");
  say("summary", n.summary, "Move the rest into body.");
  say("change", n.change, "One short clause; the diff shows the rest.");
  return out;
}

/** Zod's messages don't say what shape was wanted; add it for the fields people get wrong. */
const SHAPES: Record<string, string> = {
  refs: "refs is a list of {label?, path?, lines?, url?}",
  evidence: "evidence is a list of {label?, path?, lines?, url?, text?}",
  inputs: "inputs is a list of strings or {name, type?, note?}",
  outputs: "outputs is a list of strings or {name, type?, note?}",
  options: "options is a list of {id, label, detail?}",
  items: "items is a list of {text, why?}",
  code: "code is a string, {code, lang?}, or {file, lines?, lang?}",
  before: "before is a string, {code, lang?}, or {file, lines?, lang?}",
  after: "after is a string, {code, lang?}, or {file, lines?, lang?}",
  patch: "patch is a string, {code}, or {file}",
};
function hintFor(field: string, message: string) {
  const shape = SHAPES[field];
  return shape ? `${message}. ${shape}` : message;
}

export type ChangeState = "added" | "removed" | "changed" | "same";

export type Comparison = {
  nodes: Map<string, ChangeState>;
  edges: Map<string, ChangeState>;
  counts: Record<ChangeState, number>;
};

/** How `target` differs from `against`. */
export function compare(target: RVariant, against: RVariant | undefined): Comparison {
  const nodes = new Map<string, ChangeState>();
  const edges = new Map<string, ChangeState>();
  const counts: Record<ChangeState, number> = { added: 0, removed: 0, changed: 0, same: 0 };
  const put = (m: Map<string, ChangeState>, id: string, s: ChangeState, count: boolean) => {
    m.set(id, s);
    if (count) counts[s]++;
  };
  if (!against) {
    for (const n of target.nodes) put(nodes, n.id, "same", true);
    for (const e of target.edges) put(edges, e.id, "same", false);
    return { nodes, edges, counts };
  }
  const old = new Map(against.nodes.map((n) => [n.id, n]));
  for (const n of target.nodes) {
    const o = old.get(n.id);
    put(nodes, n.id, !o ? "added" : o.hash !== n.hash ? "changed" : "same", true);
  }
  for (const n of against.nodes) if (!nodes.has(n.id)) put(nodes, n.id, "removed", true);
  const oldE = new Map(against.edges.map((e) => [e.id, e]));
  for (const e of target.edges) {
    const o = oldE.get(e.id);
    put(edges, e.id, !o ? "added" : o.label !== e.label || o.style !== e.style || o.tone !== e.tone ? "changed" : "same", false);
  }
  for (const e of against.edges) if (!edges.has(e.id)) put(edges, e.id, "removed", false);
  return { nodes, edges, counts };
}
