// `agent-review from-git`: turn a git diff into a "changes" view, or add it as the next variant of one.
// Each file is a `diff` card holding the full before/after text, so comparing two variants shows the
// interdiff (what changed between iterations), not just the latest patch.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { View } from "./schema";
import { resolveVariants } from "./resolve";
import { langOf } from "./load";

export type FromGitOpts = {
  repo: string;
  base?: string; // default HEAD
  head?: string; // default: working tree
  out: string; // review folder
  view: string;
  variant: string;
  label?: string;
  kind: "current" | "proposed" | "actual" | "iteration" | "alternative";
  extends?: string;
};

const FRAMES = [
  { id: "code", title: "Code" },
  { id: "tests", title: "Tests" },
  { id: "config", title: "Config" },
  { id: "docs", title: "Docs" },
];

const frameOf = (p: string) =>
  /(^|\/)(tests?|__tests__|spec)(\/|$)|\.(test|spec)\.[a-z]+$|_test\.(go|py)$/i.test(p)
    ? "tests"
    : /\.(md|mdx|rst|txt)$/i.test(p)
      ? "docs"
      : /\.(json|ya?ml|toml|ini|lock)$|(^|\/)(\.env|Dockerfile|Makefile)/i.test(p)
        ? "config"
        : "code";

export const cardId = (path: string) => path.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[^A-Za-z0-9]+/, "f");

async function show(repo: string, rev: string | undefined, path: string): Promise<string | undefined> {
  if (!rev) {
    const f = join(repo, path);
    return existsSync(f) ? readFileSync(f, "utf8") : undefined;
  }
  const r = await $`git -C ${repo} show ${`${rev}:${path}`}`.quiet().nothrow();
  return r.exitCode === 0 ? r.stdout.toString() : undefined;
}

export async function fromGit(o: FromGitOpts) {
  const repo = resolve(o.repo);
  const base = o.base ?? "HEAD";
  const range = o.head ? [`${base}...${o.head}`] : [base];
  const numstat = (await $`git -C ${repo} diff --numstat -M ${range}`.quiet()).stdout.toString();
  const status = (await $`git -C ${repo} diff --name-status -M ${range}`.quiet()).stdout.toString();
  // Untracked files count as added when diffing the working tree.
  const untracked = o.head
    ? []
    : (await $`git -C ${repo} ls-files --others --exclude-standard`.quiet()).stdout.toString().split("\n").filter(Boolean);
  const outAbs = resolve(o.out);

  type F = { path: string; old?: string; status: string; add: number; del: number; binary: boolean };
  const files: F[] = [];
  const stats = numstat.split("\n").filter(Boolean).map((l) => l.split("\t"));
  for (const line of status.split("\n").filter(Boolean)) {
    const [st, a, b] = line.split("\t");
    const path = b ?? a!;
    const s = stats.find((x) => x[2] === path || x[2]?.endsWith(`=> ${path}}`) || x[2]?.includes(path));
    files.push({ path, old: b ? a : undefined, status: st![0]!, add: Number(s?.[0]) || 0, del: Number(s?.[1]) || 0, binary: s?.[0] === "-" });
  }
  for (const u of untracked) {
    if (resolve(repo, u).startsWith(outAbs + "/")) continue; // don't review the review
    const text = readFileSync(join(repo, u), "utf8");
    files.push({ path: u, status: "A", add: text.split("\n").length, del: 0, binary: false });
  }
  const real = files.filter((f) => !resolve(repo, f.path).startsWith(outAbs + "/"));

  const viewFile = join(o.out, "views", `${o.view}.json`);
  const existing = existsSync(viewFile) ? View.parse(JSON.parse(readFileSync(viewFile, "utf8"))) : undefined;
  const parentId = existing ? (o.extends ?? existing.variants.at(-1)?.id) : undefined;
  const parent = existing && parentId ? resolveVariants(existing, viewFile).variants.find((v) => v.id === parentId) : undefined;
  const parentIds = new Set(parent?.nodes.map((n) => n.id));

  const nodes: Record<string, unknown>[] = [];
  for (const f of real) {
    const id = cardId(f.path);
    const verb = f.status === "A" ? "Adds" : f.status === "D" ? "Deletes" : f.status === "R" ? `Renames ${f.old} to` : "Changes";
    const summary = f.binary ? "Binary file" : `+${f.add} −${f.del}`;
    const before = f.status === "A" ? "" : ((await show(repo, base, f.old ?? f.path)) ?? "");
    const after = f.status === "D" ? "" : ((await show(repo, o.head, f.path)) ?? "");
    const lang = langOf(f.path);
    const content = f.binary
      ? { summary }
      : { summary, path: f.path, before: { code: before, lang }, after: { code: after, lang } };
    // Keep titles and frames the agent already improved; only content moves forward.
    nodes.push(parentIds.has(id) ? { id, ...content } : { id, type: "diff", frame: frameOf(f.path), title: `${verb} ${f.path}`, refs: [{ path: f.path }], ...content });
  }
  const ids = new Set(nodes.map((n) => n.id as string));
  const variant = {
    id: o.variant,
    label: o.label ?? o.variant,
    kind: o.kind,
    ...(parentId && parentId !== o.variant ? { extends: parentId } : {}),
    summary: `\`git diff ${range.join(" ")}\`${o.head ? "" : " (working tree)"}: ${real.length} files, +${real.reduce((a, f) => a + f.add, 0)} −${real.reduce((a, f) => a + f.del, 0)}`,
    createdAt: new Date().toISOString(),
    nodes,
    remove: parent ? [...parentIds].filter((id) => !ids.has(id)) : [],
  };

  const view = existing
    ? { ...existing, variants: [...existing.variants.filter((v) => v.id !== o.variant), variant], defaultVariant: o.variant }
    : { id: o.view, title: "Changes", description: "One card per changed file. Retitle cards to say what each change does.", frames: FRAMES, variants: [variant] };

  mkdirSync(join(o.out, "views"), { recursive: true });
  writeFileSync(viewFile, JSON.stringify(view, null, 2) + "\n");
  const rj = join(o.out, "review.json");
  if (!existsSync(rj)) {
    const name = repo.split("/").pop();
    writeFileSync(rj, JSON.stringify({ agentReview: 1, id: cardId(name ?? "review"), title: `Changes in ${name}`, status: "draft", views: [o.view] }, null, 2) + "\n");
  } else {
    const r = JSON.parse(readFileSync(rj, "utf8"));
    if (!r.views?.includes(o.view)) {
      r.views = [...(r.views ?? []), o.view];
      writeFileSync(rj, JSON.stringify(r, null, 2) + "\n");
    }
  }
  return { files: real.length, viewFile, variant: o.variant, extends: variant.extends };
}
