// Visual verification harness. Render -> screenshot -> inspect, at the two
// widths that actually matter. Never trust generated JSX by reading it.
//
// Usage: node tools/shoot.mjs <baseUrl> <outDir> [label]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] ?? "http://localhost:8799";
const outDir = process.argv[3] ?? "shots";
const label = process.argv[4] ?? "";

const ROUTES = [
  ["ward", "/ward/"],
  ["patient", "/patients/elena_petrova/"],
  ["live", "/demo/live/"],
];
const VIEWPORTS = [["desktop", 1280, 900], ["mobile", 375, 812]];

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const problems = [];

for (const [vpName, width, height] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  for (const [routeName, path] of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      const res = await page.goto(base + path, { waitUntil: "networkidle", timeout: 20000 });
      await page.waitForTimeout(700);
      const name = `${routeName}-${vpName}${label ? "-" + label : ""}.png`;
      await page.screenshot({ path: join(outDir, name), fullPage: true });
      // Horizontal overflow is the single most common responsive break.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      console.log(`${name}  http=${res?.status()}  overflowX=${overflow}px  consoleErrors=${errors.length}`);
      if (overflow > 0) problems.push(`${name}: horizontal overflow ${overflow}px`);
      for (const e of errors.slice(0, 3)) problems.push(`${name}: ${e.slice(0, 160)}`);
    } catch (err) {
      problems.push(`${routeName}/${vpName}: ${String(err).slice(0, 200)}`);
      console.log(`${routeName}-${vpName}  FAILED`);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();

if (problems.length) {
  console.log("\n--- PROBLEMS ---");
  for (const p of problems) console.log("  " + p);
} else {
  console.log("\nNo overflow, no console errors.");
}
