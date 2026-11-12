// `agent-review serve`: one local app for every review in every workspace (git repository).
import { watch, statSync, existsSync, type FSWatcher } from "node:fs";
import { resolve, relative } from "node:path";
import index from "./web/index.html";
import { discover, loadReview, loadView, safePath } from "./core/load";
import { readFeedback, addComment, setCommentStatus, setMark } from "./core/store";
import type { Comment, Mark, ReviewSummary } from "./core/types";
import { resolveWorkspaces, workspaceOf, type Workspace } from "./core/workspaces";

type Entry = { dir: string; ws?: string };
type Registry = Map<string, Entry>; // review key -> folder + workspace key

export async function serve(opts: { roots: string[]; port: number; host: string }) {
  // Workspaces are git repositories: the registered ones (~/.config/agent-review/workspaces.json)
  // plus any roots given on the command line. Both are re-read on every rescan.
  const extraRoots = opts.roots.map((r) => resolve(r));
  let workspaces: Workspace[] = [];
  let registry: Registry = new Map();

  const rescan = () => {
    workspaces = resolveWorkspaces(extraRoots);
    const next: Registry = new Map();
    for (const dir of discover(workspaces.map((w) => w.path))) {
      const ws = workspaceOf(dir, workspaces);
      const r = loadReview(dir);
      const base = "failed" in r ? relative(ws?.path ?? "/", dir).replace(/[^\w.-]+/g, "-") || "review" : r.key;
      let key = base;
      if (next.has(key) && ws) key = `${ws.key}-${base}`; // same id in two repos
      for (let i = 2; next.has(key); i++) key = `${base}-${i}`;
      next.set(key, { dir, ws: ws?.key });
    }
    registry = next;
  };
  rescan();

  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const notFound = (what: string) => json({ error: `${what} not found` }, 404);
  const dirFor = (key: string) => registry.get(key)?.dir;

  const summaries = (): ReviewSummary[] =>
    [...registry].map(([key, { dir, ws }]) => {
      const r = loadReview(dir);
      const fb = readFeedback(dir);
      let updatedAt = 0;
      try {
        updatedAt = statSync(`${dir}/review.json`).mtimeMs;
      } catch {}
      const failed = "failed" in r;
      return {
        key,
        dir,
        workspace: ws,
        title: failed ? dir.split("/").slice(-2).join("/") : r.title,
        status: failed ? "draft" : r.status,
        views: failed ? [] : r.views.map((id) => ({ id, title: r.viewTitles[id] ?? id })),
        updatedAt,
        openComments: fb.comments.filter((c) => c.status === "open" && c.author === "reviewer" && !c.parent).length,
        errors: r.issues.filter((i) => i.level === "error").length,
      };
    });

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.host,
    development: process.env.NODE_ENV !== "production" ? { hmr: true, console: true } : false,
    routes: {
      "/": index,
      "/r/*": index,
      "/api/reviews": () => {
        rescanAndSync(); // the home page should show a review the moment it exists
        const reviews = summaries();
        return json({
          workspaces: workspaces.map((w) => ({ ...w, reviews: reviews.filter((r) => r.workspace === w.key).length })),
          reviews,
        });
      },
      "/api/reviews/:key": (req) => {
        const dir = dirFor(req.params.key);
        if (!dir) return notFound("Review");
        const r = loadReview(dir);
        const ws = workspaces.find((w) => w.key === registry.get(req.params.key)?.ws);
        return json({ ...r, key: req.params.key, workspace: ws });
      },
      "/api/reviews/:key/views/:view": async (req) => {
        const dir = dirFor(req.params.key);
        if (!dir) return notFound("Review");
        return json(await loadView(dir, req.params.view));
      },
      "/api/reviews/:key/feedback": (req) => {
        const dir = dirFor(req.params.key);
        return dir ? json(readFeedback(dir)) : notFound("Review");
      },
      "/api/reviews/:key/comments": {
        POST: async (req) => {
          const dir = dirFor(req.params.key);
          if (!dir) return notFound("Review");
          const b = (await req.json()) as Partial<Comment>;
          if (!b.text?.trim() && b.kind !== "answer" && b.kind !== "verdict") return json({ error: "Empty comment" }, 400);
          if (!b.view) return json({ error: "view is required" }, 400);
          const c = addComment(dir, {
            author: "reviewer",
            view: b.view,
            node: b.node,
            variant: b.variant,
            kind: b.kind ?? "note",
            text: (b.text ?? "").trim(),
            parent: b.parent,
            choice: b.choice,
          });
          broadcast(req.params.key);
          return json(c, 201);
        },
      },
      "/api/reviews/:key/comments/:id/status": {
        POST: async (req) => {
          const dir = dirFor(req.params.key);
          if (!dir) return notFound("Review");
          const { status } = (await req.json()) as { status: Comment["status"] };
          setCommentStatus(dir, req.params.id, status === "resolved" ? "resolved" : "open");
          broadcast(req.params.key);
          return json({ ok: true });
        },
      },
      "/api/reviews/:key/marks": {
        POST: async (req) => {
          const dir = dirFor(req.params.key);
          if (!dir) return notFound("Review");
          const b = (await req.json()) as { key: string; mark: Mark | null };
          setMark(dir, b.key, b.mark);
          return json({ ok: true });
        },
      },
      "/api/reviews/:key/file": (req) => {
        const dir = dirFor(req.params.key);
        if (!dir) return notFound("Review");
        const p = new URL(req.url).searchParams.get("path") ?? "";
        const full = safePath(dir, p);
        if (!full || !existsSync(full)) return notFound("File");
        return new Response(Bun.file(full));
      },
    },
    fetch(req, srv) {
      if (new URL(req.url).pathname === "/ws" && srv.upgrade(req)) return;
      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        ws.subscribe("changes");
      },
      message() {},
    },
  });

  const broadcast = (key?: string) => server.publish("changes", JSON.stringify({ type: "changed", key }));

  // Live reload. Watch each review folder (small) rather than the roots (a workspace can be huge
  // and full of agent transcripts); find new or deleted reviews with a periodic rescan.
  const watchers = new Map<string, FSWatcher>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const keyOf = (dir: string) => [...registry].find(([, e]) => e.dir === dir)?.[0];
  const syncWatchers = () => {
    const dirs = new Set([...registry.values()].map((e) => e.dir));
    for (const [d, w] of watchers) if (!dirs.has(d)) (w.close(), watchers.delete(d));
    for (const d of dirs) {
      if (watchers.has(d)) continue;
      try {
        const w = watch(d, { recursive: true }, (_ev, file) => {
          if (file && /(^|\/)feedback\//.test(String(file))) return; // our own writes; we broadcast those already
          clearTimeout(timers.get(d));
          timers.set(
            d,
            setTimeout(() => {
              if (String(file).endsWith("review.json")) rescanAndSync();
              const k = keyOf(d);
              if (k) broadcast(k);
            }, 150),
          );
        });
        w.on("error", () => (w.close(), watchers.delete(d)));
        watchers.set(d, w);
      } catch (e) {
        console.warn(`Not watching ${d}: ${(e as Error).message}`);
      }
    }
  };
  const rescanAndSync = () => {
    const before = [...registry.keys()].join("|") + workspaces.map((w) => w.path + w.branch).join("|");
    rescan();
    syncWatchers();
    if ([...registry.keys()].join("|") + workspaces.map((w) => w.path + w.branch).join("|") !== before) broadcast();
  };
  syncWatchers();
  setInterval(rescanAndSync, 15_000);

  console.log(`agent.review  →  ${process.env.PORTLESS_URL ?? `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${server.port}`}`);
  console.log(`  ${registry.size} review${registry.size === 1 ? "" : "s"} in ${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}:`);
  for (const w of workspaces) console.log(`    ${w.name.padEnd(20)} ${w.path}${w.branch ? `  (${w.branch})` : ""}`);
  if (!workspaces.length) console.log(`  No workspaces yet. Add one: agent-review workspace add <repo>`);
  return server;
}
