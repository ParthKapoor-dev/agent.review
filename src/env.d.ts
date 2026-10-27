declare module "*.html" {
  const html: import("bun").HTMLBundle;
  export default html;
}
declare module "*.css";
declare module "elkjs/lib/elk-worker.min.js";
