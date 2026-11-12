// A workspace is a git repository. The app shows every review inside each registered repo,
// grouped by repo. The registry is a small JSON file so the CLI, agents and the server share it:
//   ~/.config/agent-review/workspaces.json   { "workspaces": [{ "path": "/abs/repo", "name"?: "…" }] }
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

export type WorkspaceEntry = { path: string; name?: string };
export type Workspace = { key: string; name: string; path: string; branch?: string; registered: boolean };

export const registryFile = () =>
  process.env.AGENT_REVIEW_CONFIG ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "agent-review", "workspaces.json");

export function readRegistry(): WorkspaceEntry[] {
  try {
    const j = JSON.parse(readFileSync(registryFile(), "utf8")) as { workspaces?: WorkspaceEntry[] };
    return (j.workspaces ?? []).filter((w) => w && typeof w.path === "string");
  } catch {
    return [];
  }
}

function writeRegistry(ws: WorkspaceEntry[]) {
  const f = registryFile();
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, JSON.stringify({ workspaces: ws }, null, 2) + "\n");
}

/** The repository that contains `dir`: the nearest ancestor with a `.git` (folder, or file for worktrees). */
export function gitRoot(dir: string): string | undefined {
  let d = resolve(dir);
  for (;;) {
    if (existsSync(join(d, ".git"))) return d;
    const up = dirname(d);
    if (up === d) return undefined;
    d = up;
  }
}

/** Current branch, read from HEAD without spawning git. */
export function gitBranch(root: string): string | undefined {
  try {
    let gitDir = join(root, ".git");
    if (statSync(gitDir).isFile()) {
      const m = /gitdir:\s*(.+)/.exec(readFileSync(gitDir, "utf8"));
      if (!m) return undefined;
      gitDir = resolve(root, m[1]!.trim());
    }
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(head);
    return ref ? ref[1] : head.slice(0, 8);
  } catch {
    return undefined;
  }
}

/** Register the repository containing `path` (or `path` itself when it isn't in one). */
export function addWorkspace(path: string, name?: string): { entry: WorkspaceEntry; added: boolean } {
  const root = gitRoot(path) ?? resolve(path);
  const ws = readRegistry();
  const found = ws.find((w) => resolve(w.path) === root);
  if (found) {
    if (name && found.name !== name) {
      found.name = name;
      writeRegistry(ws);
    }
    return { entry: found, added: false };
  }
  const entry: WorkspaceEntry = name ? { path: root, name } : { path: root };
  writeRegistry([...ws, entry]);
  return { entry, added: true };
}

export function removeWorkspace(pathOrName: string): WorkspaceEntry | undefined {
  const ws = readRegistry();
  const abs = resolve(pathOrName);
  const i = ws.findIndex((w) => resolve(w.path) === abs || w.name === pathOrName || basename(w.path) === pathOrName);
  if (i < 0) return undefined;
  const [gone] = ws.splice(i, 1);
  writeRegistry(ws);
  return gone;
}

/**
 * Turn registered entries plus any extra roots into workspaces with unique, URL-safe keys.
 * An extra root that isn't a repo still becomes a workspace (named after its folder).
 */
export function resolveWorkspaces(extraRoots: string[]): Workspace[] {
  const out: Workspace[] = [];
  const seen = new Set<string>();
  const used = new Set<string>();
  const push = (path: string, name: string | undefined, registered: boolean) => {
    const p = resolve(path);
    if (seen.has(p) || !existsSync(p)) return;
    seen.add(p);
    const display = name ?? basename(p);
    let key = display.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    for (let i = 2; used.has(key); i++) key = `${key.replace(/-\d+$/, "")}-${i}`;
    used.add(key);
    out.push({ key, name: display, path: p, branch: gitBranch(p), registered });
  };
  for (const w of readRegistry()) push(w.path, w.name, true);
  for (const r of extraRoots) push(gitRoot(r) ?? r, undefined, false);
  return out;
}

/** The workspace a review folder belongs to: the deepest workspace path that contains it. */
export function workspaceOf(dir: string, ws: Workspace[]): Workspace | undefined {
  const d = resolve(dir);
  return ws
    .filter((w) => d === w.path || d.startsWith(w.path + "/"))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
