import { defineConfig } from "vite";

// Builds target GitHub Pages project sites (https://<user>.github.io/kairos/),
// so the bundle needs that prefix. The dev server does not: serving it under a
// prefix only means every tool that opens localhost lands on a 404.
export default defineConfig(({ command }) => ({
  base: command === "build" ? (process.env.BASE ?? "/kairos/") : "/",
  build: { target: "es2022", sourcemap: true },
}));
