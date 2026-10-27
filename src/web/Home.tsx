import { api, useData, useLiveReload } from "./api";
import { navigate } from "./nav";
import { ThemeToggle } from "./Chrome";
import { ArrowRight, MessageSquare, TriangleAlert } from "lucide-react";

const ago = (ms: number) => {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString();
};

export function Home() {
  const { data, error, reload } = useData(api.reviews, []);
  useLiveReload(() => reload());
  const reviews = [...(data?.reviews ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <div className="home">
      <header className="home-head">
        <span className="logo-mark" style={{ width: 22, height: 22, borderRadius: 6 }} />
        <h1>
          Reviews <em>· agent.review</em>
        </h1>
        <div className="tb-right">
          <ThemeToggle />
        </div>
      </header>
      <div className="home-sub">{data?.roots.join(" · ")}</div>
      {error && <div className="banner error">{error}</div>}
      {data && reviews.length === 0 && (
        <div className="empty">
          <h2>Nothing to review yet</h2>
          <p>
            An agent starts one with <code>agent-review init</code> or <code>agent-review from-git</code>. Or point the app at a folder
            that has some: <code>agent-review serve ~/work</code>.
          </p>
        </div>
      )}
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
                <span>{r.views.length} view{r.views.length === 1 ? "" : "s"}</span>
                <span>{ago(r.updatedAt)}</span>
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
    </div>
  );
}
