// Shapes the server sends to the web app (after loading, resolving and laying out).
import type { Node, Edge, Review, View } from "./schema";

export type ResolvedCode = { code: string; lang?: string; file?: string; lines?: string; error?: string };

/** A node after its variant chain is applied and file references are read. */
export type RNode = Node & { hash: string };
export type REdge = Edge & { id: string };

export type RVariant = {
  id: string;
  label: string;
  kind: View["variants"][number]["kind"];
  extends?: string;
  summary?: string;
  respondsTo: string[];
  createdAt?: string;
  nodes: RNode[];
  edges: REdge[];
};

export type Box = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };

export type Issue = { level: "error" | "warning"; file: string; path?: string; message: string };

export type RView = Omit<View, "variants"> & {
  variants: RVariant[];
  layout: { nodes: Record<string, Box>; frames: Record<string, Box>; edges: Record<string, Point[]> };
};

export type ReviewSummary = {
  key: string;
  dir: string;
  title: string;
  status: Review["status"];
  views: { id: string; title: string }[];
  updatedAt: number;
  openComments: number;
  errors: number;
};

export type RReview = Review & { key: string; dir: string; viewTitles: Record<string, string>; issues: Issue[] };

export type CommentKind = "question" | "blocking" | "suggestion" | "nit" | "note" | "answer" | "verdict";

export type Comment = {
  id: string;
  ts: string;
  author: "reviewer" | "agent";
  view: string;
  node?: string;
  variant?: string;
  kind: CommentKind;
  text: string;
  parent?: string;
  /** answer: the chosen option id. verdict: "approve" | "changes". */
  choice?: string;
  status: "open" | "resolved";
  /** When an agent hook last handed this to an agent session. */
  deliveredAt?: string;
};

export type MarkState = "seen" | "verified" | "flagged";
export type Mark = { state: MarkState; hash: string; variant: string; ts: string };

export type Feedback = { comments: Comment[]; marks: Record<string, Mark> };
