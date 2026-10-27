# 02 — Tooling landscape for an agent-authored review canvas

Researched 2026-10-27. Versions and licenses for npm packages come from `registry.npmjs.org/<pkg>/latest`
on that date. Claims about closed products come from their public pages and are marked as such.

---

## 1. canvas.review in depth

**URLs:** https://canvas.review/ · https://canvas.review/how-it-works/ · https://canvas.review/demo · https://x.com/canvasdotreview
**License:** closed source, a signed and notarised macOS app (team ID `LPV78GHYTM`). No GitHub or npm presence, no docs, no
pricing page. `/docs`, `/pricing`, `/llms.txt`, `/robots.txt` and `/sitemap.xml` all fall through to the SPA shell.

### What it is
A **Mac menu-bar app** that reviews **GitHub PRs only**. Its tagline is "read a pull request in the order its logic runs. comment,
approve, post to github." It supports Claude Code, Codex, Gemini CLI, Cursor and opencode as the "brain", and lists Claude Desktop,
Codex, herdr, Ghostty, Superset and Cursor as surfaces it works from.

### Architecture (from /how-it-works)
- The menu-bar app starts **one `canvas.review` CLI process per PR**. Each one is a local web server at `localhost:47831`
  that serves the canvas to your browser. A review link has the form `canvas.review/<owner>/<repo>/pull/<n>`, and the public
  site forwards it to the local app when that app is running.
- GitHub access goes through **your own `gh`**. The token is held in memory and never given to the agent.
- **The app, not your agent session, generates the canvas.** It runs your agent CLI headless to "ask for summaries and checks".
  Summaries run in an empty temp folder, and Claude Code gets no tools for them. The demo graph records
  `cost: {model:"sonnet", inputTokens:34811, outputTokens:2229, usd:0.16, seconds:5}`.
- **Agent discovery:** it reads session files in `~/.claude/sessions` and `~/.config/canvasreview/sessions`. For each agent
  you enable, it **installs a hook** that hands the agent the review link when a prompt or a `gh pr create` names a PR.
- **"Send to terminal":** this pushes a comment or check into the live agent session working on that PR, and the session's
  answer shows up in the canvas. There is also "Copy for terminal", which copies the PR, the lines and the thread. Nothing is
  sent without a click.
- **Fix:** an agent edits a separate checkout in `~/.cache/canvasreview` inside a macOS sandbox, using per-agent flags
  (Codex `--sandbox workspace-write`, Gemini `auto_edit`, Claude Code edit-only with no shell). You accept or discard the diff
  before it is pushed. An optional remote SSH host can run fixes.
- **Guided previews:** a headless browser walks the PR's deploy preview, with the agent choosing each step from the page text,
  and records a video.
- **Sharing:** summaries, order and checks (never the code) go to a **secret gist** on your account. Share links look like
  `/share#c=…`.
- Bot comments (CodeRabbit, Greptile, Devin Review, Bugbot, Copilot) are pulled into the same canvas through GitHub.

### Data model (reverse-read from the public `https://canvas.review/graph.json` and `demo.json`)
The front end is React + **@xyflow/react** (React Flow attribution strings are in the bundle). The local API includes
`api/store`, `api/ask/:id`, `api/fix/:job`, `api/sessions`, `api/share`, `api/walk/run` and `api/preview/*`.
`graph.json` has this top-level shape:

```
repo, range, title, url, summary, generatedAt, agent{id,name}, cost{...}
stats{files,additions,deletions}, files[{path,additions,deletions}]
entry: "path#Symbol"                       // where reading starts
order: ["path#Symbol", ...]                // linear reading order (drives arrows / 1-10 keys)
threads: [{title, frames:[id], steps:[{tag:"MAIN CHANGE"|"LOGIC"|..., title, short, desc, frames:[id]}]}]
frames: [{id:"path#Symbol", file, lang, declaration, startLine, endLine,
          code /* full text with +/- prefixes */, changedLines[], left[], moved, pieces,
          header /* one-line claim */, headerOk, about{lead, points[]},
          callers, callerKeys,               // "Unchanged callers"
          rail:[{concern, custom, p /*confidence*/, anchor, lines[], kind:"open",
                 question, claim, happens, cause, confirm}] }]   // the "flagged"/"to check" items
edges: [{from, to, label:"calls", p, site{from,to,name{row,col,len}}}]
beforeAfter: {before:{diagram /* ASCII tree */, note}, after:{diagram, note}}
```
`demo.json` holds the raw GitHub review/issue comments and thread-resolution state. Comments stay in GitHub's model.

