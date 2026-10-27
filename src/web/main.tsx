import { createRoot } from "react-dom/client";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { applyTheme } from "./theme";
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

applyTheme();
createRoot(document.getElementById("root")!).render(<App />);
