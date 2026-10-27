// Reviewer feedback lives next to the agent's files but in its own folder, written only by the app
// (and `agent-review reply`), so an agent rewriting its views never clobbers a comment.
//   feedback/comments.jsonl   append-only events
//   feedback/marks.json       per-card review state
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Comment, Feedback, Mark } from "./types";

type Event =
  | { op: "add"; comment: Omit<Comment, "status"> }
  | { op: "status"; id: string; status: Comment["status"]; ts: string }
  | { op: "delivered"; ids: string[]; ts: string };

const dirOf = (reviewDir: string) => join(reviewDir, "feedback");

export function readFeedback(reviewDir: string): Feedback {
  const comments = new Map<string, Comment>();
  const cf = join(dirOf(reviewDir), "comments.jsonl");
  if (existsSync(cf))
    for (const line of readFileSync(cf, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line) as Event;
        if (ev.op === "add") comments.set(ev.comment.id, { ...ev.comment, status: "open" });
        else if (ev.op === "status") {
          const c = comments.get(ev.id);
          if (c) c.status = ev.status;
        } else if (ev.op === "delivered") {
          for (const id of ev.ids) {
            const c = comments.get(id);
            if (c) c.deliveredAt = ev.ts;
          }
        }
      } catch {}
    }
  // A reply never stays "open" on its own; the thread root carries the status.
  for (const c of comments.values()) if (c.parent) c.status = "resolved";
  let marks: Record<string, Mark> = {};
  const mf = join(dirOf(reviewDir), "marks.json");
  if (existsSync(mf))
    try {
      marks = JSON.parse(readFileSync(mf, "utf8"));
    } catch {}
  return { comments: [...comments.values()], marks };
}

function append(reviewDir: string, ev: Event) {
  mkdirSync(dirOf(reviewDir), { recursive: true });
  appendFileSync(join(dirOf(reviewDir), "comments.jsonl"), JSON.stringify(ev) + "\n");
}

const newId = () => `c-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function addComment(reviewDir: string, c: Omit<Comment, "id" | "ts" | "status">): Comment {
  const comment = { ...c, id: newId(), ts: new Date().toISOString() };
  append(reviewDir, { op: "add", comment });
  return { ...comment, status: "open" };
}

export function setCommentStatus(reviewDir: string, id: string, status: Comment["status"]) {
  append(reviewDir, { op: "status", id, status, ts: new Date().toISOString() });
}

export const markKey = (view: string, node: string) => `${view}/${node}`;

export function setMark(reviewDir: string, key: string, mark: Mark | null) {
  const { marks } = readFeedback(reviewDir);
  if (mark) marks[key] = mark;
  else delete marks[key];
  mkdirSync(dirOf(reviewDir), { recursive: true });
  writeFileSync(join(dirOf(reviewDir), "marks.json"), JSON.stringify(marks, null, 2) + "\n");
}

/** Threads: roots with their replies, oldest first. */
export function threads(comments: Comment[]) {
  const roots = comments.filter((c) => !c.parent);
  return roots.map((r) => ({ ...r, replies: comments.filter((c) => c.parent === r.id) }));
}

/** Reviewer input an agent has not been handed yet: open threads, replies, answers, verdicts. */
export function undelivered(fb: Feedback): Comment[] {
  const byId = new Map(fb.comments.map((c) => [c.id, c]));
  return fb.comments.filter((c) => {
    if (c.author !== "reviewer" || c.deliveredAt) return false;
    const root = c.parent ? byId.get(c.parent) : c;
    return root?.status === "open";
  });
}

export function markDelivered(reviewDir: string, ids: string[]) {
  if (ids.length) append(reviewDir, { op: "delivered", ids, ts: new Date().toISOString() });
}