**Takeaways:**
- A frame is a **code declaration** (a symbol), not a file. Columns are `threads[].steps[].tag` (Overview, Main change, Logic,
  Tests, Docs).
- The LLM writes only the **semantic layer**: headers, about text, step grouping and rail questions. The **app computes code,
  line numbers and edges itself**, probably with a parser and call-site lookup.
- "Before/after" is just two ASCII diagrams. There is no structured current-flow graph.

### What it does NOT do (our opening)
1. It is **Mac only, closed source, and GitHub PR only**. There is no Linux or Windows build, no self-hosting, no
   GitLab or Bitbucket, and nothing for local uncommitted work.
2. **It covers code only.** Low-code step chains, UI page builders and config-only systems are not handled.
3. **There are no variants or iterations.** Each canvas is one snapshot of one PR head. You can't compare proposal 1 with
   proposal 2, or see a plan next to what was actually built.
4. **There is no "proposed change" stage.** It reviews after the code is written, not the plan.
5. **The agent session can't author or update the view.** The app owns generation. Your agent only receives links and
   messages.
6. **There is no open file format or schema**, so other tools can't produce or consume canvases.
7. **The feedback channel is proprietary.** It relies on hooks and terminal injection. There is no MCP tool the agent can
   poll for comments.

---

## 2. Open canvas/diagram formats an agent could write

| Format | URL / license | LLM authoring | Auto-layout | Groups | Labelled edges | Variants | Verdict |
|---|---|---|---|---|---|---|---|
| **JSON Canvas 1.0** | https://jsoncanvas.org/spec/1.0/ (spec is MIT on GitHub, by Obsidian) | Easy: 4 node types (`text`,`file`,`link`,`group`) and edges (`fromNode`,`toNode`,`fromSide`,`label`,`color`) | **None.** `x,y,width,height` are required integers, so the LLM has to invent coordinates | `group` node by geometric containment only (no parent id) | yes | no | **Borrow** as an *export* target (Obsidian interop) and for its naming. **Avoid** as the authoring format, because LLMs are bad at pixel coordinates. |
| **OCIF v0.7** (Open Canvas Interchange Format, 2026-03-24) | https://spec.canvasprotocol.org · github.com/ocwg | Medium: generic nodes + `@ocif/*` extensions | no | `parent` property, parent-relative coordinates | edges are a node extension | no | **Watch.** It is the interop successor to JSON Canvas ("JSON Canvas 2.0") but still pre-1.0. |
| **tldraw `.tldr`** | https://tldraw.dev (source-available, see §3) | Hard: a store snapshot of records (shapes, bindings, pages, schema versions) | no | frames/groups | arrows + bindings | pages | **Avoid** as the authoring format. |
| **Excalidraw JSON** | https://github.com/excalidraw/excalidraw (MIT) | Hard: verbose per-element geometry (`boundElements`, `groupIds`, seeds) | no (there is `@excalidraw/mermaid-to-excalidraw`) | `groupIds`, frames | arrows bound to elements | no | **Avoid** for authoring. It is a whiteboard, not structured data. |
| **Mermaid** | https://mermaid.js.org (MIT, v12.2.0) | **Best.** Huge training corpus; flowchart/sequence/state | yes (dagre; ELK via `@mermaid-js/layout-elk`) | `subgraph` | yes | no | **Borrow** as a *node content type* (sequence diagrams inside a card, like CodeRabbit) and as an import path. **Avoid** as the canvas model: it renders static SVG, and cards can't hold diffs. |
| **D2** | https://d2lang.com (MPL-2.0; `@terrastruct/d2` WASM 0.1.33) | Good, clean syntax | yes (dagre, ELK; TALA is proprietary) | containers | yes | **yes:** `layers` (no inherit), `scenarios` (inherit base), `steps` (inherit previous) | **Borrow the composition semantics**, which are exactly our variant/iteration model. Avoid the runtime, because the Go/WASM layout is heavy and the output is SVG. |
| **Structurizr DSL (C4)** | https://docs.structurizr.com/dsl (Apache-2.0) | Good, but needs model + views | yes | software system / container / component nesting | relationships with descriptions | multiple *views* over one *model* | **Borrow** the idea of **one model with many views**. Avoid the Java tooling. **LikeC4** (https://likec4.dev, MIT, `@likec4/core` 1.60) is the TS-native alternative, and it renders with React Flow. |
| **ELK JSON** | https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html (EPL-2.0) | Medium: `children`, `edges{sources[],targets[]}`, `ports`, `labels`, `layoutOptions` | **it *is* the layout input** | nested `children` = real hierarchy | yes | no | **Borrow** as the internal layout IR. The app converts the view config to ELK JSON. Don't make the agent write it. |
| **VS Code CodeTour `.tour`** | https://github.com/microsoft/codetour (MIT) | Easy: `steps[{file, line|pattern|selection, title, description}]` | n/a (linear) | no | no | `nextTour` chaining | **Borrow** `pattern` anchors (regex instead of line numbers, so they survive edits) and the "ordered tour" concept. |

