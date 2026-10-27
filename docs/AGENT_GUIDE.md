# Writing a review for agent.review

You (the agent) describe your work as JSON files. A person opens them in the agent.review app as a
canvas, compares versions, marks cards verified and leaves comments you can read back. You never
draw layouts or diffs: give each card a stable `id` and the app lays out, colours and diffs for you.

## 1. Where the files go

```
<folder>/review.json          one per piece of work (ticket, PR, task)
<folder>/views/<view-id>.json one per map; listed in review.json "views"
<folder>/assets/…             anything you reference: exported JSON, logs, screenshots
<folder>/feedback/…           written by the app. Read it with the CLI; never edit it.
```

Use `<project>/.agent-review/` in a code repo, or the task's own folder (for example
`tasks/<TICKET>/review/`) elsewhere. Start one with `agent-review init <folder> --title "…"`.
For a git change, `agent-review from-git <repo>` writes a "changes" view for you (one card per
file); retitle its cards to say what each change does.

The review `id` is its address in the app (`/r/<id>`). Keep it stable once you have shared it.
Paths in `refs`, `evidence`, `image.src` and `{file}` are relative to `review.json`, or absolute.
The app only serves files that live under the review folder, so copy evidence into `assets/`.

## 2. What to put in front of the reviewer

Write for someone who has five minutes and did not watch you work.

1. **Context before questions.** `review.json` `summary`: what is wrong today and what the change
   does, in plain words, two short paragraphs. Pick **one running example** (one order, one
   student, one request) and use it on every view.
2. **Titles are sentences that say what the thing does.** "Loads the order with a bound parameter,
   only if it is yours", not `load-order` or "SQL step 3". The title is what people navigate by.
3. **One idea per card.** A card is a step, a function, a test case, a decision, or a claim. Put
   detail (code, inputs, evidence) inside the card; it opens in a side panel.
4. **Say what you did not check.** Add an `unverified` card. Give every `claim` a `confidence` and
   `evidence`. Do not let a claim sound more checked than it is.
5. **Flag scope.** Anything you did that was not asked for gets `"tags": ["not requested"]`.
6. **Ask by letter.** Decisions are `question` cards with 2–4 `options` and a `recommended` one.
7. **Keep ids stable.** The same thing keeps the same `id` in every variant. That is how the app
   knows it changed instead of being removed and re-added.

### Less text

The canvas shows only each card's title; everything else opens in a side panel. The reviewer
reads titles to find their way, so make them do the work and keep the rest short. `validate`
warns past these limits:

| text | limit | the rest goes in |
|---|---|---|
| card `title` | 70 chars | `summary`, then `body` |
| card `summary` | 120 chars | `body` |
| `change` | 80 chars | the diff shows it |
| view `title` (a tab) | 28 chars | view `description` |
| frame `title` | 22 chars | frame `description` |
| review `summary` | 600 chars | cards |
| each `board.waiting` item | 90 chars | a `question` card |
| each tour stop `text` | 200 chars | the card it points at |

Prefer structure to prose: a `question` card instead of a paragraph asking for a decision, a
`test` with `expected`/`actual` instead of a description of a run, a `table` instead of numbers in
a sentence.

## 3. Views: which maps to make

Give each view a short `title` (2–4 words, it is a tab) and put the sentence in `description`.
Typical set; make only what helps:

| View | Frames (columns) | Cards |
|---|---|---|
| **flow**: how it works | the stages of the request or process (Request → Checks → Data → Response) | `step` per step / function / component, edges for calls and data |
| **tests**: what proves it | Normal use · Attacks · Edge cases | `test` per case with `inputs`, `expected`, `actual`, `result`, `command` |
| **checks**: decisions and trust | Needs your decision · What I checked · Not checked | `question`, `claim`, `unverified`; supporting `diagram` / `table` cards go next to the claim they support |

For a code change you can also make a **changes** view with a `diff` card per hunk group, framed as
Main change → Logic → Tests → Docs.

**How big is a card?** One card per thing the reviewer would check on its own. In a step chain,
that is usually one step; merge trivial neighbours (a step that only reads input into a variable)
into the next real one and say so in `summary`. A whole method is a card only in a view whose
cards are methods (a "callers" or "system" view).

## 4. Variants: current → proposed → actual → iteration

