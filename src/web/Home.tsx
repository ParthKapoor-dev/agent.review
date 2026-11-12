import { useEffect, useState } from "react";
import { ArrowRight, FolderGit2, GitBranch, MessageSquare, TriangleAlert } from "lucide-react";
import { api, useData, useLiveReload } from "./api";
import { navigate } from "./nav";
import { ThemeToggle } from "./Chrome";
import { Orb } from "./Orb";
import type { ReviewSummary, WorkspaceInfo } from "../core/types";

const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
};

const readWs = () => new URLSearchParams(location.search).get("ws") ?? "";

/** Reviews grouped by workspace (git repository), with a switcher to look at one at a time. */
export function Home() {
  const { data, error, reload } = useData(api.reviews, []);
  useLiveReload(() => reload());
  const [ws, setWs] = useState(readWs);
  useEffect(() => {
    const on = () => setWs(readWs());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const pick = (k: string) => {
    setWs(k);
    navigate(k ? `/?ws=${encodeURIComponent(k)}` : "/", true);
  };

  const workspaces = data?.workspaces ?? [];
  const reviews = [...(data?.reviews ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  const shown = ws ? workspaces.filter((w) => w.key === ws) : workspaces;

  return (
    <div className="home">
      <header className="home-head">
        <Orb size={52} mood="idle" label="agent.review" />
        <h1>
          Reviews <em>· agent.review</em>
        </h1>
        <div className="tb-right">
          <ThemeToggle />
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      {workspaces.length > 1 && (
        <nav className="ws-switch">
          <button className={!ws ? "on" : ""} onClick={() => pick("")}>
            All <span>{reviews.length}</span>
          </button>
          {workspaces.map((w) => (
            <button key={w.key} className={ws === w.key ? "on" : ""} onClick={() => pick(w.key)} title={w.path}>
              {w.name} <span>{w.reviews ?? 0}</span>
            </button>
          ))}
        </nav>
      )}

      {data && workspaces.length === 0 && (
        <div className="empty">
          <h2>No workspaces yet</h2>
          <p>
            A workspace is a git repository. Add one with <code>agent-review workspace add ~/path/to/repo</code>; an agent's
            first <code>agent-review init</code> in a repo adds it too.
          </p>
        </div>
      )}

      {shown.map((w) => (
        <WorkspaceSection key={w.key} w={w} reviews={reviews.filter((r) => r.workspace === w.key)} />
      ))}
    </div>
  );
}

function WorkspaceSection({ w, reviews }: { w: WorkspaceInfo; reviews: ReviewSummary[] }) {
  return (
    <section className="ws">
      <div className="ws-head">
        <FolderGit2 size={18} className="ws-icon" />
        <h2>{w.name}</h2>
        {w.branch && (
          <span className="ws-branch">
            <GitBranch size={12} /> {w.branch}
          </span>
        )}
        <span className="ws-path">{w.path}</span>
      </div>
      {reviews.length === 0 ? (
        <p className="ws-empty">
          No reviews in this repository yet. An agent starts one with <code>agent-review init &lt;folder&gt;</code>.
        </p>
      ) : (
        <ul className="review-list">
          {reviews.map((r) => (
            <li key={r.key}>
              <a
                href={`/r/${encodeURIComponent(r.key)}`}
                title={r.dir}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/r/${encodeURIComponent(r.key)}`);
                }}
              >
                <span className="rl-title">{r.title}</span>
                <span className="rl-meta">
                  <span className={`status s-${r.status}`}>
                    <i />
                    {r.status.replace("-", " ")}
                  </span>
                  <span>
                    {r.views.length} view{r.views.length === 1 ? "" : "s"}
                  </span>
                  <span>{ago(r.updatedAt)}</span>
                  <span className="rl-dir">{r.dir.slice(w.path.length + 1) || "."}</span>
                </span>
                <span className="rl-side">
                  {r.openComments > 0 && (
                    <span className="tb-chip warn" title="Open comments">
                      <MessageSquare size={13} /> {r.openComments}
                    </span>
                  )}
                  {r.errors > 0 && (
                    <span className="tb-chip bad" title="Errors in the agent's files">
                      <TriangleAlert size={13} /> {r.errors}
                    </span>
                  )}
                  <ArrowRight size={16} className="muted" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