**Bottom line:** none of these formats covers *semantic review content + variants + auto-layout*. Invent a small
**coordinate-free** semantic format (§7). Lay it out with ELK and export JSON Canvas or Mermaid for interop.

---

## 3. Rendering / layout libraries

| Library | URL | License | Version / size | Notes | Verdict |
|---|---|---|---|---|---|
| **@xyflow/react (React Flow 12)** | https://reactflow.dev | **MIT** (paid "Pro" only for examples and support) | 12.12.0, ~1.2 MB unpacked | Custom React nodes (any HTML, so diffs work), **subflows** via `parentId` + `extent:'parent'`, `<MiniMap>`, `<Controls>`, `<NodeToolbar>`, `fitView`/`setCenter` for keyboard nav, `onlyRenderVisibleElements` for large graphs. Mark interactive regions inside nodes with `nodrag nowheel nopan`. canvas.review and LikeC4 both use it. | **Borrow.** Primary renderer. |
| **elkjs** | https://github.com/kieler/elkjs | **EPL-2.0 OR GPL-3.0** (weak copyleft, fine as an unmodified dependency) | 0.12.0, ~1.4 MB min | The only React Flow-recommended layout that handles **dynamic node sizes + subflows + edge routing**. Async, so run it in a Web Worker. Layered algorithm with `elk.partitioning` gives "columns of frames". | **Borrow.** Lay out once per view or variant and cache positions. |
| **@dagrejs/dagre** | https://github.com/dagrejs/dagre | MIT | 3.1.3, ~40 KB | Fast and simple. Weak on compound graphs (edges leaving a subflow). | Fallback/quick mode. |
| **tldraw SDK** | https://tldraw.dev/community/license | **Source-available, not OSI.** Production needs a license key: commercial (sales-quoted), 100-day trial (phones home), or discretionary hobby license *with watermark*. Downstream users of an OSS project need their own key. | 5.5.2, ~15 MB | Best freeform whiteboard UX and a custom-shape API. | **Avoid** for an "open, usable by anyone" app because of the license. Borrow its UX ideas (frames, zoom-to-fit). |
| **Excalidraw** | https://github.com/excalidraw/excalidraw | MIT | 0.18.1, ~47 MB unpacked | Embeddable whiteboard, hand-drawn style. Embedding React cards with diffs is awkward. | **Avoid** as the main canvas. Possibly offer a "sketch" annotation layer later. |
| **Konva / react-konva** | https://konvajs.org | MIT | 10.9.0 | Canvas2D scene graph, very fast, but **no DOM inside nodes**, so you'd reimplement text selection and diff rendering. | **Avoid** for cards. |
| **PixiJS** | https://pixijs.com | MIT | 8.22.0 | WebGL, fast for 10k+ sprites. Same no-DOM problem. | **Avoid.** |
| **d3-zoom** | https://d3js.org/d3-zoom | ISC | 3.0.0, tiny | Raw pan/zoom on a DOM transform. React Flow already uses d3-zoom internally. | Only if dropping React Flow. |
| **react-zoom-pan-pinch** | https://github.com/BetterTyped/react-zoom-pan-pinch | MIT | 4.2.0 | Pan/zoom wrapper with no graph model. | Avoid. |

