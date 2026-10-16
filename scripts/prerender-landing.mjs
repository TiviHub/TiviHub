import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const vite = await createServer({
  configFile: join(root, "vite.config.ts"),
  mode: "production",
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
});

try {
  const { default: LandingPage } = await vite.ssrLoadModule("/src/landing/LandingPage.tsx");
  const markup = renderToString(createElement(LandingPage));
  const output = join(root, "dist", "site", "index.html");
  const html = readFileSync(output, "utf8");
  const rootMarker = '<div id="root"></div>';

  if (!html.includes(rootMarker)) {
    throw new Error(`Could not find the landing page root in ${output}.`);
  }

  writeFileSync(output, html.replace(rootMarker, `<div id="root">${markup}</div>`));
} finally {
  await vite.close();
}
