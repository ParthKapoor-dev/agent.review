# agent.review

Review what an AI agent did on a canvas: the current flow, the proposal, what was actually built,
and every iteration after review, as **variants of one stable map**. Agents only write small JSON
config files; this app does the rest (layout, diffs between variants, review marks, comments).

Works for code and for non-code systems (low-code step chains, page builders, configs) because
cards hold steps, code, diffs, tests, decisions, claims and "not checked" lists, not just files.

```
bun install
bun link                                  # puts `agent-review` on your PATH (undo: bun unlink)
agent-review workspace add ~/code/my-repo # a workspace is a git repository
agent-review up                           # → https://agent-review.localhost (with portless)
```

**Workspaces.** Each workspace is a git repository; the app shows every review inside each one,
grouped by repo with its current branch. The list lives in `~/.config/agent-review/workspaces.json`
and is re-read every 15 s, so `workspace add` / `rm` take effect without a restart. An agent's
`agent-review init` or `from-git` registers its repo automatically. `agent-review workspace ls`
shows what is registered.

**Starting.** `agent-review up` runs the app under [portless](https://portless.sh/) when it is
installed (`https://agent-review.localhost`), otherwise on `http://127.0.0.1:4477`. `serve` does
the same without portless and also takes extra roots as arguments or `AGENT_REVIEW_ROOTS`.
`bun run dev` serves only `./examples` with hot reload, for working on the app itself.

## How it works

```
any-folder/                      (often <project>/.agent-review/)
  review.json                    the agent writes: title, summary, status board, views, tour
  views/<id>.json                the agent writes: frames, and variants of cards + edges
  feedback/comments.jsonl        the app writes: your comments and answers
  feedback/marks.json            the app writes: what you marked seen / verified / flagged
```

A view's first variant is the root (usually `current`). Every other variant `extends` one and lists
only what differs: new or changed cards (by `id`), new edges, and `remove`. The app resolves the
chain, lays out the union of all variants once (so cards never move when you switch), and colours
what was added, changed or removed against whichever variant you compare with.

## For agents

```
agent-review guide               how to write a review (docs/AGENT_GUIDE.md)
agent-review schema view         JSON Schema for views/<id>.json
agent-review validate <dir>      check your files; errors name the file and field
agent-review comments <dir>      what the reviewer said (--json for tools)
agent-review reply <dir> <id> "…" [--resolve]
```

## Feedback reaches the agent by itself

`agent-review hooks` prints a Claude Code hooks config (Codex and Cursor use the same events).
With it, the agent gets new comments, answers and verdicts as context after its next tool call,
and is held from ending its turn while there is unread feedback. Each item is delivered once, and
the app marks it "seen by agent". Without hooks, the agent runs `agent-review comments`.

Design and research: `docs/DESIGN.md`, `docs/research/`.
