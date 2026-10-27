// Small pieces of the app frame.
import { Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { getChoice, setChoice } from "./theme";

export function ThemeToggle() {
  const [c, setC] = useState(getChoice);
  const next = c === "system" ? "light" : c === "light" ? "dark" : "system";
  const Icon = c === "light" ? Sun : c === "dark" ? Moon : Monitor;
  return (
    <button
      className="icon-btn"
      title={`Theme: ${c} (click for ${next})`}
      onClick={() => {
        setChoice(next);
        setC(next);
      }}
    >
      <Icon size={16} />
    </button>
  );
}

/** Verified cards as a ring. */
export function Progress({ done, total }: { done: number; total: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const f = total ? done / total : 0;
  return (
    <span className="progress" title={`${done} of ${total} cards verified in this variant`}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
        <circle cx="9" cy="9" r={r} className="pr-track" />
        <circle cx="9" cy="9" r={r} className="pr-fill" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 9 9)" />
      </svg>
      {done}/{total}
    </span>
  );
}
