import { api, useData, useLiveReload } from "./api";
import { navigate } from "./nav";

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
        <div className="brand">
          <span className="brand-mark" />
          agent.review
        </div>
        <div className="muted small">{data?.roots.join(" · ")}</div>
      </header>
      {error && <div className="banner error">{error}</div>}
      {data && reviews.length === 0 && (
        <div className="empty">
          <h2>No reviews here yet</h2>
          <p>
            An agent creates one by writing a <code>review.json</code> and <code>views/*.json</code>. Start one with{" "}
            <code>agent-review init</code>, or point the app at a folder that has some: <code>agent-review serve ~/work</code>.
          </p>
        </div>
      )}
      <ul className="review-list">
        {reviews.map((r) => (
          <li key={r.key}>
            <a
              href={`/r/${encodeURIComponent(r.key)}`}
              onClick={(e) => {
                e.preventDefault();
                navigate(`/r/${encodeURIComponent(r.key)}`);
              }}
            >
              <div className="rl-top">
                <span className={`status-pill s-${r.status}`}>{r.status}</span>
                <span className="rl-title">{r.title}</span>
              </div>
              <div className="rl-meta">
                <span>{r.views.map((v) => v.title).join(" · ") || "no views"}</span>
                {r.openComments > 0 && <span className="pill warn">{r.openComments} open</span>}
                {r.errors > 0 && <span className="pill bad">{r.errors} errors</span>}
                <span className="muted">{ago(r.updatedAt)}</span>
              </div>
              <div className="rl-path muted">{r.dir}</div>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
