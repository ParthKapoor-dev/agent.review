import { test, expect, beforeAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addWorkspace, gitBranch, gitRoot, readRegistry, removeWorkspace, resolveWorkspaces, workspaceOf } from "../src/core/workspaces";

const base = mkdtempSync(join(tmpdir(), "ar-ws-"));
const repoA = join(base, "alpha");
const repoB = join(base, "beta");

beforeAll(() => {
  process.env.AGENT_REVIEW_CONFIG = join(base, "workspaces.json");
  for (const r of [repoA, repoB]) mkdirSync(join(r, ".git"), { recursive: true });
  writeFileSync(join(repoA, ".git", "HEAD"), "ref: refs/heads/feature/x\n");
  mkdirSync(join(repoA, "tasks", "T1", "review"), { recursive: true });
  // a worktree: .git is a file pointing at the real git dir
  mkdirSync(join(base, "wt-gitdir"), { recursive: true });
  writeFileSync(join(base, "wt-gitdir", "HEAD"), "ref: refs/heads/wt-branch\n");
  mkdirSync(join(base, "wt"), { recursive: true });
  writeFileSync(join(base, "wt", ".git"), `gitdir: ${join(base, "wt-gitdir")}\n`);
});

test("gitRoot walks up to the repository; gitBranch reads HEAD, including worktrees", () => {
  expect(gitRoot(join(repoA, "tasks", "T1", "review"))).toBe(repoA);
  expect(gitBranch(repoA)).toBe("feature/x");
  expect(gitBranch(join(base, "wt"))).toBe("wt-branch");
});

test("adding a folder inside a repo registers the repo, once", () => {
  expect(addWorkspace(join(repoA, "tasks")).added).toBe(true);
  expect(addWorkspace(repoA).added).toBe(false);
  expect(readRegistry().map((w) => w.path)).toEqual([repoA]);
});

test("workspaces get unique keys; a review belongs to the deepest workspace containing it", () => {
  addWorkspace(repoB, "alpha"); // same display name as repoA
  const ws = resolveWorkspaces([]);
  expect(ws.map((w) => w.key)).toEqual(["alpha", "alpha-2"]);
  expect(workspaceOf(join(repoA, "tasks", "T1", "review"), ws)?.path).toBe(repoA);
  expect(workspaceOf(join(base, "elsewhere"), ws)).toBeUndefined();
});

test("removing by name or path leaves the files alone", () => {
  expect(removeWorkspace(repoB)?.path).toBe(repoB);
  expect(readRegistry().map((w) => w.path)).toEqual([repoA]);
});
