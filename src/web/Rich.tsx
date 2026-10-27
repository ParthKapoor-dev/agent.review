// Markdown, code, diffs and Mermaid: the content inside cards and the inspector.
import { memo, useEffect, useId, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { File, MultiFileDiff, PatchDiff } from "@pierre/diffs/react";
import type { ResolvedCode } from "../core/types";
import { useTheme } from "./theme";

marked.setOptions({ gfm: true, breaks: false });

export const Markdown = memo(function Markdown({ text, className = "" }: { text?: string; className?: string }) {
  if (!text) return null;
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }) as string);
  return <div className={`md ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
});

type CodeLike = string | Partial<ResolvedCode> | undefined;

export const codeOf = (c: CodeLike): ResolvedCode | undefined =>
  c === undefined ? undefined : typeof c === "string" ? { code: c } : { code: c.code ?? "", ...c };

const EXT: Record<string, string> = {
  javascript: "js", typescript: "ts", python: "py", sql: "sql", json: "json", html: "html", css: "css", bash: "sh",
  markdown: "md", yaml: "yml", go: "go", rust: "rs", java: "java", ruby: "rb", tsx: "tsx", jsx: "jsx", xml: "xml",
};
const nameFor = (c: ResolvedCode | undefined, fallback = "snippet") =>
  c?.file ?? `${fallback}.${(c?.lang && (EXT[c.lang] ?? c.lang)) || "txt"}`;

const opts = (theme: "light" | "dark") => ({ themeType: theme, overflow: "wrap", disableFileHeader: true }) as const;

export function CodeBlock({ code, name }: { code: CodeLike; name?: string }) {
  const theme = useTheme();
  const c = codeOf(code);
  if (!c) return null;
  if (c.error) return <div className="banner error">{c.error}</div>;
  return (
    <div className="code">
      <div className="code-head">
        {c.file ?? name ?? c.lang ?? "code"}
        {c.lines && <span> · lines {c.lines}</span>}
      </div>
      <File file={{ name: nameFor(c, name), contents: c.code, lang: c.lang as never }} options={opts(theme)} />
    </div>
  );
}

export function CodeDiff({ before, after, name, split }: { before: CodeLike; after: CodeLike; name?: string; split?: boolean }) {
  const theme = useTheme();
  // A trailing newline on both sides keeps the diff from reporting "No newline at end of file".
  const nl = (c: ResolvedCode) => ({ ...c, code: c.code.endsWith("\n") || !c.code ? c.code : c.code + "\n" });
  const a = nl(codeOf(before) ?? { code: "" });
  const b = nl(codeOf(after) ?? { code: "" });
  const lang = (b.lang ?? a.lang) as never;
  const n = name ?? nameFor(b.file ? b : a);
  const head = name ?? b.file ?? a.file ?? b.lang ?? a.lang ?? "code";
  if (a.code === b.code) return <div className="muted small">No change in this code.</div>;
  return (
    <div className="code">
      <div className="code-head">{head}</div>
      <MultiFileDiff
        oldFile={{ name: n, contents: a.code, lang }}
        newFile={{ name: n, contents: b.code, lang }}
        options={{ ...opts(theme), diffStyle: split ? "split" : "unified", expandUnchanged: false }}
      />
    </div>
  );
}

export function PatchView({ patch }: { patch: CodeLike }) {
  const theme = useTheme();
  const c = codeOf(patch);
  if (!c) return null;
  return (
    <div className="code">
      <PatchDiff patch={c.code} options={{ themeType: theme, overflow: "wrap", diffStyle: "unified" }} />
    </div>
  );
}

/** Mermaid is large; load it the first time a diagram is shown. */
export function Mermaid({ source }: { source: string }) {
  const theme = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string>();
  const [err, setErr] = useState<string>();
  useEffect(() => {
    let alive = true;
    import("mermaid")
      .then(async ({ default: m }) => {
        m.initialize({ startOnLoad: false, theme: theme === "dark" ? "dark" : "neutral", securityLevel: "strict", fontFamily: "Instrument Sans" });
        const r = await m.render(`m${id}`, source);
        if (alive) setSvg(r.svg);
      })
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [source, id, theme]);
  if (err) return <pre className="banner error">{err}</pre>;
  return svg ? <div className="mermaid" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="muted small">Drawing…</div>;
}

export function CopyText({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      title="Copy"
    >
      {ok ? "copied" : label ?? "copy"}
    </button>
  );
}
