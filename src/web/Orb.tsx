// The brand orb, which doubles as the agent's presence: it thinks while the agent is working,
// speaks when the review is waiting on you, and rests when the work is done.
// One WebGL context per orb, so keep to one or two on a page (never one per list row).
import { useEffect, useState } from "react";
import { Shdr11 } from "./orbs/shdr-11";
import type { Review } from "../core/schema";

export type OrbMood = "idle" | "thinking" | "speaking";

export function moodFor(status: Review["status"]): { mood: OrbMood; label: string } {
  switch (status) {
    case "proposal":
      return { mood: "speaking", label: "Waiting for you: a proposal to approve" };
    case "ready":
      return { mood: "speaking", label: "Waiting for you: ready for final review" };
    case "done":
      return { mood: "idle", label: "Done" };
    default:
      return { mood: "thinking", label: "The agent is working on this" };
  }
}

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Orb({ size, mood = "idle", label, className = "" }: { size: number; mood?: OrbMood; label?: string; className?: string }) {
  const [still, setStill] = useState(reducedMotion);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setStill(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return (
    <span className={`orb ${className}`} style={{ width: size, height: size }} title={label}>
      <Shdr11 size={size} state={mood} paused={still} ariaLabel={label} />
    </span>
  );
}
