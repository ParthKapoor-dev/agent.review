import { test, expect, describe } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { View } from "../src/core/schema";
import { resolveVariants, compare } from "../src/core/resolve";
import { loadView, validateDir } from "../src/core/load";
import { addComment, readFeedback, setCommentStatus, setMark } from "../src/core/store";

const view = (variants: unknown[]) =>
  View.parse({ id: "v", title: "V", frames: [{ id: "f", title: "F" }], variants });

const root = {
  id: "cur",
  label: "Current",
  kind: "current",
  nodes: [
    { id: "a", type: "step", frame: "f", title: "A", code: "select 1" },
    { id: "b", type: "step", frame: "f", title: "B" },
  ],
  edges: [{ from: "a", to: "b" }],
};

describe("resolveVariants", () => {
  test("child inherits, overrides, adds and removes", () => {
    const v = view([
      root,
      {
        id: "pro",
        label: "Proposed",
        kind: "proposed",
        extends: "cur",
        nodes: [{ id: "a", code: "select 2", change: "bind" }, { id: "c", type: "note", title: "C" }],
        edges: [{ from: "a", to: "c" }],
        remove: ["b", "a->b"],
      },
    ]);
    const { variants, issues } = resolveVariants(v, "v.json");
    expect(issues).toEqual([]);
    const pro = variants.find((x) => x.id === "pro")!;
    expect(pro.nodes.map((n) => n.id).sort()).toEqual(["a", "c"]);
    expect((pro.nodes.find((n) => n.id === "a") as { code: string }).code).toBe("select 2");
    expect(pro.edges.map((e) => e.id)).toEqual(["a->c"]);
  });

  test("the change note does not count as a content change, and is not inherited", () => {
    const v = view([
      root,
      { id: "p", label: "P", kind: "proposed", extends: "cur", nodes: [{ id: "b", change: "looked again" }] },
      { id: "q", label: "Q", kind: "iteration", extends: "p" },
    ]);
    const { variants } = resolveVariants(v, "v.json");
    const [cur, p, q] = variants;
    expect(p!.nodes.find((n) => n.id === "b")!.hash).toBe(cur!.nodes.find((n) => n.id === "b")!.hash);
    expect(q!.nodes.find((n) => n.id === "b")!.change).toBeUndefined();
  });

  test("reports unknown parents, cycles, bad nodes and dangling edges", () => {
    const v = view([
      { ...root, edges: [{ from: "a", to: "zz" }] },
      { id: "x", label: "X", kind: "proposed", extends: "y" },
      { id: "y", label: "Y", kind: "proposed", extends: "x" },
      { id: "z", label: "Z", kind: "proposed", extends: "nope", nodes: [{ id: "n", type: "bogus", title: "t" }] },
    ]);
    const msgs = resolveVariants(v, "v.json").issues.map((i) => i.message).join("\n");
    expect(msgs).toContain("Cycle");
    expect(msgs).toContain("Unknown parent variant 'nope'");
    expect(msgs).toContain("missing node");
  });

  test("exactly one root", () => {
    const v = view([root, { ...root, id: "cur2" }]);
    expect(resolveVariants(v, "v.json").issues[0]!.message).toContain("Exactly one variant");
  });
});

describe("compare", () => {
  test("added, removed, changed, same", () => {
    const v = view([
      root,
      {
        id: "p", label: "P", kind: "proposed", extends: "cur",
        nodes: [{ id: "a", code: "select 2" }, { id: "c", type: "note", title: "C" }],
        remove: ["b"],
      },
    ]);
    const [cur, p] = resolveVariants(v, "v.json").variants;
    const c = compare(p!, cur);
    expect(Object.fromEntries(c.nodes)).toEqual({ a: "changed", c: "added", b: "removed" });
    expect(c.counts).toEqual({ added: 1, removed: 1, changed: 1, same: 0 });
    expect(c.edges.get("a->b")).toBe("removed");
  });
});

describe("files", () => {
  const dir = mkdtempSync(join(tmpdir(), "ar-"));
  mkdirSync(join(dir, "views"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "assets", "q.sql"), "line1\nline2\nline3\nline4\n");
  writeFileSync(join(dir, "review.json"), JSON.stringify({ agentReview: 1, id: "r", title: "R", views: ["v"] }));
  writeFileSync(
    join(dir, "views", "v.json"),
    JSON.stringify({
      id: "v", title: "V",
      variants: [{ id: "a", label: "A", kind: "current", nodes: [{ id: "s", type: "step", title: "S", code: { file: "assets/q.sql", lines: "2-3" } }] }],
    }),
  );

  test("reads code file references and lays out every node", async () => {
    const { view: v, issues } = await loadView(dir, "v");
    expect(issues).toEqual([]);
    const s = v!.variants[0]!.nodes[0] as { code: { code: string; lang: string } };
    expect(s.code.code).toBe("line2\nline3");
    expect(s.code.lang).toBe("sql");
    expect(v!.layout.nodes.s).toBeDefined();
    expect(await validateDir(dir)).toEqual([]);
  });

  test("feedback: threads, status events and marks", () => {
    const c = addComment(dir, { author: "reviewer", view: "v", node: "s", kind: "question", text: "why?" });
    addComment(dir, { author: "agent", view: "v", node: "s", kind: "note", text: "because", parent: c.id });
    setCommentStatus(dir, c.id, "resolved");
    setMark(dir, "v/s", { state: "verified", hash: "abc", variant: "a", ts: "t" });
    const fb = readFeedback(dir);
    expect(fb.comments.find((x) => x.id === c.id)!.status).toBe("resolved");
    expect(fb.comments.filter((x) => x.parent === c.id)).toHaveLength(1);
    expect(fb.marks["v/s"]!.state).toBe("verified");
  });
});
