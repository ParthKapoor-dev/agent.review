// `agent-review hook <event>`: called by an agent's hooks (Claude Code, Codex, Cursor share the shape).
// Hands the agent reviewer input it hasn't seen yet, once. Prints nothing when there is nothing new.
//   UserPromptSubmit / PostToolUse / SessionStart → additionalContext (read on the next model call)
//   Stop → {"decision":"block"} so the agent handles the feedback before ending its turn
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discover, loadReview } from "./core/load";
import { readFeedback, undelivered, markDelivered } from "./core/store";
import { hashOf } from "./core/resolve";
import type { Comment } from "./core/types";

const CACHE_MS = 60_000;

/** Review folders under cwd, cached briefly so a hook on every tool call stays cheap. */
function reviewDirsFor(cwd: string): string[] {
  const dir = join(tmpdir(), "agent-review");
  const file = join(dir, `dirs-${hashOf(cwd)}.json`);
  try {
    const c = JSON.parse(readFileSync(file, "utf8")) as { at: number; dirs: string[] };
    if (Date.now() - c.at < CACHE_MS) return c.dirs.filter((d) => existsSync(join(d, "review.json")));
  } catch {}
  const dirs = discover([cwd], 6);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ at: Date.now(), dirs }));
  } catch {}
  return dirs;
}

function line(c: Comment, all: Comment[]) {
  const where = [c.view, c.node, c.variant && `@${c.variant}`].filter(Boolean).join(" › ");
  const text = c.text ? `: ${c.text.replace(/\s+/g, " ").slice(0, 400)}` : "";
  if (c.kind === "answer") return `- ANSWER ${c.choice} on ${where}${text}`;
  if (c.kind === "verdict") return `- ${c.choice === "approve" ? "APPROVED" : "CHANGES REQUESTED"} ${where}${text}`;
  if (c.parent) {
    const root = all.find((x) => x.id === c.parent);
    return `- REPLY in thread [${c.parent}] (${root?.kind ?? "comment"} on ${where})${text}`;
  }
  return `- [${c.id}] ${c.kind.toUpperCase()} on ${where}${text}`;
}

export async function runHook(event: string) {
  let input: { cwd?: string; stop_hook_active?: boolean; hook_event_name?: string } = {};
  try {
    const raw = await Bun.stdin.text();
    if (raw.trim()) input = JSON.parse(raw);
  } catch {}
  const name = input.hook_event_name ?? event;
  if (/stop/i.test(name) && input.stop_hook_active) return; // never loop
  const cwd = input.cwd ?? process.cwd();

  const blocks: string[] = [];
  for (const dir of reviewDirsFor(cwd)) {
    const fb = readFeedback(dir);
    const fresh = undelivered(fb);
    if (!fresh.length) continue;
    const r = loadReview(dir);
    const title = "failed" in r ? dir : r.title;
    blocks.push(
      `Review "${title}" (${dir}): ${fresh.length} new from the reviewer\n${fresh.map((c) => line(c, fb.comments)).join("\n")}\n` +
        `Full threads: agent-review comments ${dir}. Act in a new variant (respondsTo the ids), then agent-review reply ${dir} <id> "what you did" --resolve.`,
    );
    markDelivered(dir, fresh.map((c) => c.id));
  }
  if (!blocks.length) return;
  const text = `agent.review — reviewer feedback arrived:\n\n${blocks.join("\n\n")}`;
  if (/stop/i.test(name)) console.log(JSON.stringify({ decision: "block", reason: text }));
  else console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: name, additionalContext: text } }));
}

export const HOOKS_SNIPPET = (bin: string) => ({
  hooks: {
    UserPromptSubmit: [{ hooks: [{ type: "command", command: `${bin} hook UserPromptSubmit` }] }],
    PostToolUse: [{ hooks: [{ type: "command", command: `${bin} hook PostToolUse` }] }],
    Stop: [{ hooks: [{ type: "command", command: `${bin} hook Stop` }] }],
  },
});