Each view has `variants`. Exactly one has no `extends` (the root, usually `current`: what runs
today). Every other variant extends one and lists **only what differs**:

- `nodes`: a new card (full object), or `{ "id": "<existing>", …fields to change… }`
- `edges`: new edges (an edge's id defaults to `"<from>-><to>"`)
- `remove`: ids of cards or edges to drop
- on any changed card, a one-line `change`: what changed in this variant and why
- `respondsTo`: comment ids this variant answers (from `agent-review comments`)

| kind | when |
|---|---|
| `current` | today's behaviour, before you touch anything |
| `proposed` | the plan, before building. Ask for approval here. |
| `actual` | what you actually built. Call out every difference from `proposed` with `change`. |
| `iteration` | after review comments. Set `respondsTo`. |
| `alternative` | another option to choose between (extends the same parent as the option it competes with) |

The root does not have to be `current`. A view with nothing "before" (planned tests, the checks
view) has a single root of whatever kind fits, e.g. `proposed` for planned tests; add an `actual`
child when they have been run.

Edges: an edge in a child with the same id as an inherited one (default `"<from>-><to>"`) replaces
it, which is how you change a label. Removing a card also removes its edges; you don't need to
list them. Edge fields: `from`, `to`, `label`, `style` (`solid` | `dashed`), and `tone`:
`danger` (carries untrusted or unsafe data), `safe` (validated), `muted` (incidental).

Never rewrite an earlier variant after the reviewer has seen it. Add a new one. The reviewer's
marks are tied to card content; changing an old variant resets them.

## 5. Card types

All cards have `id`, `type`, `title`, and optional `frame`, `summary` (≤ 2 lines on the card),
`change`, `tags`, `refs` (`[{label, path, lines, url}]`).

| type | extra fields |
|---|---|
| `note` | `body` (markdown) |
| `step` | `kind` (badge, e.g. "SQL step", "function", "page component"), `body`, `code`, `inputs`, `outputs` |
| `diff` | `before` + `after`, or `patch` (unified git diff); `path` (file name), `body` |
| `test` | `inputs`, `expected`, `actual`, `result` (`pass` `fail` `pending` `skip`), `command`, `evidence` |
| `question` | `body`, `options` `[{id, label, detail}]`, `recommended` |
| `claim` | `body`, `confidence` (`checked` ran it · `read` read the source · `inferred` · `unknown`), `evidence` |
| `unverified` | `items` `[{text, why}]` |
| `diagram` | `mermaid` (e.g. a sequence diagram) |
| `table` | `columns`, `rows` |
| `image` | `src` (path under the review folder, or URL) |

Field shapes:

| field | shape |
|---|---|
| `refs` | `[{ "label"?, "path"?, "lines"?, "url"? }]` |
| `evidence` | `[{ "label"?, "path"?, "lines"?, "url"?, "text"? }]`; `text` for a short quote or result |
| `inputs`, `outputs` (step) | `["name", …]` or `[{ "name", "type"?, "note"? }]` |
| `inputs`, `expected`, `actual` (test) | any JSON value; use the same shape for `expected` and `actual` so they compare |
| `options` | `[{ "id", "label", "detail"? }]` |
| `items` (unverified) | `[{ "text", "why"? }]` |
| `tags` | free strings. `not requested` (or `out of scope`) is highlighted; others are labels |
| `code`, `before`, `after`, `patch` | a string, `{ "code", "lang"? }`, or `{ "file", "lines"?, "lang"? }` |

`lines` is `"12"` or `"12-40"`. For `{file}` the language comes from the extension; set `lang`
to override. For a low-code platform, export each step's source to `assets/` and reference it;
the app reads it. Use the same reference in two variants and edit the file between them only if
the variants really share it. Otherwise give each variant its own file.

A planned test that hasn't run: `result: "pending"` and no `actual`. If `command` needs something
that doesn't exist yet (an id that's created on publish), write it with a visible placeholder like
`<draft-uuid>`, and add it to the `unverified` card.

Put the same `code` field on a card in two variants and the app shows the diff between them. You
do not need a `diff` card for that.

## 5a. review.json