**Hundreds of nodes with diffs inside:** DOM-based nodes are required, because you need text selection, comment
anchors and copy-paste. The usual approach:
1. `onlyRenderVisibleElements` plus memoised node components.
2. **Level-of-detail by zoom**: below ~0.5x, render only title, +/- counts and badges. Mount the diff component only when
   zoomed in or the card is expanded (`useStore(s => s.transform[2])`).
3. Collapse unchanged lines ("N unchanged lines").
4. Highlight in a worker.

canvas.review gets acceptable performance this way with ~10 to 30 frames. For hundreds of nodes, LOD is mandatory.

---

## 4. Diff rendering inside canvas cards

| Library | URL | License | Version | Fit inside cards | Verdict |
|---|---|---|---|---|---|
| **@pierre/diffs** | https://diffs.com · github.com/pierrecomputer/pierre | **Apache-2.0** | 1.6.2 | Verified in the package's `dist/`: React `FileDiff`, `MultiFileDiff`, `PatchDiff`, `File`; `parsePatchFiles` (raw `git diff` text); `lineAnnotations` + `renderAnnotation` (inline comment threads); `hunkSeparators` / `expandUnchanged` ("N unchanged lines"); `Virtualizer`, `VirtualizedFileDiff`; `WorkerPoolManager` / `WorkerPoolContext` (Shiki off the main thread); SSR folder; line selection; split/unified; **Shadow DOM** (styles isolated from the canvas). | **Borrow.** It is the best match: each card is a `PatchDiff`, and comments are annotations. |
| **Shiki** | https://shiki.style | MIT | 4.5.0 | Highlighter only (used by @pierre/diffs). Use it directly for non-diff code/config cards. | Borrow (indirectly). |
| **git-diff-view** | https://github.com/MrWangJustToDo/git-diff-view | MIT | `@git-diff-view/react` 0.1.8 | React/Vue/Solid/Svelte, line widgets, Shiki/lowlight, worker support, SSR. Still 0.1.x, ~740 stars. | Backup option. |
| **react-diff-view** | https://github.com/otakustay/react-diff-view | MIT | 3.3.3 | Mature, widgets per change, bring-your-own tokenizer. | Backup option. |
| **diff2html** | https://diff2html.xyz | MIT | 3.4.56 | Generates an HTML string from unified diff. No React, no annotations, global CSS. | **Avoid** in cards. Fine for static export. |
| **Monaco diff editor** | https://microsoft.github.io/monaco-editor | MIT | 0.57.0, ~100 MB unpacked | One heavy instance per card is far too costly for hundreds of cards. | **Avoid** in cards. Use it only in a full-screen "open card" modal, if at all. |
| **@codemirror/merge** | https://github.com/codemirror/merge | MIT | 6.12.3, small | Light, editable, unified or side-by-side. Lighter than Monaco but still one editor per card. | Use for the **editable** card view (e.g. editing a config). |

For non-code systems (low-code step chains, page builders), use **structured diffs** rather than text diffs: JSON/YAML
canonicalised and diffed per key (e.g. `jsondiffpatch`, MIT), plus before/after screenshots. The card component should
accept `kind: text-diff | json-diff | image-diff | graph-diff`.

---

## 5. Adjacent products: what to borrow

