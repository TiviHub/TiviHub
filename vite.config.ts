import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const desktop = mode === "desktop";

  return {
    base: desktop ? "./" : "/",
    plugins: [react()],
    server: {
      watch: { ignored: ["**/src-tauri/target/**", "**/dist/**"] },
      ...(desktop ? { host: "127.0.0.1", port: 1420, strictPort: true } : {}),
    },
    build: {
      sourcemap: false,
      outDir: desktop ? "dist/desktop" : "dist/site",
      rollupOptions: {
        input: desktop ? "app.html" : "index.html",
      },
    },
  };
});
