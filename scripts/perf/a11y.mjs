// Automated accessibility scan (axe-core) on 8 screens in both themes, against the seeded S profile.
// Usage: node scripts/perf/a11y.mjs
import { AxeBuilder } from "@axe-core/playwright";
import { launchApp, waitForReady } from "./launch.mjs";
import { restoreProfile } from "./profile.mjs";
import { writeResult } from "./results.mjs";

const SCREENS = [
  { name: "Home", open: (page) => page.getByRole("button", { name: "Home" }).first().click() },
  { name: "Live TV", open: (page) => page.getByRole("button", { name: "Live TV" }).first().click() },
  { name: "Movies", open: (page) => page.getByRole("button", { name: "Movies" }).first().click() },
  { name: "Series", open: (page) => page.getByRole("button", { name: "Series" }).first().click() },
  { name: "Library", open: (page) => page.getByRole("button", { name: "Library" }).first().click() },
  { name: "Downloads", open: (page) => page.getByRole("button", { name: "Downloads" }).first().click() },
  { name: "Settings", open: (page) => page.getByRole("button", { name: "Open settings" }).first().click() },
  {
    name: "Playback dialog",
    open: async (page) => {
      // Live TV plays inline; the dialog is used for movies and episodes.
      await page.getByRole("button", { name: "Movies" }).first().click();
      await page.getByRole("button", { name: /^View details for / }).first().click();
      await page.getByRole("button", { name: /Watch movie|Continue watching/ }).first().click();
      await page.getByRole("dialog").first().waitFor();
    },
    close: (page) => page.keyboard.press("Escape"),
  },
];

const IMPACTS = ["critical", "serious", "moderate", "minor"];

export async function scan() {
  restoreProfile("S");
  const app = await launchApp();
  const results = [];
  try {
    const { page } = app;
    await waitForReady(page, app.startedAt);
    await page.waitForTimeout(1_000);
    for (const theme of ["dark", "light"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      for (const screen of SCREENS) {
        await screen.open(page);
        await page.waitForTimeout(600);
        const axe = await new AxeBuilder({ page }).analyze();
        const byImpact = Object.fromEntries(IMPACTS.map((impact) => [impact, axe.violations.filter((v) => v.impact === impact).length]));
        results.push({
          screen: screen.name,
          theme,
          byImpact,
          violations: axe.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.length,
            example: v.nodes[0]?.target?.join(" "),
          })),
        });
        await screen.close?.(page);
        await page.waitForTimeout(200);
      }
    }
  } finally {
    await app.stop();
  }
  return results;
}

const results = await scan();
console.table(results.map((r) => ({ screen: r.screen, theme: r.theme, ...r.byImpact })));
console.log(`saved ${writeResult("a11y-axe", { results })}`);
