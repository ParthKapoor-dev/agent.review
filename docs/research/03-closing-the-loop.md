# 03 — Closing the loop: notifying the agent, carrying review state, anchoring comments

Researched 2026-10-27. Scope: how a reviewer's comment on our canvas can reach a coding agent that is already running,
how review state ("reviewed", comments) should carry across iterations, and how comments can stay anchored when the content
changes. Not repeated from 01/02: canvas.review basics, Reviewable/Graphite/CodeRabbit overviews, general MCP adoption.

**Source legend.** `DOC` = official docs read this pass (most doc pages carry no date, so the date given is the date I read
them). `SPEC` = protocol specification. `2ND` = secondary source (blog, aggregator). `INFER` = my inference, not stated by any
source. `PRIOR` = well-known, not re-read this pass.

---

## 1. Pushing a comment into a running agent session

### 1.1 Claude Code

| # | Claim | Source | Date | Implication for us |
|---|---|---|---|---|
| 1.1.1 | Hook events that can put text in front of the model: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `SubagentStart/Stop`, `Stop`, `PostModelSwitch` (via `hookSpecificOutput.additionalContext`). `Notification` cannot. `additionalContext` is wrapped in a system reminder and capped at 10,000 chars per string. | https://code.claude.com/docs/en/hooks (DOC) | read 2026-10-27 | `PostToolUse`/`PostToolBatch` lets us slip "2 new review comments on view X" in between tool calls while the agent works, with no preview flags. Keep the text short and factual: the docs warn that imperative, system-style wording "can trigger prompt-injection defenses". |
| 1.1.2 | `Stop`: top-level `decision: "block"` + `reason` makes the conversation **continue**. `hookSpecificOutput.additionalContext` also continues it, labelled "Stop hook feedback" rather than an error. Loop guards are the `stop_hook_active` input and an 8-consecutive-continuation cap. | same, Stop section (DOC) | read 2026-10-27 | A Stop hook that runs `agent-review comments --unaddressed` and blocks while any exist stops the agent from finishing with open review threads. Check `stop_hook_active` so we don't loop on a comment the agent can't resolve. |
| 1.1.3 | Async hooks (`"async": true`) deliver output only "on the next conversation turn. If the session is idle, the response waits until the next user interaction. **Exception: an `asyncRewake` hook that exits with code 2 wakes Claude immediately even when the session is idle.**" Its stderr (or stdout) is shown to Claude as a system reminder. Async hooks are killed at teardown in `-p` mode. | same, async section (DOC) | read 2026-10-27 | This is the only documented, non-preview way to **wake an idle interactive session**. Pattern (INFER, untested): a `Stop` hook starts an `asyncRewake` command that long-polls `GET /api/comments/wait?since=<cursor>` on our Bun server and exits 2 with the comment text when one arrives. Each wake uses up the hook, so the next Stop re-arms it. Test this before relying on it. |
| 1.1.4 | `FileChanged` hooks run when a watched file changes on disk (`watchPaths` returned from `SessionStart`/`CwdChanged`/`FileChanged`). They have **no decision control and can't inject context**. | same (DOC) | read 2026-10-27 | Watching `feedback/comments.jsonl` doesn't help on its own. It can't wake the agent or add context. |
| 1.1.5 | **Channels**: an MCP server declares `capabilities.experimental['claude/channel']` and emits `notifications/claude/channel` `{content, meta}`. The event arrives as `<channel source=… k=v>` and can start a turn in an open session. Events queue in order and batch if Claude is busy. Claude Code doesn't acknowledge them. Requirements: **stdio transport only** (Claude Code spawns the server), **research preview**, needs claude.ai or Console auth, not on Bedrock/Vertex/Foundry. Custom channels need `--dangerously-load-development-channels server:<name>` (ignored under `-p`/SDK). Team/Enterprise orgs need `channelsEnabled`. Optional `claude/channel/permission` relays tool approvals. | https://code.claude.com/docs/en/channels , https://code.claude.com/docs/en/channels-reference (DOC) | read 2026-10-27 | This is the best push path for Claude Code, and it is a near-exact fit: the docs' own example is a Bun server on 127.0.0.1 that forwards POSTs. But it must be a **stdio shim**, separate from our Bun HTTP server. It is preview-gated, and the dev flag shows a warning dialog every launch. Ship it as opt-in. |
| 1.1.6 | On Claude Code's v2 MCP runtime (TS SDK 2.0), "a channel server that negotiates MCP protocol revision 2026-07-28 can't deliver channel messages, so Claude Code doesn't register it as a channel". Workarounds: `MCP_PROTOCOL_NEGOTIATION=legacy` or `MCP_SDK_GENERATION=v1`. | https://code.claude.com/docs/en/mcp (DOC) | read 2026-10-27 | Build the channel shim on `@modelcontextprotocol/sdk` **1.x**. Don't merge it into a 2026-07-28 Streamable HTTP server. |
| 1.1.7 | Messages the user types while Claude works are queued and delivered at the next step boundary. A request for Codex-style live steering (#69124, 2026-06-17) was auto-closed as stale on 2026-07-29 with no maintainer reply. | https://github.com/anthropics/claude-code/issues/69124 | 2026-06/07 | No API exists for an outside process to "type into" the TUI. Channels and hooks are the supported routes. |
| 1.1.8 | Agent SDK streaming-input mode keeps a persistent session that accepts queued user messages (an `AsyncIterable<SDKUserMessage>`) and supports interrupts. Single-message mode supports `continue`/`resume` but not mid-run queueing. | https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode (DOC) | read 2026-10-27 | If *we* launch the agent (a future "run agent from canvas" mode), the SDK gives true mid-task injection. For a session the user started in their own terminal it doesn't apply. `claude -p --resume <id> "<feedback>"` (PRIOR) works only between runs, not during one. |

### 1.2 OpenAI Codex CLI

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 1.2.1 | Hooks: `SessionStart`, `SubagentStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse` accept `hookSpecificOutput.additionalContext`. `Stop` with `decision: "block"` makes Codex continue with a new continuation prompt built from `reason`. There is also an `Interrupt` event. Configured via `hooks.json` or `[hooks]` in `config.toml`. | https://learn.chatgpt.com/docs/hooks.md (DOC; developers.openai.com redirects here) | read 2026-10-27 | Almost the same shape as Claude Code. One hook script with a per-agent output adapter covers both. No documented idle-wake equivalent of `asyncRewake`. |
| 1.2.2 | App-server JSON-RPC: `turn/steer {threadId, input, expectedTurnId}` adds input to the **active** turn without starting a new one, and fails if no turn is active. Transports: stdio (default), WebSocket (`--listen ws://`, experimental), unix socket. The TUI can attach to an app-server with `codex --remote ws://…`. | https://learn.chatgpt.com/docs/app-server.md (DOC) | read 2026-10-27 | True mid-turn steering, but only for sessions running behind an app-server we can reach. If the user starts `codex app-server --listen unix://…` and attaches the TUI with `--remote`, our server could call `turn/steer`. That is powerful but niche, and the protocol is labelled experimental. |
| 1.2.3 | The TUI "steer mode" (Enter injects mid-turn, Tab queues) landed around v0.81–0.87 (Jan 14–17, 2026) and became default in v0.98.0 (Feb 5, 2026). | https://blog.devgenius.io/codex-clis-busy-week-steer-mode-fork-and-7-releases-in-3-days-ece5c742923e , https://www.havoptic.com/tools/openai-codex (2ND) | 2026-01/02 | Evidence that steering mid-task is a feature users want. Secondary sources conflict on the current default, so verify against the GitHub releases. |

### 1.3 Gemini CLI, Cursor, Aider

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 1.3.1 | Gemini CLI hooks: `SessionStart`, `BeforeAgent`, `AfterTool` can inject context, and `AfterAgent` can "retry/halt". **Gemini CLI was replaced by Antigravity CLI**: announced 2026-05-19, with individual tiers cut off 2026-06-18. Hooks carry over as "Antigravity plugins", without 1:1 parity. | https://geminicli.com/docs/hooks/ (DOC, "last updated Apr 13, 2026"); https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ | 2026-04 / 2026-05-19 | Low priority. Target Antigravity's plugin hooks later. Don't build against Gemini CLI. |
| 1.3.2 | Cursor hooks: `stop` / `subagentStop` return `followup_message`, which is auto-submitted as the next user message (`loop_limit` default 5, `loop_count` input). `postToolUse` / `postToolUseFailure` / `sessionStart` return `additional_context`. No documented external-push API into a running local agent. | https://cursor.com/docs/agent/hooks (DOC) | read 2026-10-27 | The same pattern works: inject at tool boundaries, and "don't stop while comments are open" via `followup_message`. |
| 1.3.3 | Aider `--watch-files`: one-line comments ending in `AI!` (make changes) or `AI?` (answer) trigger aider. It collects all `AI` comments as instructions and adds those files to the chat. | https://aider.chat/docs/usage/watch.html (DOC) | read 2026-10-27 | Aider's only file-based push is comments *inside source files*. We could write an `// AI! see review comment c12` line into the anchored file. That works, but it edits user code, so treat it as opt-in only. |

### 1.4 What canvas.review actually does

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 1.4.1 | It discovers sessions from `~/.claude/sessions` and `~/.config/canvasreview/sessions`. "For each agent you turn on, a hook gives the agent the review link when your prompt or a `gh pr create` command names a PR." "A message reaches a session only when you click Send to terminal." Supported surfaces include herdr, Ghostty, Superset, Claude Desktop. | https://canvas.review/how-it-works/ | read 2026-10-27 | Its hooks go **outward** (they tell the agent where the review is). Delivery **inward** is a separate, explicit, per-message click. |
| 1.4.2 | **Unknown:** how the text physically gets into the session. No docs, no repo, closed-source Mac app, and the SPA returns the same shell for `/docs` and `/llms.txt`. My guess (INFER): it uses each terminal host's own API (herdr/Ghostty/Superset), which explains why those hosts are listed, possibly plus a hook that reads a queued message. I could not verify this. | — | — | Don't copy what can't be verified. The parts worth copying are the UX rules: nothing goes to the agent without an explicit click, plus a "Copy for terminal" fallback. |

### 1.5 Products and patterns around mid-task feedback

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 1.5.1 | GitHub Copilot coding agent: `@copilot` in a PR comment, or "Fix with Copilot" / **"Add to batch"** → "Manage batch" with extra instructions. Copilot reacts with 👀 when it starts, and adds a timeline event. | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/make-changes-to-an-existing-pr (DOC) | read 2026-10-27 | Two patterns to copy: **batching** (a review is a batch, sent once) and a visible **acknowledgement** (an "agent picked this up" state on the comment). |

---

## 2. MCP: resources, tools, notifications on a local server

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 2.1 | MCP **2026-07-28** removes protocol sessions and the init handshake, and **replaces the HTTP GET stream and `resources/subscribe`/`unsubscribe` with `subscriptions/listen`**: one long-lived POST-response stream where clients opt in to `toolsListChanged`, `promptsListChanged`, `resourcesListChanged`, `resourceSubscriptions`. It also removes SSE resumability (`Last-Event-ID`) and deprecates Roots/Sampling/Logging. | https://modelcontextprotocol.io/specification/2026-07-28/changelog (SPEC) | 2026-07-28 | Resource-subscription push is being redesigned right now, and client support for the new `subscriptions/listen` is unproven. **Don't make notification depend on resource subscriptions.** |
| 2.2 | Claude Code documents `list_changed` handling (it re-fetches tools/prompts/resources in interactive mode, tools only in `-p`/SDK), but **doesn't document `resources/subscribe` or `notifications/resources/updated`**. Even where clients accept such notifications, nothing says they make the model act. | https://code.claude.com/docs/en/mcp (DOC) | read 2026-10-27 | `resources/updated` refreshes a cache at most. It doesn't start a turn. For Claude Code, only channels start a turn. |
| 2.3 | VS Code supports resources (Add Context > MCP Resources, "MCP: Browse Resources") and prompts. Its docs don't mention subscriptions. Cursor's table lists Tools, Prompts, Resources, Roots, Elicitation, Apps, with transports stdio, SSE and Streamable HTTP, and doesn't mention subscriptions. | https://code.visualstudio.com/docs/copilot/customization/mcp-servers ; https://cursor.com/docs/context/mcp (DOC) | read 2026-10-27 | Resources are useful as **user-attachable context** (e.g. `agent-review://views/<id>`). Tools are the reliable path the model actually uses. |
| 2.4 | Claude Code: `claude mcp add --transport http <name> <url>` (`"type": "streamable-http"` is an alias). The docs frame HTTP as the remote option and stdio as the local option, but nothing forbids a localhost URL. | https://code.claude.com/docs/en/mcp (DOC) | read 2026-10-27 | A **Streamable HTTP endpoint at `http://127.0.0.1:<port>/mcp` on our Bun server is reasonable** for tools and resources (`list_comments`, `reply`, `resolve`, `mark_addressed`, `get_view`). Bind to loopback, reject requests whose `Origin` isn't ours (DNS-rebinding guard; Codex's app-server does the same), and keep the CLI as the fallback. |

---

## 3. Review-state carryover across revisions

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 3.1 | Reviewable tracks "the reviewed state of each file, at each revision, for each reviewer". Review marks are drafts until published. Completion needs every file "marked reviewed at the most recent revision" by a non-author. Author self-review marks are distinct and don't count by default. A red Diffs label means "more unreviewed revisions remain", and "Show Diffs to Review" jumps to the next needed range. Clicking last-reviewed sets bounds "between the last reviewed revision and the latest". | https://docs.reviewable.io/reviews.html ; https://docs.reviewable.io/files.html (DOC) | read 2026-10-27 | Key marks by **(view, revision, reviewer)**, not as a plain boolean. The default diff for a re-review is **last-reviewed revision → latest**. An agent "self-check" never counts as human review. |
| 3.2 | Reviewable on rebases: old revisions are kept and marked obsolete. Rebased commits are matched to their ancestors by commit message. Base-only changes collapse. Files that "haven't deviated from their base form" (including files reverted to base) aren't tracked. Whether a mark carries forward for a file that is byte-identical in a new revision isn't stated explicitly. | https://docs.reviewable.io/files.html (DOC) | read 2026-10-27 | Revisions are immutable, and a new iteration is a new revision. Views whose content returns to baseline drop out of the review set. |
| 3.3 | Gerrit: the reviewed flag is **per revision (patch set) per file per user**: `PUT /changes/{id}/revisions/{rev}/files/{file}/reviewed`. `GET …/files/?reviewed` lists the caller's reviewed paths. `GET …/files/?base=<ps>` lists files that differ between two patch sets. The UI diffs "Base" vs patch set N, or patch set A vs B, and highlights "rebase edits" separately, skipping files whose only edits are rebase edits. | https://gerrit-review.googlesource.com/Documentation/rest-api-changes.html ; https://gerrit-review.googlesource.com/Documentation/user-review-ui.html (DOC, v3.15) | read 2026-10-27 | Gerrit doesn't carry the flag forward. The reviewer instead diffs PS(last reviewed) → PS(now), and only changed files appear. We can do better automatically: a mark carries forward exactly when the content hash is unchanged. |
| 3.4 | GitHub: "If the file changes after you view the file, it will be unmarked as viewed." | https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request (DOC) | read 2026-10-27 | This rule is the industry baseline: **reset on content change, keep otherwise.** |
| 3.5 | Phabricator lets you compare any two diffs of a revision (`D123?vs=<diffA>&id=<diffB>`), i.e. interdiffs. Its own task tracker notes these are misleading across rebases or reverts ("we should explain what we're showing more clearly … if the diffs have different base revisions"). I found no current official doc page. Phabricator is unmaintained (Phorge is the fork). | https://phabricator.wikimedia.org/T125 ; https://secure.phabricator.com/T10500 (tracker, 2ND-ish) | various | Our interdiff should say whether the baseline also moved. If baseline(N) ≠ baseline(N−1), label the diff and separate "agent changes" from "baseline drift" (as Gerrit's rebase-edit colouring does). |

**Rules that make carryover trustworthy (synthesis, INFER from 3.1–3.5):**
1. A mark is the tuple `{viewId, revision, reviewer, contentHash, at}`. Never store a bare boolean.
2. The mark is **valid for revision N only if `hash(view@N) == mark.contentHash`**. Hash a canonical serialization (sorted keys, normalized whitespace) of the *semantic* content, and **exclude presentation-only fields** (canvas x/y, collapsed state, colours). Otherwise a layout nudge resets reviews and people stop trusting the marks.
3. If the hash differs, show "changed since you reviewed (rN → rM)" and open the **interdiff from the last reviewed revision by default**, not from the baseline.
4. If a view's hash returns to one already reviewed (e.g. the agent reverted), restore the mark *with a visible note*. Reviewable doesn't state this behaviour, so this is our choice.
5. Agent-authored "checked" states are separate from human marks and never satisfy completion (Reviewable self-review rule).
6. Revisions are immutable snapshots. Keep old ones so any pair can be diffed (Reviewable "obsolete", Gerrit patch sets).
7. Track baseline drift separately from agent edits (Gerrit rebase edits, Phabricator caveat).

---

## 4. Comment anchoring that survives edits

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 4.1 | Gerrit "ported comments": comments are recomputed onto the target revision. "If the exactly correct position can't be determined, those fields will be filled with the next best position … converting the comment to a file comment (or even moving the comment to a different file or the patchset level)." A thread is typically ported whole. Callers "must not rely on the original comment position". | Gerrit REST, List Ported Comments (DOC) | read 2026-10-27 | Use a **fallback ladder**: exact position → nearest position → node/view level → revision level. Never drop a comment. Keep the original position stored, and compute the ported one. |
| 4.2 | Reviewable: a discussion "will also appear in the diffs of other revisions, at the nearest corresponding line" until it is resolved. A red dog-ear warns "the current context may be inaccurate because of significant changes". | https://docs.reviewable.io/files.html (DOC) | read 2026-10-27 | Show a ported comment in place, with a **"context changed" badge**, instead of hiding it. |
| 4.3 | GitHub lists conversations as unresolved / resolved / **outdated**. The docs I read don't define when a comment becomes outdated. Observed behaviour (PRIOR, not verified this pass): a line comment becomes outdated when its diff hunk changes in a later push, and it is then shown only in the conversation view, not in the current diff. | https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/commenting-on-a-pull-request (DOC) | read 2026-10-27 | Hiding outdated comments from the current view is a known GitHub frustration (PRIOR). Prefer the Reviewable/Gerrit approach: show them at the ported location. |
| 4.4 | CodeTour anchors a step by `line` (default) **or** `pattern` (a regex on line content, used when `line` is absent), optionally pinned to a git `ref`. Pinning to a commit means it "will never get out of sync". Drift is detected by separate CI tools (CodeTour Watch). | https://github.com/microsoft/codetour (DOC/README) | read 2026-10-27 | Store both a position and a content pattern. Pin each comment to the revision it was written on, and port it forward. |
| 4.5 | Swimm "Auto-sync" stores token text plus hidden metadata, uses "line markers, token references, and file history". It auto-updates renames and moves, and **stops and flags for review when the change is meaningful**. The algorithm is patented and not public. | https://docs.swimm.io/features/editor-commands ; https://console.dev/interviews/swimm-gilad-navot (vendor DOC / interview) | various | Same idea as rule 2 in §3: separate trivial changes (moved, renamed) from meaningful ones, auto-port the trivial ones, and flag the meaningful ones. |
| 4.6 | W3C Web Annotation selectors: `TextQuoteSelector {exact, prefix, suffix}`, `TextPositionSelector`, and `FragmentSelector` can be combined, so a client can fall back from position to quote. | https://www.w3.org/TR/annotation-model/ (W3C Rec, 2017; PRIOR) | 2017-02-23 | This gives us a ready-made schema for the text part of an anchor. |

---

## 5. Research on human feedback to coding agents mid-task (2025–2026)

| # | Claim | Source | Date | Implication |
|---|---|---|---|---|
| 5.1 | Across 20,574 real coding-agent sessions (1,639 repos), **91.49% of visible resolutions of misalignment still require explicit user correction**, and 90.5% of episodes cost "effort and trust" rather than causing irreversible damage. Constraint violations and **inaccurate self-reporting** are a growing share of failures. | Tang et al., "How Coding Agents Fail Their Users", https://arxiv.org/abs/2605.29442 (abstract read) | 2026-05-28 (v2 2026-08-31) | Correction is where the work happens, so the review loop is the product. "Inaccurate self-reporting" argues for checking agent replies ("fixed in r4") against the actual interdiff, e.g. showing the diff next to the reply. |
| 5.2 | HiSentinel / SWE-Intervene: labels each agent action as allow, redirect, or pause-for-human. Learned intervention timing improves task completion by up to 14% (SWE-bench Verified Mini). | Zhao et al., https://arxiv.org/abs/2609.39957 (abstract) | 2026-09-30 | *When* to interrupt matters. Not every comment should interrupt. Distinguish "blocking" comments (push now) from "FYI" comments (deliver at the next boundary or at Stop). |
| 5.3 | Position papers: "Humans are Missing from AI Coding Agent Research" (steerability, verifiability among four dimensions), and "Agentic Coding Needs Proactivity, Not Just Autonomy" (judge agents on when they notify, question, or stay silent; interruption cost is unaccounted for in production agents). | https://arxiv.org/abs/2608.12355 ; https://arxiv.org/abs/2605.06717 (search snippets only) | 2026-08 / 2026-05 | Supports giving the reviewer control over the delivery mode. Weak evidence: snippets only. |
| 5.4 | A community request asked for a `/fyi` mode in Claude Code (add context without redirecting) alongside queue-for-later. | GitHub issue #69124 comment | 2026-06 | The same two delivery classes as 5.2: **steer now** vs **note for later**. |
| 5.5 | **Gap:** I found no controlled study of what *reviewers* want when steering an agent mid-task. The evidence above is session-log analysis, benchmarks, and position papers. | — | — | Treat delivery-mode UX as a hypothesis to test with users. |

---

## 6. Recommended design

### (a) Agent notification: layered, with explicit "send"

1. **Truth stays in files.** `feedback/comments.jsonl` plus a per-comment state machine: `draft → sent → seen (agent read it) → replied → addressed (agent claims) → resolved (human)`. Add a monotonic `seq` so any consumer can ask "since cursor N".
2. **Batch and send explicitly** (Copilot "Add to batch", canvas.review "Send to terminal"). Comments are drafts until the reviewer clicks **Send**. Each comment has a mode: **Blocking** (push now) or **Note** (deliver at the next boundary or at Stop). Show an acknowledgement badge when the agent reads it (via the tool or CLI call).
3. **Pull surface for every agent:** keep the CLI, and add a **Streamable HTTP MCP endpoint on the same Bun server** (`127.0.0.1` only, Origin check) with tools `list_comments(since)`, `reply`, `mark_addressed`, `get_view`, and resources `agent-review://views/<id>` for user-attached context. Don't rely on `resources/updated` (§2.1–2.2).
4. **Hook pack (no preview flags, works today):** `agent-review hooks install --agent claude|codex|cursor` writes:
   - `PostToolUse`/`PostToolBatch` → `additionalContext`: one factual line, e.g. "Reviewer sent 2 comments (c14, c15) on view `checkout-flow`. Run `agent-review comments --since 41`." Only for comments in state `sent` and newer than the cursor.
   - `Stop` → `decision:block` while any **Blocking** comment is unaddressed (honour `stop_hook_active`). Cursor: `followup_message`. Codex: `decision:block`.
   - `UserPromptSubmit` → a pending-comment summary.
   - **Claude only, experimental:** `asyncRewake` long-poll to wake an idle session (§1.1.3). Verify it in a spike first.
5. **Claude Code channel (opt-in, preview):** a tiny stdio shim (`agent-review channel`, MCP SDK 1.x, `claude/channel` capability) that subscribes to the Bun server over SSE and emits `notifications/claude/channel` with `meta {comment_id, view_id, revision}`. Its `instructions` tell Claude to reply via the `reply` tool. This is the only true push into an open, idle Claude session. Document the `--dangerously-load-development-channels server:agent-review` flag and the warning dialog.
6. **Codex power mode (later):** if the user runs the app-server on a unix socket and attaches the TUI with `--remote`, call `turn/steer` for Blocking comments.
7. **Universal fallback:** "Copy for terminal" (formatted prompt including comment IDs and the CLI command). Don't do terminal-injection hacks (tmux `send-keys`) by default. At most, offer them as an opt-in adapter.

### (b) State carryover

- **Revision** = immutable snapshot of all view JSON files at a point the agent declares (`agent-review publish`) or that we detect (debounced). Store it under `.agent-review/revisions/<n>/` with a manifest `{viewId: semanticHash}`, plus a baseline hash for drift detection.
- **Review mark** = `{viewId, revision, reviewer, semanticHash, at}`. A mark is valid for rN iff the hashes match (rules 1–7 in §3). The semantic hash excludes layout and presentation.
- **UI:** a per-view status (unreviewed / reviewed / **changed since review rA→rB**). Re-review opens the **interdiff from the last reviewed revision**. Label baseline drift separately. Agent self-checks are shown separately and don't count.
- **Completion** = every changed view has a valid human mark at the latest revision, and no open Blocking comments.

### (c) Anchoring

- **Anchor** = `{revision, viewId, nodeId, fieldPath?, textQuote{exact,prefix,suffix}?, textPosition?, nodeHash}`. Require agents to keep stable `nodeId`s across revisions (put this in AGENT_GUIDE as a contract). That one rule does most of the work, and it is something code review tools never get.
- **Porting ladder** (Gerrit/Reviewable): same `nodeId` and same `nodeHash` → **current**. Same `nodeId`, different hash → re-find the quote inside the node, show it in place with a **"context changed"** badge (not hidden, unlike GitHub's "outdated"). `nodeId` gone → fuzzy quote search across the view → else **demote to view level** → else revision level. Store the original anchor and the computed port, and never delete a comment.
- **Agent replies are tied to a revision** ("addressed in r5"). The UI shows the anchored node's r4→r5 interdiff next to the reply so the human can verify the claim (§5.1).

### Uncertainty flags
- `asyncRewake`-as-wakeup and the re-arm pattern are my design, built on a single doc sentence. Spike it before relying on it.
- Channels are a research preview: flags and contract "may change". Custom channels always need the dev flag and dialog.
- canvas.review's injection mechanism is unverified.
- Codex steer defaults come from secondary sources. App-server and WebSocket are labelled experimental.
- MCP `subscriptions/listen` (2026-07-28) client support: no client documents it yet, as far as I found.
- GitHub "outdated" semantics are from prior knowledge, not a doc quote.
- §5 papers: abstracts only (5.3 snippets only). No direct reviewer-preference study was found.