```json
{
  "agentReview": 1,
  "id": "ref-112",
  "title": "Refunds: stop trusting the amount the browser sends",
  "status": "proposal",
  "summary": "What is wrong today, what changes. The running example: order 1042, total $80, refunded $20.",
  "board": { "waiting": ["Approve the proposal"], "done": ["Read the chain"], "next": ["Build on dev"] },
  "links": [{ "label": "Ticket", "url": "https://…" }],
  "views": ["flow", "tests", "checks"],
  "tour": [
    { "view": "flow", "variant": "current", "node": "load-order", "title": "The problem", "text": "The id is pasted into SQL." }
  ]
}
```

`status`: `draft` · `proposal` (waiting for approval) · `in-progress` · `ready` (for final review) ·
`done`. Keep `board` current: it is the first thing the reviewer reads. Put things you need from
them in `waiting`.

A `tour` is 3–7 stops that walk through the story. Each stop names a card and a variant.

## 5b. A view, minimal

```json
{
  "id": "flow",
  "title": "Refund chain",
  "description": "The steps of refunds.create.",
  "frames": [{ "id": "data", "title": "Data" }, { "id": "money", "title": "Money" }],
  "defaultVariant": "proposed",
  "defaultCompare": "current",
  "variants": [
    {
      "id": "current", "label": "Current", "kind": "current",
      "nodes": [
        { "id": "load-order", "type": "step", "frame": "data", "kind": "SQL step",
          "title": "Loads the order by pasting the id into SQL",
          "code": { "lang": "sql", "code": "SELECT * FROM orders WHERE id = ${input.orderId}" } },
        { "id": "refund", "type": "step", "frame": "money", "title": "Refunds the amount the browser sent" }
      ],
      "edges": [{ "from": "load-order", "to": "refund", "label": "order" }]
    },
    {
      "id": "proposed", "label": "Proposed", "kind": "proposed", "extends": "current",
      "summary": "Bind the id; compute the amount on the server.",
      "nodes": [
        { "id": "load-order", "title": "Loads the order with a bound parameter",
          "change": "Bound parameter instead of pasted text.",
          "code": { "lang": "sql", "code": "SELECT * FROM orders WHERE id = :orderId" } },
        { "id": "calc", "type": "step", "frame": "money", "title": "Works out how much can be refunded", "change": "New step." }
      ],
      "edges": [{ "from": "load-order", "to": "calc" }, { "from": "calc", "to": "refund" }],
      "remove": ["load-order->refund"]
    }
  ]
}
```

`direction`: `"right"` (default, frames are columns) or `"down"` (frames are rows).

## 6. The loop

1. Write or update the files.
2. `agent-review validate <folder>`: fix every error. Errors name the file, the card and the field;
   a card with an error is left off the canvas until fixed, so fix the first error on a card first.
   `agent-review schema view` prints the full JSON Schema if you need it.
3. Tell the reviewer the folder path, and what you need from them. If the app is already running
   (`agent-review serve <root>`), it reloads by itself.
4. Later: `agent-review comments <folder>` (or `--json`). Each thread has an id, a kind
   (`question`, `blocking`, `suggestion`, `nit`, `note`, `answer`), the card and the variant it is on.
   `answer` entries are the reviewer's choice on a `question` card (`choice` = option id).
   `verdict` entries are the reviewer's call on a whole variant: `choice` is `approve` or
   `changes`. **Do not start building a `proposed` variant until it has an `approve` verdict.**
5. Act on them in a **new variant** (`kind: "iteration"`, `respondsTo: [ids]`), then
   `agent-review reply <folder> <id> "what you did" --resolve` for each.
   Answer questions in a reply without resolving if you need the reviewer to confirm.

### Getting feedback without polling

If the reviewer's agent setup runs `agent-review hook` (print the config with `agent-review hooks`),
new comments, answers and verdicts arrive by themselves: as extra context after your next tool
call, or when you try to end your turn. Each item arrives once. Treat it like a message from the
reviewer: act on it, then reply.

## 7. Checklist before you hand over

- [ ] `validate` passes with no errors
- [ ] summary has the running example; board `waiting` says what you need
- [ ] every changed card in a non-root variant has a `change` line
- [ ] anything not asked for is tagged `not requested`
- [ ] claims have confidence and evidence; there is an `unverified` card
- [ ] tests show `expected` and `actual`, and `command` when the reviewer can run it
- [ ] ids are the same across variants for the same thing
