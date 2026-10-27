/** Tiny router helpers: "/" lists reviews, "/r/<key>" opens one. Query string holds the view state. */
export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? "replaceState" : "pushState"](null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
