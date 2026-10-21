// Keyboard-only walkthrough against the seeded S profile. Each flow reports pass or fail with the failing step.
// Usage: node scripts/perf/keyboard.mjs
import { launchApp, waitForReady } from "./launch.mjs";
import { restoreProfile } from "./profile.mjs";
import { writeResult } from "./results.mjs";

const focusedName = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "(body)";
    // Icon ligatures are aria-hidden, so leave them out of the name a screen reader would use.
    const clone = el.cloneNode(true);
    clone.querySelectorAll("[aria-hidden='true']").forEach((node) => node.remove());
    return el.getAttribute("aria-label") || clone.textContent?.trim().slice(0, 40) || el.tagName.toLowerCase();
  });

async function tabUntil(page, predicate, max) {
  const seen = [];
  for (let step = 0; step < max; step += 1) {
    await page.keyboard.press("Tab");
    const name = await focusedName(page);
    seen.push(name);
    if (predicate(name)) return seen;
  }
  return seen;
}

const insideDialog = (page, selector) =>
  page.evaluate((css) => Boolean(document.activeElement?.closest(css)), selector);

const flows = [
  {
    name: "Tab reaches Home, Movies and Open settings",
    run: async (page) => {
      const wanted = new Set(["Home", "Movies", "Open settings"]);
      const reached = new Set();
      const seen = await tabUntil(page, (name) => {
        if (wanted.has(name)) reached.add(name);
        return reached.size === wanted.size;
      }, 80);
      return reached.size === wanted.size ? null : `reached only ${[...reached].join(", ") || "none"}; saw ${seen.slice(0, 12).join(" | ")}`;
    },
  },
  {
    name: "Ctrl+K opens search and Escape closes it, returning focus",
    run: async (page) => {
      await page.getByRole("button", { name: "Movies" }).first().focus();
      await page.keyboard.press("Control+K");
      const search = page.getByPlaceholder("What are you looking for?");
      if (!(await search.isVisible().catch(() => false))) return "Ctrl+K did not open the search dialog";
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      if (await search.isVisible().catch(() => false)) return "Escape did not close the search dialog";
      return (await focusedName(page)) === "(body)" ? "focus was lost to the page body after closing" : null;
    },
  },
  {
    name: "Add source dialog: Tab stays inside, Escape closes it",
    run: async (page) => {
      await page.getByRole("button", { name: "Open settings" }).first().click();
      await page.getByRole("button", { name: /^Add (?:another )?source$/ }).click();
      const dialog = page.locator("form.dialog-form");
      await dialog.waitFor();
      for (let i = 0; i < 25; i += 1) {
        await page.keyboard.press("Tab");
        if (!(await insideDialog(page, '[role="dialog"]'))) return `focus left the dialog after ${i + 1} Tab presses`;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      return (await dialog.count()) === 0 ? null : "Escape did not close the dialog";
    },
  },
  {
    name: "Playback dialog: Tab stays inside, Escape closes it",
    run: async (page) => {
      await page.getByRole("button", { name: "Movies" }).first().click();
      await page.getByRole("button", { name: /^View details for / }).first().click();
      await page.getByRole("button", { name: /Watch movie|Continue watching/ }).first().click();
      await page.getByRole("dialog").first().waitFor();
      for (let i = 0; i < 25; i += 1) {
        await page.keyboard.press("Tab");
        if (!(await insideDialog(page, '[role="dialog"]'))) return `focus left the dialog after ${i + 1} Tab presses`;
      }
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      return (await page.getByRole("dialog").count()) === 0 ? null : "Escape did not close the playback dialog";
    },
  },
];

restoreProfile("S");
const app = await launchApp();
const results = [];
try {
  const { page } = app;
  await waitForReady(page, app.startedAt);
  await page.waitForTimeout(1_000);
  await page.emulateMedia({ reducedMotion: "reduce" }); // every flow also runs with reduced motion on
  for (const flow of flows) {
    let failure;
    try {
      failure = await flow.run(page);
    } catch (error) {
      failure = `error: ${error.message.split("\n")[0]}`;
    }
    results.push({ flow: flow.name, pass: failure === null, failure });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Home" }).first().click().catch(() => undefined);
  }
} finally {
  await app.stop();
}
console.table(results);
console.log(`saved ${writeResult("keyboard", { results })}`);
