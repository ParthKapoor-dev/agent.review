// The file format agents write. Two kinds of file:
//   review.json        one per review (a ticket, a PR, a task)
//   views/<id>.json    one per view (a map), each with variants
// Everything here is validated with zod; `bun run schema` exports JSON Schema for agents.
import { z } from "zod";

const id = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "ids use letters, digits, '.', '_' and '-' only");

const md = z.string().describe("Markdown");

/** Code is either inline text or a pointer to a file (resolved by the app, relative to review.json). */
export const Code = z.union([
  z.string(),
  z.object({
    code: z.string().optional(),
    file: z.string().optional().describe("Path relative to review.json, or absolute"),
    lines: z
      .string()
      .regex(/^\d+(-\d+)?$/)
      .optional()
      .describe("e.g. '10-42'; only with file"),
    lang: z.string().optional().describe("sql, js, ts, json, html, python …"),
    error: z.string().optional().describe("Set by the app when a file can't be read"),
  }),
]);

const Ref = z.object({
  label: z.string().optional(),
  path: z.string().optional(),
  lines: z.string().optional(),
  url: z.string().optional(),
});

const Port = z.union([
  z.string(),
  z.object({ name: z.string(), type: z.string().optional(), note: z.string().optional() }),
]);

const base = {
  id,
  title: z.string().describe("A plain sentence saying what this does. It is the card's headline."),
  frame: id.optional().describe("Frame (column) this card sits in"),
  summary: z.string().optional().describe("One or two lines shown on the card"),
  change: z
    .string()
    .optional()
    .describe("What changed in this variant, in one line. Shown on the card when it differs."),
  tags: z.array(z.string()).optional(),
  refs: z.array(Ref).optional().describe("Where this lives: files, methods, URLs"),
};

export const Node = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("note"), body: md.optional() }),
  z.object({
    ...base,
    type: z.literal("step"),
    kind: z.string().optional().describe("Shown as a badge, e.g. 'SQL step', 'function', 'PD component'"),
    body: md.optional(),
    code: Code.optional(),
    inputs: z.array(Port).optional(),
    outputs: z.array(Port).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("diff"),
    body: md.optional(),
    before: Code.optional(),
    after: Code.optional(),
    patch: Code.optional().describe("A unified git diff, instead of before/after"),
    path: z.string().optional().describe("File name shown in the diff header"),
  }),
  z.object({
    ...base,
    type: z.literal("test"),
    body: md.optional(),
    inputs: z.unknown().optional(),
    expected: z.unknown().optional(),
    actual: z.unknown().optional(),
    result: z.enum(["pass", "fail", "pending", "skip"]).default("pending"),
    command: z.string().optional().describe("How to run it yourself"),
    evidence: z.array(Ref.extend({ text: z.string().optional() })).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("question"),
    body: md.optional(),
    options: z
      .array(z.object({ id, label: z.string(), detail: md.optional() }))
      .optional(),
    recommended: id.optional(),
  }),
  z.object({
    ...base,
    type: z.literal("claim"),
    body: md.optional(),
    confidence: z
      .enum(["checked", "read", "inferred", "unknown"])
      .default("unknown")
      .describe("checked = verified by running it; read = read the source; inferred = reasoning only"),
    evidence: z.array(Ref).optional(),
  }),
  z.object({
    ...base,
    type: z.literal("unverified"),
    body: md.optional(),
    items: z.array(z.object({ text: z.string(), why: z.string().optional() })),
  }),
  z.object({ ...base, type: z.literal("diagram"), mermaid: z.string(), body: md.optional() }),
  z.object({
    ...base,
    type: z.literal("table"),
    body: md.optional(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  }),
  z.object({ ...base, type: z.literal("image"), src: z.string(), body: md.optional() }),
]);
export type Node = z.infer<typeof Node>;
export type NodeType = Node["type"];
export const NODE_TYPES = Node.options.map((o) => o.shape.type.value) as NodeType[];

export const Edge = z.object({
  id: id.optional().describe("Defaults to '<from>-><to>'"),
  from: id,
  to: id,
  label: z.string().optional(),
  style: z.enum(["solid", "dashed"]).optional(),
});
export type Edge = z.infer<typeof Edge>;

export const VARIANT_KINDS = ["current", "proposed", "actual", "iteration", "alternative"] as const;

/** A node inside a variant: a full node (new) or {id, ...fields to override} (existing). */
const NodePatch = z.object({ id }).passthrough();

export const Variant = z.object({
  id,
  label: z.string(),
  kind: z.enum(VARIANT_KINDS),
  extends: id.optional().describe("Parent variant. Omit only on the first (root) variant."),
  summary: md.optional(),
  nodes: z.array(NodePatch).default([]),
  edges: z.array(Edge).default([]),
  remove: z.array(z.string()).default([]).describe("Node or edge ids this variant drops"),
  respondsTo: z.array(z.string()).default([]).describe("Comment ids this variant addresses"),
  createdAt: z.string().optional(),
});
export type Variant = z.infer<typeof Variant>;

export const Frame = z.object({ id, title: z.string(), description: z.string().optional() });

export const View = z.object({
  id,
  title: z.string(),
  description: md.optional(),
  direction: z.enum(["right", "down"]).default("right"),
  frames: z.array(Frame).default([]),
  variants: z.array(Variant).min(1),
  defaultVariant: id.optional(),
  defaultCompare: id.optional().describe("Variant to compare the default against"),
});
export type View = z.infer<typeof View>;

export const TourStep = z.object({
  view: id,
  node: id.optional(),
  variant: id.optional(),
  title: z.string().optional(),
  text: md,
});

export const Review = z.object({
  agentReview: z.literal(1).describe("Format version; marks this file as an agent.review config"),
  id,
  title: z.string(),
  summary: md.optional(),
  status: z.enum(["draft", "proposal", "in-progress", "ready", "done"]).default("draft"),
  board: z
    .object({
      done: z.array(z.string()).optional(),
      pending: z.array(z.string()).optional(),
      waiting: z.array(z.string()).optional().describe("Waiting on the reviewer"),
      next: z.array(z.string()).optional(),
    })
    .optional(),
  links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
  views: z.array(id).min(1).describe("View ids, in reading order. Each is views/<id>.json"),
  tour: z.array(TourStep).default([]),
});
export type Review = z.infer<typeof Review>;
