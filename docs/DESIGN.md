# agent.review — design proposal

Status: **proposal, not started.** Date: 2026-10-27.
Research behind it: `docs/research/01-comprehension-science.md` (how people understand systems),
`docs/research/02-tooling-landscape.md` (canvas.review internals, formats, libraries, products), and an
earlier private study of one reviewer's sessions plus the review / over-reliance literature.

## 1. The problem in one paragraph

Agents now produce more than a reviewer can understand in the time they have. Studies from 2025–26
say what review sessions show: agent output "seems kind of hidden", auto-accepting goes with
lower comprehension, and people want to stay in control instead of handing work off. In real
sessions the recurring problems are information dumps, questions before context, no status at a
glance, scope creep, and not being able to see *what changed between iterations*. canvas.review
solves part of this for GitHub PRs only: one diff, macOS only, and the app (not your agent) builds
the canvas. Nobody covers **"current flow → proposed → actual → iteration 2" as views of one stable
map**, for non-code systems like low-code step chains and page builders as well as git repos.

## 2. What the research says to do (and not do)

| # | Finding | Consequence for the app |
|---|---|---|
| 1 | A canvas *by itself* did not improve comprehension over tabs (ICSE 2023, n=20). Debugger Canvas helped only on long, layered, unfamiliar paths. | The value has to come from **what sits side by side**: variants on one stable map, test ↔ step ↔ diff links. Don't sell "spatial" as the feature. |
| 2 | Nearness is read as "related" (Codemap). | Layout comes from the edges (ELK layered), never from arbitrary placement. |
| 3 | Stable layout across versions speeds orientation (Misue mental map). | **One layout for all variants.** Lay out the union of every variant's nodes once; switching variant recolours, never moves. |
| 4 | Plain side-by-side diagram diffs did poorly; an explicit difference layer was preferred (Zaman 2011). Short prose summaries can beat graph diffs (Störrle 2013). | Default compare = **overlay** (added / removed-ghost / changed badges) + a one-line "what changed" per card. Side-by-side lanes are secondary. |
| 5 | Overview first, zoom and filter, details on demand; martini glass (author-driven intro, then free exploration). | Open on a **change map + intent**, then an optional agent-written **tour**, then free roam. Semantic zoom: System → Flow → Step → Body. |
| 6 | Navigation follows "scent" (descriptive labels). | Every card title is a plain sentence of what it does ("Rejects raw SQL, accepts a list of ids"), not an id. |
| 7 | Auto-creating new canvases = clutter (Debugger Canvas's top complaint). | One review space per task; new views only when the agent or you ask. |
| 8 | Explanations raise acceptance whether right or wrong; commit-before-seeing reduces over-reliance. | Claims carry evidence + confidence; a **"not verified"** list is a first-class card; tests show expected vs actual with evidence. |
| 9 | Reviewed marks must reset when the thing changes (GitLab, Reviewable). | Per-card review state stores a content hash; changed in a later variant → back to "unreviewed". |
| 10 | Comments must reach the agent and the answer must come back (canvas.review, Reviewable). | Comments live in a file the agent reads; a new variant says which comments it `respondsTo`, shown as threads resolved by that iteration. |

Weak spots, honestly: there is no study of visual review of low-code step graphs, and none comparing
guided tours with free exploration. So we should test early with a planted defect (section 9).

## 3. Core concepts

```
Review   (a ticket / PR / task)         .agent-review/review.json
 └─ View  (one map: "Document correction flow", "Tests", "Change map")
     ├─ base        the cards + edges every variant starts from
     └─ variants[]  current · proposed · actual · iteration-2 …
                    each = { extends: <variant>, patch: add / update / remove by id }
Comments            .agent-review/comments.jsonl   (written by the app only)
Review marks        .agent-review/marks.json       (written by the app only)
```

- **Variant = base + patch**, borrowed from D2's `scenarios`/`steps`. A variant can extend another
  (iteration-2 extends actual). Because nodes keep ids across variants, the app can compute what
  was added, removed and changed automatically. The agent never draws a diff by hand.
- **Kinds of variant:** `current`, `proposed`, `actual`, `iteration`, `alternative` (for "option A vs
  B" before a decision). The kind decides the colour and the default comparison (proposed vs current,
  actual vs proposed, i2 vs i1).
- **Agent files vs human files are separate.** The agent rewrites view files freely; your comments and
  marks are never overwritten.

## 4. Card types (one set for code and non-code systems)

| Card | Holds | Covers |
|---|---|---|
| `note` | Markdown | intent, background, "in plain words" |
| `step` | title, in/out, code or config body, language | a low-code step, a function, a page component, a SQL query |
| `diff` | a git patch, or before/after text, or before/after JSON | code, step SQL/JS, page JSON |
| `test` | inputs, expected, actual, status, evidence (log, screenshot path, run id) | test cases and dev runs |
| `question` | question, options, recommended, your answer | canvas.review "flags", decisions by letter |
| `claim` | statement, confidence, evidence refs | "Checked in source" vs "Inferred" |
| `unverified` | what the agent did not check, and why | calibrated trust |
| `diagram` | Mermaid source | sequence diagrams inside a card |
| `table`, `image`, `link` | as named | DB rows, screenshots, ticket links |

Groups and **frames** (the numbered columns in canvas.review: Overview, Main change, Logic, Tests,
Docs) are part of the view. Edges have a label ("calls", "reads", "on error").

**Content sources:** inline (the agent pastes it), `file` (path + optional line range or regex
anchor, CodeTour-style), or `git` (rev + path, or a rev range for a patch). Low-code content comes in
as exported JSON files, so v1 needs no platform adapter; an adapter API can come later.

## 5. The screen

```
┌ Review: REF-112 · refunds ─────────────── [current|proposed|actual|i2] ▾ compare: overlay ─┐
│ Views: ▸ Change map  ▸ Correction flow  ▸ Tests  ▸ Work done          3 open · 1 blocking   │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│  ① Overview      ② Main change            ③ Logic               ④ Tests        ⑤ Not checked │
│  ┌────────┐     ┌─────────────────┐ calls ┌──────────────┐     ┌───────┐                  │
│  │ intent │     │ ~ Build filter  │──────▶│ + Validate ids│     │ ✓ n10 │                  │
│  └────────┘     │   from id list  │       └──────────────┘     │ ✗ r3  │                  │
│                 └─────────────────┘       ┌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┐      └───────┘                  │
│                                           ╎ − raw SQL in ╎ (ghost: removed)                 │
│                                           └╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘                         [minimap]│
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ tour 2/7: "The browser no longer sends SQL…"  ←→ move · 1-9 frame · ⏎ open · c comment · / │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Opening a card expands it in place (diff with collapsed unchanged lines, `@pierre/diffs`), with
  comments anchored to the card or to a line.
- **Compare modes:** single variant · overlay (default) · side-by-side lanes with synced pan/zoom ·
  change list (text). Small multiples rather than animation when there are more than two variants.
- Per card: review state (unseen / skimmed / verified / commented), reset on content change.
- Header: comment counts by state (blocking / question / nit), tests passing, cards left to review.
- Keyboard first, matching what you liked in the demo: arrows between frames, 1–9 jump, ⏎ open,
  `c` comment, `v` cycle variant, `/` search, `esc` back to overview.

## 6. How an agent uses it (any agent, any project)

```
your-project/.agent-review/
  review.json            title, links, status board, ordered view list, tour
  views/<id>.view.json   frames, base cards/edges, variants
  assets/                exported JSON, screenshots, logs the cards reference
  comments.jsonl         ← app writes (your comments, agent replies)
  marks.json             ← app writes (your review state)
```

- `agent-review serve [dir]` opens the app on localhost; it watches the folder and live-reloads
  when the agent edits a view.
- `agent-review validate` checks the files against the schema (dangling edge ids, unknown variant
  parents, missing files) with errors an agent can act on.
- `agent-review comments --open --json` lets the agent read what you asked; `agent-review reply`
  answers a thread.
- An MCP server exposes the same verbs, for agents that prefer tools.
- A `SKILL.md` teaches the format. It works in Claude Code, and also in Codex and Gemini via
  AGENTS.md/GEMINI.md.
- Nothing leaves the machine. That matters for client data.

Pushing a comment straight into a live terminal session is canvas.review's best trick, but no
mechanism works across agents. Leave it as an optional adapter later.

## 7. Stack

Bun (`Bun.serve`, `fs.watch`, websocket, single binary via `bun build --compile`) · React · React
Flow 12 (MIT) · elkjs layered layout in a Web Worker (EPL-2.0) · `@pierre/diffs` 1.6.2 (Apache-2.0)
for diffs · `jsondiffpatch` for JSON/low-code diffs · Mermaid for in-card diagrams · Zod schema
exported as JSON Schema · MCP TypeScript SDK. Avoid tldraw (source-available, needs a license key)
and Monaco-per-card (too heavy).

## 8. Build plan

**M1, walking skeleton (the thing to judge).**
Schema + `validate`; `serve` with live reload; frames + ELK layout; cards `note`, `step`, `diff`,
`test`, `question`, `unverified`; variants with stable union layout and overlay colouring; variant
switcher; comments to `comments.jsonl`; `comments --json`. Two real examples: a low-code step chain
(a real internal ticket, kept outside this repo) and one small git change.

**M2, reviewing well.** Side-by-side and change-list compare modes; agent tour; review marks with
hash reset; `respondsTo` threads across iterations; search; minimap; full keyboard map; semantic
zoom.

**M3, reach.** MCP server; git symbol resolution; `claim`/`diagram`/`table` cards; static export
(one HTML file you can share or publish); JSON Canvas export; SKILL.md for other agents.

## 9. How we'll know it works

Take one real ticket and plant two defects in the agent's "actual" variant: one in logic, one out of
scope. Review it once with the canvas and once with the usual markdown + diff. Count time to find
both and how many you find. If the canvas doesn't win, the research says it may not, and we
change course before M2.

## 10. Open decisions

- **A. Where it runs.** (a) local only: `agent-review serve` per project *(recommended for M1)*;
  (b) also a static HTML export for sharing in M3; (c) hosted multi-user. Later, if ever.
- **B. Who builds the view.** (a) your agent writes the view files, guided by the skill
  *(recommended: works for low-code systems, no extra model cost)*; (b) the app calls a model itself like
  canvas.review (git only).
- **C. First real example.** (a) a real internal low-code ticket
  *(recommended)*; (b) a different ticket you name.
- **D. Name / repo.** Keep `agent.review` as the repo and `agent-review` as the CLI?
