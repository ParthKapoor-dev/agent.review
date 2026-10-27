# agent.review

Review what an AI agent did on a canvas: the current flow, the proposal, what was actually built,
and every iteration after review, as **variants of one stable map**. Agents only write small JSON
config files; this app does the rest (layout, diffs between variants, review marks, comments).

Works for code and for non-code systems (low-code step chains, page builders, configs) because
cards hold steps, code, diffs, tests, decisions, claims and "not checked" lists, not just files.

```
bun install
bun run dev                      # serves ./examples on http://localhost:4477
bun src/cli.ts serve ~/work      # every review folder under ~/work
```

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

Design and research: `docs/DESIGN.md`, `docs/research/`.
