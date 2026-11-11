# Prompt: have an agent explain planned work in agent.review

Paste this to the agent you are working with. Replace the three `<…>` values.
`<APP_URL>` is where the app runs (e.g. `https://agent-review.localhost` under portless),
`<CLI>` is how to call it (e.g. `bun ~/code/agent.review/src/cli.ts`), and `<REVIEW_DIR>` is the
folder the review should live in (a task folder, or `<repo>/.agent-review`).

---

Before doing this task, show me the work in **agent.review**, a local review app running at
<APP_URL>. You write the review as small JSON files; I read it as a map, compare versions, answer
your questions and leave comments that you read back. It reloads by itself when you change files.

Wherever this prompt says `ar`, run `<CLI>`.

1. **Learn the format.** Run `ar guide` and read all of it. It is the contract; follow it.
2. **Read before you write.** Read the task and every source it touches. Every fact on a card must
   come from something you read or ran. Anything else goes on the `unverified` card.
3. **Write the review** in `<REVIEW_DIR>` (start with `ar init <REVIEW_DIR> --title "…"`):
   - **flow**: today's behaviour as the `current` variant, one card per step or component that
     matters, with the real code. Your plan is a `proposed` variant on top of it. Tag anything I
     didn't ask for `not requested`.
   - **tests**: the cases that would prove the change, as planned (`pending`) tests with expected
     results.
   - **checks**: every decision you need from me as a `question` card (2–4 options, one
     recommended); your claims with confidence and evidence; an `unverified` card.
   - Use **one running example** on every view.
   - Keep text short. Titles are short sentences saying what the thing does; detail goes in
     summary and body.
4. **Validate.** Run `ar validate <REVIEW_DIR>` until there are no errors and no warnings.
5. **Hand over and stop.** Send me `<APP_URL>/r/<review id>` and one line saying what you need
   from me. Do not build, publish or change anything until I approve the `proposed` variant in the
   app.
6. **When I say I've reviewed it,** run `ar comments <REVIEW_DIR>`. My answers to question cards
   and my Approve / Request changes verdict appear there too. Respond in a **new variant**
   (`kind: "iteration"`, `extends` the variant I commented on, `respondsTo` the comment ids). Never
   edit a variant I've already seen. Then run `ar reply <REVIEW_DIR> <id> "what you did" --resolve`
   for each comment, validate, and send me the link again.
