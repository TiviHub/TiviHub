// Scripted interactions with long-task capture. Usage: node scripts/perf/interactions.mjs --size M --runs 5
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { launchApp, waitForReady } from "./launch.mjs";
import { restoreProfile } from "./profile.mjs";
import { stats, writeResult } from "./results.mjs";

const TRAILING_MS = 500;

async function startCapture(page) {
  await page.evaluate(() => {
    window.__longTasks = [];
    window.__observer?.disconnect();
    window.__observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longTasks.push(entry.duration);
    });
    window.__observer.observe({ type: "longtask" });
  });
}

async function stopCapture(page) {
  await page.waitForTimeout(TRAILING_MS); // work queued by the interaction can finish after the visible result
  const tasks = await page.evaluate(() => {
    window.__observer.disconnect();
    return window.__longTasks;
  });
  return { count: tasks.length, maxMs: Math.round(Math.max(0, ...tasks)), totalMs: Math.round(tasks.reduce((a, b) => a + b, 0)) };
}

async function pickOption(page, comboboxName, optionName) {
  await page.getByRole("combobox", { name: comboboxName }).click();
  await page.getByRole("option", { name: optionName }).first().click();
}

// Proves the observer works in this WebView: a deliberate 120 ms block must show up as a long task.
async function calibrate(page) {
  await startCapture(page);
  // Scheduled as a page task: a block inside Runtime.evaluate is not reported as a long task.
  await page.evaluate(() => new Promise((done) => {
    setTimeout(() => {
      const end = performance.now() + 120;
      while (performance.now() < end);
      done(undefined);
    }, 0);
  }));
  const result = await stopCapture(page);
  if (result.count === 0 || result.maxMs < 100) throw new Error("Long-task capture did not see a deliberate 120 ms block.");
}

export const INTERACTIONS = [
  {
    name: "Open Movies",
    run: async (page) => {
      await page.getByRole("button", { name: "Movies" }).first().click();
      await page.getByRole("heading", { name: "Movies", level: 1 }).waitFor();
    },
  },
  {
    name: "Sort movies by year",
    run: async (page) => {
      await pickOption(page, "Sort movies", /Year/);
      await page.getByText("Sorting your catalog…").waitFor({ state: "detached" }).catch(() => undefined);
    },
  },
  {
    name: "Filter movies by category",
    run: async (page) => {
      await pickOption(page, "Filter by category", /Movies Category 3$/);
    },
  },
  {
    name: "Global search, type 3 characters",
    run: async (page) => {
      await page.getByRole("button", { name: "Search your library" }).first().click();
      const box = page.getByPlaceholder("What are you looking for?");
      await box.waitFor();
      await box.pressSequentially("Win", { delay: 80 });
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
    },
  },
  {
    name: "Open Live TV",
    run: async (page) => {
      await page.getByRole("button", { name: "Live TV" }).first().click();
      await page.getByRole("heading", { name: "Live TV", level: 1 }).waitFor();
    },
  },
  {
    name: "Open Home",
    run: async (page) => {
      await page.getByRole("button", { name: "Home" }).first().click();
      await page.waitForTimeout(100);
    },
  },
];

export async function interactionRun(size) {
  restoreProfile(size);
  const app = await launchApp();
  try {
    await waitForReady(app.page, app.startedAt);
    await app.page.waitForTimeout(2_000);
    await calibrate(app.page);
    const out = [];
    for (const interaction of INTERACTIONS) {
      await startCapture(app.page);
      const started = performance.now();
      await interaction.run(app.page);
      const wallMs = Math.round(performance.now() - started);
      out.push({ name: interaction.name, wallMs, ...(await stopCapture(app.page)) });
    }
    return out;
  } finally {
    await app.stop();
  }
}

export async function interactionBaseline(size, runs) {
  const all = [];
  for (let index = 0; index < runs; index += 1) {
    all.push(await interactionRun(size));
    console.log(`run ${index + 1}/${runs}: ${all[index].map((i) => `${i.name} max ${i.maxMs} ms`).join("; ")}`);
  }
  const summary = INTERACTIONS.map((interaction, position) => {
    const rows = all.map((run) => run[position]);
    return {
      name: interaction.name,
      wallMs: stats(rows.map((r) => r.wallMs)),
      longTaskMaxMs: stats(rows.map((r) => r.maxMs)),
      longTaskCount: stats(rows.map((r) => r.count)),
    };
  });
  return { size, runs: all, summary };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
  const size = arg("--size", "M");
  const result = await interactionBaseline(size, Number(arg("--runs", "5")));
  console.log(JSON.stringify(result.summary.map((s) => ({ name: s.name, wall: s.wallMs.median, maxLongTask: s.longTaskMaxMs.median, count: s.longTaskCount.median })), null, 1));
  console.log(`saved ${writeResult(`interactions-${size}`, result)}`);
}
