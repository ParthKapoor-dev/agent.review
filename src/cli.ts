#!/usr/bin/env bun
// agent-review: the app (serve) plus the verbs an agent needs (validate, comments, reply, init, schema, guide).
import { parseArgs } from "node:util";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { Review, View } from "./core/schema";
import { discover, validateDir } from "./core/load";
import { readFeedback, addComment, setCommentStatus, threads } from "./core/store";

const HELP = `agent-review — review an AI agent's work on a canvas

  serve [roots...]         Open the app for every review under the roots (default: .)
        --port 4477 --host 127.0.0.1
  validate [dir]           Check a review folder (or every review under dir)
  comments [dir]           What the reviewer said: open threads and answers
        --all              include resolved threads
        --json             machine-readable
  reply <dir> <id> <text>  Answer a thread as the agent
        --resolve          and mark it resolved
  resolve <dir> <id>       Mark a thread resolved (e.g. after a new variant addresses it)
  init [dir] --title "…"   Start a review folder with one view
  from-git [repo]          Build a "changes" view from a git diff (or add the next variant)
        --base HEAD        diff from (default HEAD; with --head, uses base...head)
        --head <rev>       diff to (default: the working tree, including new files)
        --out <dir>        review folder (default <repo>/.agent-review)
        --variant <id> --label "…" --kind actual|iteration|proposed|… --extends <id>
  schema [review|view]     Print the JSON Schema for review.json or views/<id>.json
  guide                    Print the authoring guide for agents (docs/AGENT_GUIDE.md)
`;

const reviewDirs = (target: string) => {
  const dir = resolve(target);
  if (existsSync(join(dir, "review.json"))) return [dir];
  if (existsSync(join(dir, ".agent-review", "review.json"))) return [join(dir, ".agent-review")];
  return discover([dir]);
};