| Product | URL | License | Borrow | Avoid |
|---|---|---|---|---|
| **CodeRabbit** walkthrough + **Change Stack** | https://docs.coderabbit.ai/pr-reviews/walkthroughs · /pr-reviews/change-stack | SaaS | Mermaid **sequence diagrams** for interaction changes. Change Stack's **numbered layers** in explanation order with **explicit dependencies between layers**, summaries anchored to **line ranges**, and **snapshots per head commit** (a stale snapshot is shown as stale). | Its framing of model grouping as authoritative. Change Stack itself says grouping may change on regeneration. |
| **Devin Review** (Jan 2026) | https://docs.devin.ai/work-with-devin/devin-review | SaaS, free for public GitHub | Groups hunks logically with an explanation per group. **Copy/move detection.** Bug flags with **severity × confidence** (Severe/Non-severe; Investigate/Informational). Chat that proposes an edit you then apply. | Lock-in to its ACU billing. |
| **Cursor Bugbot** | https://cursor.com/bugbot | SaaS | A **"Fix in Cursor / Fix in Web"** button on each finding hands the finding to an agent with context. This is the same loop as canvas.review's "Send to terminal". | |
| **Graphite** (bought by Cursor 2025-12-19) | https://graphite.dev | SaaS | Stacked PRs: a change as an ordered stack of small reviewable units. Map stack entries to frames/columns. | Variants are not stacks. Stacks are sequential dependencies, variants are alternatives. Model both. |
| **Reviewable** | https://reviewable.io | SaaS | **Diff between any two revisions** (r1→r3), a per-file **reviewed marker that carries across revisions**, and discussion **dispositions** (blocking/working/satisfied). These carry over directly to variant-to-variant review and comment state. | Dense UI. |
| **GitHub Copilot code review / coding agent / canvases** | https://github.blog/ai-and-ml/github-copilot/how-to-build-interactive-experiences-with-canvases/ (2026-07-21) | SaaS | Canvases where the agent updates the surface live and "interactions can be sent back to the agents *or* processed locally". | Copilot Workspace (retired 2025-05-30) showed that a spec→plan→code UI separate from the editor struggled. Ours sits beside the agent's own terminal. |
| **Cursor Canvas** + `pr-review-canvas` skill | https://cursor.com/blog/canvas · github.com/cursor/plugins (`cursor-team-kit/skills/pr-review-canvas`) | Cursor-only. Plugin repo is public. | The **skill pattern**: the skill fetches the PR via `gh`, the agent writes annotations, a script renders HTML and serves it locally, and core changes are split from mechanical ones. | Ad-hoc HTML per run with no stable schema. |
| **CodeSee** | https://codesee.io | Acquired by GitKraken 2024-05-14 and folded into GitKraken DevEx | Codebase maps, and a "review map" showing changed files in their dependency context. | Standalone code maps didn't survive as a business, so keep maps scoped to *the change*, not the whole repo. |
| **Swimm** | https://swimm.io | SaaS | Docs coupled to code snippets with **drift detection**: anchors re-checked when code changes. Apply this to view anchors. | |
| **Sourcegraph / SCIP** | https://sourcegraph.com · https://github.com/sourcegraph/scip (Apache-2.0) | Mixed | Precise "unchanged callers" / references (canvas.review shows these). Use LSP or tree-sitter locally rather than a server. | Server dependency. |
| **VS Code CodeTour** | https://github.com/microsoft/codetour | MIT | Ordered steps, regex `pattern` anchors. | |
| **Claude Code plan mode** | https://code.claude.com/docs | — | The agent produces a plan before editing. That plan is our **"proposed change"** variant, with the actual change as a later variant of the same view. | |
| **Conductor** / **Superset** | https://conductor.build (closed, free, Apple Silicon) · https://superset.sh (Apache-2.0) | — | Agent managers that run N agents in N worktrees with a diff viewer each. They are natural *hosts* for our view (canvas.review already integrates with Superset). Parallel agents produce natural **variants**. | Competing with them. Integrate instead. |
| **OpenHands Agent Canvas**, **Retune**, **Pencil** | https://docs.openhands.dev · (2026 blog mentions) | OpenHands MIT | Pencil and Retune: a local MCP server lets Claude Code, Cursor and Codex read/write canvas files directly. This validates the MCP + file approach. | |

---

## 6. Agent ↔ app integration patterns

| Pattern | Claude Code | Codex CLI | Gemini CLI | Cursor | Notes |
|---|---|---|---|---|---|
| **Write files to a watched dir** (`.agent-review/views/*.json`) | ✅ | ✅ | ✅ | ✅ | Any agent that can write files works, with no install. The app uses `fs.watch` plus schema validation. Lowest common denominator, and git-diffable. |
| **CLI** (`agent-review validate / open / comments --json / reply`) | ✅ | ✅ | ✅ | ✅ | Any agent with a shell can call it. Exit codes and JSON output give the agent validation feedback. |
| **MCP server** (stdio, or streamable HTTP from the running app) | ✅ | ✅ | ✅ | ✅ | All four support MCP. Typed tools (`create_view`, `add_variant`, `list_comments`, `resolve_comment`) are the best ergonomics. Cursor and some hosts cap tool counts, so keep it to ~6 tools. |
| **Agent Skill** (`SKILL.md`, agentskills.io, Dec 2025) | ✅ `.claude/skills` | ✅ `.agents/skills` | ✅ `.gemini/skills` | ⚠️ partial loading reported | Teaches the agent *when and how* to write a view. Ship one skill that points at the schema and the CLI. |
| **Push into the live session** | Claude Code **channels** (MCP, research preview, v2.1.80+, local stdio only), or hooks | none (terminal injection) | none | none | canvas.review does this with hooks and session-file discovery, plus "Send to terminal". It isn't portable. Treat it as an optional adapter (tmux `send-keys`, Claude channels). |

