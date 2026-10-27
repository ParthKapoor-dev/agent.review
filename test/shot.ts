// Dev helper: screenshot pages of a running server.  bun test/shot.ts <url> <out.png> [w] [h] [actions-json]
import { chromium } from "playwright-core";
import { readdirSync } from "node:fs";
const base = `${process.env.HOME}/.cache/ms-playwright`;
const dir = readdirSync(base).find((d) => d.startsWith("chromium-"))!;
const exe = `${base}/${dir}/chrome-linux64/chrome`;
const [url, out, w = "1500", h = "900", actions = "[]"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: (process.env.SCHEME as "dark") ?? "dark" });
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url!);
await page.waitForTimeout(1500);
for (const a of JSON.parse(actions) as [string, string][]) {
  if (a[0] === "key") await page.keyboard.press(a[1]);
  else if (a[0] === "click") await page.click(a[1]);
  else if (a[0] === "type") await page.keyboard.type(a[1]);
  else if (a[0] === "wait") await page.waitForTimeout(+a[1]);
  await page.waitForTimeout(450);
}
await page.screenshot({ path: out! });
if (errors.length) console.log("ERRORS:\n" + errors.join("\n"));
await browser.close();
