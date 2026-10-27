import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { Home } from "./Home";
import { ReviewPage } from "./ReviewPage";

function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const on = () => setPath(location.pathname);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const m = /^\/r\/([^/]+)/.exec(path);
  return m ? <ReviewPage key={m[1]} reviewKey={decodeURIComponent(m[1]!)} /> : <Home />;
}

createRoot(document.getElementById("root")!).render(<App />);