const oneDir = (target: string) => {
  const dirs = reviewDirs(target);
  if (dirs.length !== 1) {
    console.error(dirs.length ? `Several reviews under ${target}; pass one:\n  ${dirs.join("\n  ")}` : `No review.json under ${target}`);
    process.exit(2);
  }
  return dirs[0]!;
};

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { values: o, positionals: p } = parseArgs({
    args: rest,
    allowPositionals: true,
    options: {
      port: { type: "string", default: process.env.PORT ?? "4477" },
      host: { type: "string", default: "127.0.0.1" },
      all: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      resolve: { type: "boolean", default: false },
      title: { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
      out: { type: "string" },
      view: { type: "string", default: "changes" },
      variant: { type: "string" },
      label: { type: "string" },
      kind: { type: "string" },
      extends: { type: "string" },
    },
  });

  switch (cmd) {
    case "serve": {
      const { serve } = await import("./server");
      await serve({ roots: p.length ? p : ["."], port: Number(o.port), host: o.host! });
      return;
    }
    case "validate": {
      const dirs = reviewDirs(p[0] ?? ".");
      if (!dirs.length) return fail(`No review.json under ${p[0] ?? "."}`);
      let errors = 0;
      for (const d of dirs) {
        const issues = await validateDir(d);
        const e = issues.filter((i) => i.level === "error").length;
        errors += e;
        console.log(`${e ? "✗" : "✓"} ${d}${issues.length ? "" : "  (no issues)"}`);
        for (const i of issues)
          console.log(`  ${i.level === "error" ? "error" : "warn "}  ${i.file.replace(d + "/", "")}${i.path ? ` › ${i.path}` : ""}: ${i.message}`);
      }
      process.exit(errors ? 1 : 0);
    }
    case "comments": {
      const dir = oneDir(p[0] ?? ".");
      const fb = readFeedback(dir);
      const ts = threads(fb.comments).filter((t) => o.all || t.status === "open");
      if (o.json) return console.log(JSON.stringify({ dir, threads: ts }, null, 2));
      if (!ts.length) return console.log("No open comments.");
      for (const t of ts) {
        const where = [t.view, t.node, t.variant && `@${t.variant}`].filter(Boolean).join(" › ");
        const head =
          t.kind === "answer" ? `ANSWER ${t.choice ?? ""}` : t.kind === "verdict" ? (t.choice === "approve" ? "APPROVED" : "CHANGES REQUESTED") : t.kind.toUpperCase();
        console.log(`[${t.id}] ${head}  ${where}  (${t.status})`);
        if (t.text) console.log(indent(t.text));
        for (const r of t.replies) console.log(`    ↳ ${r.author}: ${r.text.replace(/\n/g, "\n      ")}`);
        console.log();
      }
      return;
    }
    case "reply": {
      const [target, id, ...words] = p;
      if (!target || !id || !words.length) return fail("usage: agent-review reply <dir> <id> <text> [--resolve]");
      const dir = oneDir(target);
      const root = readFeedback(dir).comments.find((c) => c.id === id);
      if (!root) return fail(`No comment ${id}`);
      addComment(dir, { author: "agent", view: root.view, node: root.node, variant: root.variant, kind: "note", text: words.join(" "), parent: id });
      if (o.resolve) setCommentStatus(dir, id, "resolved");
      console.log(`Replied to ${id}${o.resolve ? " and resolved it" : ""}.`);
      return;
    }
    case "resolve": {
      const [target, id] = p;
      if (!target || !id) return fail("usage: agent-review resolve <dir> <id>");
      setCommentStatus(oneDir(target), id, "resolved");
      console.log(`Resolved ${id}.`);
      return;
    }
    case "init": {
      const dir = resolve(p[0] ?? ".agent-review");
      if (existsSync(join(dir, "review.json"))) return fail(`${dir}/review.json already exists`);
      mkdirSync(join(dir, "views"), { recursive: true });
      const title = o.title ?? "Untitled review";
      const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "review";
      writeFileSync(
        join(dir, "review.json"),
        JSON.stringify({ agentReview: 1, id, title, status: "draft", summary: "What this review is about, in plain words.", views: ["flow"] }, null, 2) + "\n",
      );
      writeFileSync(
        join(dir, "views", "flow.json"),
        JSON.stringify(
          {
            id: "flow",
            title: "Flow",
            frames: [{ id: "overview", title: "Overview" }],
            variants: [
              {
                id: "current",
                label: "Current",
                kind: "current",
                nodes: [{ id: "intent", type: "note", frame: "overview", title: "What this change is for", body: "Replace me." }],
              },
            ],
          },
          null,
          2,
        ) + "\n",
      );
      console.log(`Created ${dir}. Run: agent-review serve ${p[0] ?? "."}`);
      return;
    }
    case "from-git": {
      const { fromGit } = await import("./core/git");
      const repo = resolve(p[0] ?? ".");
      const out = resolve(o.out ?? join(repo, ".agent-review"));
      const vf = join(out, "views", `${o.view}.json`);
      const n = existsSync(vf) ? (JSON.parse(readFileSync(vf, "utf8")).variants?.length ?? 0) : 0;
      const kind = (o.kind ?? (n === 0 ? "actual" : "iteration")) as "actual";
      const r = await fromGit({
        repo,
        out,
        base: o.base,
        head: o.head,
        view: o.view!,
        variant: o.variant ?? (n === 0 ? "changes" : `iteration-${n + 1}`),
        label: o.label ?? (n === 0 ? "Changes" : `Iteration ${n + 1}`),
        kind,
        extends: o.extends,
      });
      console.log(`${r.files} files → ${r.viewFile} (variant ${r.variant}${r.extends ? `, extends ${r.extends}` : ""})`);
      console.log(`Next: retitle the cards to say what each change does, then: agent-review validate ${out}`);
      return;
    }
    case "schema": {
      const which = p[0] ?? "view";
      const schema = which === "review" ? Review : View;
      console.log(JSON.stringify(z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }), null, 2));
      return;
    }
    case "guide": {
      console.log(readFileSync(join(import.meta.dir, "..", "docs", "AGENT_GUIDE.md"), "utf8"));
      return;
    }
    default:
      console.log(HELP);
      if (cmd && cmd !== "help" && cmd !== "--help") process.exit(2);
  }
}

const indent = (s: string) => s.replace(/^/gm, "    ");
function fail(msg: string): never {
  console.error(msg);
  process.exit(2);
}

main();
