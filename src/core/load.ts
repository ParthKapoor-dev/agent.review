// Finding, reading and validating review folders on disk.
import { readdirSync, statSync, existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname, isAbsolute, relative } from "node:path";
import { Review, View } from "./schema";
import { resolveVariants } from "./resolve";
import type { Issue, RReview, RView, ResolvedCode } from "./types";

const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next", ".cache", "target", ".venv", "venv"]);

/** Directories under `roots` that contain an agent.review `review.json` (or `.agent-review/review.json`). */
export function discover(roots: string[], maxDepth = 7): string[] {
  const found = new Set<string>();
  const visit = (dir: string, depth: number) => {
    const rj = join(dir, "review.json");
    if (existsSync(rj) && isReviewFile(rj)) found.add(dir);
    if (depth >= maxDepth) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP.has(e) || (e.startsWith(".") && e !== ".agent-review")) continue;
      const p = join(dir, e);
      try {
        if (statSync(p).isDirectory()) visit(p, depth + 1);
      } catch {}
    }
  };
  for (const r of roots) visit(resolve(r), 0);
  return [...found].sort();
}

function isReviewFile(p: string): boolean {
  try {
    return /"agentReview"\s*:/.test(readFileSync(p, "utf8").slice(0, 4000));
  } catch {
    return false;
  }
}

function readJson(file: string, issues: Issue[]): unknown {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    issues.push({ level: "error", file, message: "File not found" });
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const msg = (e as Error).message;
    const pos = Number(/position (\d+)/.exec(msg)?.[1]);
    const where = Number.isFinite(pos) ? ` (line ${text.slice(0, pos).split("\n").length})` : "";
    issues.push({ level: "error", file, message: `Invalid JSON${where}: ${msg}` });
    return undefined;
  }
}

const zodIssues = (file: string, err: { issues: { path: PropertyKey[]; message: string }[] }): Issue[] =>
  err.issues.map((i) => ({ level: "error", file, path: i.path.map(String).join("."), message: i.message }));

export function loadReview(dir: string): RReview | { dir: string; issues: Issue[]; failed: true } {
  const file = join(dir, "review.json");
  const issues: Issue[] = [];
  const raw = readJson(file, issues);
  if (raw === undefined) return { dir, issues, failed: true };
  const parsed = Review.safeParse(raw);
  if (!parsed.success) return { dir, issues: zodIssues(file, parsed.error), failed: true };
  const long = (path: string, text: string | undefined, max: number, hint: string) => {
    if (text && text.length > max) issues.push({ level: "warning", file, path, message: `${text.length} chars; keep under ${max}. ${hint}` });
  };
  long("summary", parsed.data.summary, 600, "Two short paragraphs: what is wrong today, what changes. Detail belongs on cards.");
  parsed.data.board?.waiting?.forEach((w, i) => long(`board.waiting.${i}`, w, 90, "One line per thing you need."));
  parsed.data.tour.forEach((t, i) => long(`tour.${i}.text`, t.text, 200, "One or two sentences per stop."));
  const viewTitles: Record<string, string> = {};
  for (const v of parsed.data.views) {
    const vf = join(dir, "views", `${v}.json`);
    if (!existsSync(vf)) {
      issues.push({ level: "error", file, path: "views", message: `views/${v}.json does not exist` });
      continue;
    }
    const j = readJson(vf, issues) as { title?: string; frames?: { title?: string }[] } | undefined;
    viewTitles[v] = j?.title ?? v;
    if (j?.title && j.title.length > 28)
      issues.push({ level: "warning", file: vf, path: "title", message: `${j.title.length} chars; a view title is a tab, keep under 28. Put the sentence in description.` });
    j?.frames?.forEach((f, i) => {
      if (f.title && f.title.length > 22)
        issues.push({ level: "warning", file: vf, path: `frames.${i}.title`, message: `${f.title.length} chars; frame titles are headings, keep under 22.` });
    });
  }
  return { ...parsed.data, key: parsed.data.id, dir, viewTitles, issues };
}

const CODE_KEYS = ["code", "before", "after", "patch"] as const;

/** Read `{file, lines}` code references so hashes and diffs see real content. */
function readCodeRefs(raw: any, reviewDir: string, file: string, issues: Issue[]) {
  for (const v of raw?.variants ?? [])
    for (const n of v?.nodes ?? [])
      for (const k of CODE_KEYS) {
        const c = n?.[k];
        if (!c || typeof c !== "object" || !c.file) continue;
        const p = isAbsolute(c.file) ? c.file : resolve(reviewDir, c.file);
        const out: ResolvedCode = { code: "", lang: c.lang ?? langOf(c.file), file: c.file, lines: c.lines };
        try {
          let text = readFileSync(p, "utf8");
          if (c.lines) {
            const [a, b] = c.lines.split("-").map(Number);
            text = text.split("\n").slice(a - 1, b ?? a).join("\n");
          }
          out.code = text;
        } catch {
          out.error = `Could not read ${p}`;
          issues.push({ level: "error", file, path: `variants.${v.id}.nodes.${n.id}.${k}`, message: out.error });
        }
        n[k] = out;
      }
}

export function langOf(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx", mjs: "javascript", py: "python", sql: "sql",
    json: "json", html: "html", css: "css", md: "markdown", sh: "bash", go: "go", rs: "rust", java: "java",
    rb: "ruby", yml: "yaml", yaml: "yaml", diff: "diff", patch: "diff", xml: "xml", cs: "csharp", php: "php",
  };
  return ext ? map[ext] : undefined;
}

export async function loadView(dir: string, viewId: string): Promise<{ view?: RView; issues: Issue[] }> {
  const file = join(dir, "views", `${viewId}.json`);
  const issues: Issue[] = [];
  const raw = readJson(file, issues);
  if (raw === undefined) return { issues };
  readCodeRefs(raw, dir, file, issues);
  const parsed = View.safeParse(raw);
  if (!parsed.success) return { issues: [...issues, ...zodIssues(file, parsed.error)] };
  const { variants, issues: vi } = resolveVariants(parsed.data, file);
  issues.push(...vi);
  const { layoutView } = await import("./layout"); // ELK is heavy; hooks and the CLI rarely need it
  const layout = await layoutView(parsed.data, variants);
  const { variants: _drop, ...rest } = parsed.data;
  return { view: { ...rest, variants, layout }, issues };
}

/** Everything wrong with a review folder, for `agent-review validate`. */
export async function validateDir(dir: string): Promise<Issue[]> {
  const r = loadReview(dir);
  if ("failed" in r) return r.issues;
  const all = [...r.issues];
  for (const v of r.views) if (existsSync(join(dir, "views", `${v}.json`))) all.push(...(await loadView(dir, v)).issues);
  for (const [i, t] of r.tour.entries())
    if (!r.views.includes(t.view))
      all.push({ level: "error", file: join(dir, "review.json"), path: `tour.${i}.view`, message: `Unknown view '${t.view}'` });
  return all;
}

/** Only serve files that live under the review folder (images, evidence). */
export function safePath(dir: string, p: string): string | undefined {
  const full = isAbsolute(p) ? p : resolve(dir, p);
  const rel = relative(dirname(join(dir, "review.json")), full);
  return rel.startsWith("..") || isAbsolute(rel) ? undefined : full;
}