**Most portable design:** **the file is the source of truth**. Wrap it in a **CLI**, expose the CLI's verbs as a
**thin MCP server**, and ship a **SKILL.md** that teaches the format.
- Comments flow back as files (`.agent-review/comments/<view>.jsonl`). The agent reads them via MCP `list_comments`,
  the CLI, or `cat`.
- "Send to agent" is an optional per-host adapter (Claude channels, tmux, clipboard).

The loop works at the lowest level (files) and gets better as the host supports more.

---

## 7. Recommendation

### Stack
- **Runtime:** Bun. `Bun.serve` for the local app and API, `fs.watch` on `.agent-review/`, `bun build --compile` for a
  single-binary CLI on Linux, macOS and Windows (which beats canvas.review's Mac-only build).
- **UI:** React + **@xyflow/react 12** (MIT) with custom nodes, subflows for columns/groups, MiniMap, and keyboard nav
  via `setCenter`.
- **Layout:** **elkjs** layered layout in a Web Worker, with columns via partitioning. Positions are cached per view or
  variant, and humans can pin them (pinned positions stored separately from the agent's file). Dagre is the fast fallback.
- **Diffs:** **@pierre/diffs** (Apache-2.0): `PatchDiff` per card, `lineAnnotations` for comments, worker pool,
  virtualizer. Use `@codemirror/merge` for editable config cards and `jsondiffpatch` for structured (low-code) diffs.
- **Diagrams inside cards:** Mermaid (sequence/flow) rendered lazily.
- **Schema:** Zod → JSON Schema (`$schema` URL in each file) so agents and editors validate. `agent-review validate` gives
  line-precise errors.
- **Integration:** files + CLI + MCP (`@modelcontextprotocol/sdk` 1.32, MIT) + `SKILL.md`. Optional push adapters.
- **Export:** JSON Canvas 1.0 (Obsidian), Mermaid, and a static HTML share bundle.
- **Avoid:** tldraw (license), Monaco-per-card, Konva/Pixi (no DOM), and pixel coordinates in agent-authored files.

### Key design lessons
1. **The agent writes semantics, the app computes facts.** Agents reference code by `{file, symbol | lines | pattern}` and
   by git revisions. The app resolves diffs, line numbers, +/- counts and call edges itself, as canvas.review does. This
   keeps files small and avoids hallucinated code.
2. **Variants work like D2 scenarios and steps.** A variant inherits from `base` or from a previous variant and
   overrides only what changed. `kind` distinguishes current, proposed and actual states.
3. **Subjects are pluggable**, so non-code systems fit. A frame points at a `subject` from an adapter: `git`, `file`,
   `json-path`, `lowcode-step`, `ui-component`, `url/screenshot`.
4. **Comments are anchored, have a disposition, and know which variant they belong to** (Reviewable). They live in a
   separate append-only file, so the agent's rewrite of the view never clobbers human input.

### Config-file sketch (`.agent-review/views/<id>.view.json`, not final)

```jsonc
{
  "$schema": "https://agent.review/schema/view/v0.json",
  "id": "blog-post-pages",
  "title": "A page for each post, read from markdown",
  "system": { "kind": "git", "root": ".", "base": "main" },   // or { "kind":"lowcode", "adapter":"n8n", "source":"flows/signup.json" }

  "columns": [                                   // ordered frames → arrow keys / 1-10
    { "id": "overview", "title": "Overview" },
    { "id": "main",     "title": "Main change" },
    { "id": "logic",    "title": "Logic" },
    { "id": "tests",    "title": "Tests" },
    { "id": "docs",     "title": "Docs" }
  ],

  "subjects": {                                  // what cards point at; app resolves content
    "getPost":  { "adapter": "git", "file": "lib/posts.ts", "symbol": "getPost" },
    "toHtml":   { "adapter": "git", "file": "lib/markdown.ts", "symbol": "toHtml" },
    "postPage": { "adapter": "git", "file": "app/blog/[slug]/page.tsx", "pattern": "export default" },
    "step3":    { "adapter": "lowcode-step", "ref": "flows/signup.json#/steps/3" }
  },

  "base": {                                      // the "current system flow"
    "kind": "current",
    "rev": "main",
    "cards": [
      { "id": "c-lookup", "column": "main", "subject": "getPost",
        "title": "Find a post by its slug", "body": "Joins slug to posts dir…" }
    ],
    "edges": [ { "from": "c-page", "to": "c-lookup", "label": "calls" } ],
    "groups": [ { "id": "g-ui", "label": "UI", "cards": ["c-page", "c-body"] } ]
  },

  "variants": [
    { "id": "proposal-1", "kind": "proposed", "extends": "base", "label": "Plan",
      "summary": "Read markdown, sanitise before render",
      "patch": {                                 // overrides only; add/update/remove by id
        "cards": { "add": [ { "id": "c-sanitize", "column": "logic", "subject": "toHtml",
                              "title": "Clean the html before use", "claims": ["Cleans output of marked, not input"] } ] },
        "edges": { "add": [ { "from": "c-lookup", "to": "c-sanitize", "label": "calls" } ] }
      } },
    { "id": "actual-1", "kind": "actual", "extends": "proposal-1", "label": "Iteration 1",
      "rev": { "from": "main", "to": "HEAD" },  // app computes diffs per subject from this
      "checks": [                               // canvas.review "rail" → our "flags"
        { "card": "c-lookup", "severity": "investigate", "confidence": 0.7,
          "question": "Should non-ENOENT read errors 404?", "confirm": "Read a file with no permission; expect 500" } ],
      "tests": [ { "card": "c-lookup", "name": "returns null outside posts dir", "file": "lib/posts.test.ts", "status": "pass" } ] },
    { "id": "actual-2", "kind": "actual", "extends": "actual-1", "label": "Iteration 2 (after review)",
      "rev": { "from": "main", "to": "a1b2c3d" }, "respondsTo": ["cmt_01J…"] }
  ]
}
```

Comments live in a separate append-only file written by the app: `.agent-review/comments/<viewId>.jsonl`. Each line looks like
`{id, variant, card, anchor:{subject, lines|pattern}, author, body, disposition:"blocking"|"suggestion"|"resolved", replyTo, ts}`.
The agent reads them via MCP `list_comments({view, since})` or `agent-review comments --json`, and answers by writing a new
variant with `respondsTo`.

---

### Sources
- canvas.review: home, /how-it-works/, /demo, plus the public `graph.json`, `demo.json` and JS bundle (fetched 2026-10-27)
- https://jsoncanvas.org/spec/1.0/ · https://buttondown.com/ocwg/archive/ocif-v070-is-released/
- https://tldraw.dev/community/license · https://reactflow.dev/learn/layouting/layouting
- https://diffs.com/ and the npm tarball for `@pierre/diffs@1.6.2` · https://github.com/MrWangJustToDo/git-diff-view
- https://d2lang.com/tour/composition/
- https://docs.coderabbit.ai/pr-reviews/walkthroughs · https://docs.coderabbit.ai/pr-reviews/change-stack.md
- https://docs.devin.ai/work-with-devin/devin-review · https://cognition.ai/blog/devin-review
- https://techcrunch.com/2025/12/19/cursor-continues-acquisition-spree-with-graphite-deal
- https://www.schneider.im/gitkraken-acquired-codesee (CodeSee → GitKraken, 2024-05-14)
- https://cursor.com/blog/canvas · https://github.blog/ai-and-ml/github-copilot/how-to-build-interactive-experiences-with-canvases/
- https://tessl.io/registry/skills/github/cursor/plugins/pr-review-canvas/review
- https://agentpatterns.ai/patterns/agent-design/interactive-canvas-outputs/
- https://code.claude.com/docs/en/channels-reference · agentskills.io (via secondary sources: codex.danielvaughan.com, noqta.tn)
- https://superset.sh/compare/superset-vs-conductor · https://www.conductor.build/compare/superset
- npm registry metadata for every package version and license listed above
