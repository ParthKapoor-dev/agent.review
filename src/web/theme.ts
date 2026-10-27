// Light / dark / system. The choice lives in localStorage; the resolved theme is on <html data-theme>.
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
type Choice = Theme | "system";
const KEY = "agent-review-theme";
const EVENT = "agent-review-theme";

const media = () => matchMedia("(prefers-color-scheme: dark)");

export function getChoice(): Choice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "system";
}

export const resolve = (c: Choice): Theme => (c === "system" ? (media().matches ? "dark" : "light") : c);

export function applyTheme() {
  document.documentElement.dataset.theme = resolve(getChoice());
}

export function setChoice(c: Choice) {
  try {
    if (c === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, c);
  } catch {}
  applyTheme();
  window.dispatchEvent(new Event(EVENT));
}

/** The theme in effect, re-rendering when the user or the OS changes it. */
export function useTheme(): Theme {
  const [t, setT] = useState<Theme>(() => resolve(getChoice()));
  useEffect(() => {
    const on = () => {
      applyTheme();
      setT(resolve(getChoice()));
    };
    window.addEventListener(EVENT, on);
    media().addEventListener("change", on);
    return () => {
      window.removeEventListener(EVENT, on);
      media().removeEventListener("change", on);
    };
  }, []);
  return t;
}
