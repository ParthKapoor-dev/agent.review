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

## 3. Views: which maps to make

Typical set; make only what helps:

| View | Frames (columns) | Cards |
|---|---|---|
| **flow**: how it works | the stages of the request or process (Request → Checks → Data → Response) | `step` per step / function / component, edges for calls and data |
| **tests**: what proves it | Normal use · Attacks · Edge cases | `test` per case with `inputs`, `expected`, `actual`, `result`, `command` |
| **checks**: decisions and trust | Needs your decision · What I checked · Not checked | `question`, `claim`, `unverified`, `diagram`, `table` |

For a code change you can also make a **changes** view with a `diff` card per hunk group, framed as
Main change → Logic → Tests → Docs.

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

`code`, `before`, `after`, `patch` take a string, or `{ "code": "…", "lang": "sql" }`, or a file
reference `{ "file": "assets/method.sql", "lines": "10-40" }` (relative to `review.json`). For a
low-code platform, export the step's source to `assets/` and reference it; the app reads it.

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
2. `agent-review validate <folder>`: fix every error. Errors name the file and the field.
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

## 7. Checklist before you hand over

- [ ] `validate` passes with no errors
- [ ] summary has the running example; board `waiting` says what you need
- [ ] every changed card in a non-root variant has a `change` line
- [ ] anything not asked for is tagged `not requested`
- [ ] claims have confidence and evidence; there is an `unverified` card
- [ ] tests show `expected` and `actual`, and `command` when the reviewer can run it
- [ ] ids are the same across variants for the same thing
