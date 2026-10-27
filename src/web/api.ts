import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment, Feedback, Issue, Mark, RReview, RView, ReviewSummary } from "../core/types";

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${(await r.json().catch(() => ({})))?.error ?? r.statusText}`);
  return r.json();
}
async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.json().catch(() => ({})))?.error ?? r.statusText}`);
  return r.json();
}

export const api = {
  reviews: () => get<{ roots: string[]; reviews: ReviewSummary[] }>("/api/reviews"),
  review: (key: string) => get<RReview | { failed: true; dir: string; issues: Issue[]; key: string }>(`/api/reviews/${key}`),
  view: (key: string, view: string) => get<{ view?: RView; issues: Issue[] }>(`/api/reviews/${key}/views/${view}`),
  feedback: (key: string) => get<Feedback>(`/api/reviews/${key}/feedback`),
  comment: (key: string, c: Partial<Comment>) => post<Comment>(`/api/reviews/${key}/comments`, c),
  setStatus: (key: string, id: string, status: Comment["status"]) => post(`/api/reviews/${key}/comments/${id}/status`, { status }),
  mark: (key: string, markKey: string, mark: Mark | null) => post(`/api/reviews/${key}/marks`, { key: markKey, mark }),
  fileUrl: (key: string, path: string) => `/api/reviews/${key}/file?path=${encodeURIComponent(path)}`,
};

/** Calls `onChange(key)` whenever the server says files changed. Reconnects. */
export function useLiveReload(onChange: (key?: string) => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  useEffect(() => {
    let ws: WebSocket | undefined;
    let stop = false;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "changed") cb.current(m.key);
        } catch {}
      };
      ws.onclose = () => {
        if (!stop) retry = setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      stop = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);
}

/** fetch-on-deps with a manual reload; keeps the last good value while reloading. */
export function useData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const seq = useRef(0);
  const reload = useCallback(() => {
    const n = ++seq.current;
    load()
      .then((d) => n === seq.current && (setData(d), setError(undefined)))
      .catch((e) => n === seq.current && setError(String(e.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(reload, [reload]);
  return { data, error, reload, setData };
}
