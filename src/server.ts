// `agent-review serve`: one local app for every review folder under the given roots.
import { watch, statSync, existsSync, type FSWatcher } from "node:fs";
import { resolve, relative } from "node:path";
import index from "./web/index.html";
import { discover, loadReview, loadView, safePath } from "./core/load";
import { readFeedback, addComment, setCommentStatus, setMark } from "./core/store";
import type { Comment, Mark, ReviewSummary } from "./core/types";

type Registry = Map<string, string>; // key -> dir

export async function serve(opts: { roots: string[]; port: number; host: string }) {
  const roots = opts.roots.map((r) => resolve(r));
  let registry: Registry = new Map();

  const rescan = () => {
    const next: Registry = new Map();
    for (const dir of discover(roots)) {
      const r = loadReview(dir);
      let key = "failed" in r ? relative(roots[0]!, dir).replace(/[^\w.-]+/g, "-") || "review" : r.key;
      for (let i = 2; next.has(key); i++) key = `${key.replace(/-\d+$/, "")}-${i}`;
      next.set(key, dir);
    }
    registry = next;
  };
  rescan();

  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const notFound = (what: string) => json({ error: `${what} not found` }, 404);
  const dirFor = (key: string) => registry.get(key);

  const summaries = (): ReviewSummary[] =>
    [...registry].map(([key, dir]) => {
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
        title: failed ? relative(roots[0]!, dir) || dir : r.title,
        status: failed ? "draft" : r.status,
        views: failed ? [] : r.views.map((id) => ({ id, title: r.viewTitles[id] ?? id })),
        updatedAt,
        openComments: fb.comments.filter((c) => c.status === "open" && c.author === "reviewer").length,
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
        return json({ roots, reviews: summaries() });
      },
      "/api/reviews/:key": (req) => {
        const dir = dirFor(req.params.key);
        if (!dir) return notFound("Review");
        const r = loadReview(dir);
        return json({ ...r, key: req.params.key });
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
  const keyOf = (dir: string) => [...registry].find(([, d]) => d === dir)?.[0];
  const syncWatchers = () => {
    const dirs = new Set(registry.values());
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
    const before = [...registry.keys()].join("|");
    rescan();
    syncWatchers();
    if ([...registry.keys()].join("|") !== before) broadcast();
  };
  syncWatchers();
  setInterval(rescanAndSync, 15_000);

  console.log(`agent.review  →  ${process.env.PORTLESS_URL ?? `http://${opts.host === "0.0.0.0" ? "localhost" : opts.host}:${server.port}`}`);
  console.log(`  ${registry.size} review${registry.size === 1 ? "" : "s"} under ${roots.join(", ")}`);
  return server;
}
